import { GatewayError, type GatewayErrorCode, type ProviderId } from '@byway/contracts';
import type { Redactor } from './redact.ts';

/**
 * Whether a failed attempt may have been billed (ADR-0091). 'none': the provider certainly did no paid work. 'maybe': the
 * request may have been written and the work done, so sending it again may pay twice. Retries are decided from this one
 * reading (withRetries): 'none' failures are retried with backoff; after a 'maybe', a completion or an image is sent
 * once more and a queue job never is.
 */
export type Billing = 'none' | 'maybe';

/** A GatewayError with what classification found: the provider's retry-after hint, and whether the attempt was billed. */
export type ClassifiedError = GatewayError & { retryAfterMs?: number; billing?: Billing };

/**
 * Socket and DNS failures that happen before a request is written: nothing reached the provider. Node's fetch (undici)
 * raises them as TypeError('fetch failed') with the code on the cause, and the SDKs wrap that again, so the code is
 * looked for along the whole cause chain.
 */
const BEFORE_WRITE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'EHOSTUNREACH', 'ENETUNREACH']);
/** Failures after the request may have been written: the provider may have done (and billed) the work. */
const AFTER_WRITE_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
/**
 * Error names (or class names: the SDKs do not set `name`) for a request that got no answer: timeouts and aborts after it
 * was sent, and the SDKs' connection error when it carries no cause to read.
 */
const AFTER_WRITE_NAMES = new Set(['AbortError', 'TimeoutError', 'APIConnectionTimeoutError', 'APIConnectionError', 'FetchError']);
/**
 * A stream that ended without its terminal event (the Anthropic SDK's messages for a response cut off before
 * `message_stop`, and the words byway's stream readers use for an error chunk, a missing finishing chunk or a stream
 * that stalled: providers/stream.ts, ADR-0111): the provider answered 200 and may have billed what it generated.
 */
const ENDED_EARLY = /stream ended without producing|request ended without sending any chunks/;

function classify(status: number): { code: GatewayErrorCode; retryable: boolean } {
  if (status === 429) return { code: 'rate-limited', retryable: true };
  if (status === 401) return { code: 'no-credentials', retryable: false };
  if (status === 408 || status >= 500) return { code: 'provider-error', retryable: true };
  if (status === 403) return { code: 'provider-error', retryable: false };
  if (status >= 400) return { code: 'invalid-request', retryable: false };
  return { code: 'provider-error', retryable: false };
}

/**
 * Error types in a provider's error body. A streamed response can fail after the HTTP 200 (Anthropic sends an
 * `overloaded_error` event), so the SDK raises an error with no status; its body type still says what happened.
 */
const BODY_TYPES: Record<string, { code: GatewayErrorCode; retryable: boolean }> = {
  overloaded_error: { code: 'provider-error', retryable: true },
  api_error: { code: 'provider-error', retryable: true },
  rate_limit_error: { code: 'rate-limited', retryable: true },
  invalid_request_error: { code: 'invalid-request', retryable: false },
  authentication_error: { code: 'no-credentials', retryable: false },
  permission_error: { code: 'provider-error', retryable: false },
  not_found_error: { code: 'invalid-request', retryable: false },
  request_too_large: { code: 'invalid-request', retryable: false },
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function bodyType(err: unknown): string | undefined {
  const body = (err as { error?: { type?: unknown; error?: { type?: unknown } } }).error;
  const t = body?.error?.type ?? body?.type;
  return typeof t === 'string' ? t : undefined;
}

/** The error and its causes, outermost first, cycle-safe and bounded. */
function* chain(err: unknown): Generator<Record<string, unknown>> {
  const seen = new Set<unknown>();
  for (let e: unknown = err, depth = 0; isObject(e) && !seen.has(e) && depth < 10; e = e.cause, depth++) {
    seen.add(e);
    yield e;
  }
}

const nameOf = (e: Record<string, unknown>): string[] => [typeof e.name === 'string' ? e.name : '', (e.constructor as { name?: string } | undefined)?.name ?? ''];

/**
 * True when an HTTP error carries the provider's own error body, so the provider itself refused the work: the SDKs'
 * parsed JSON body (`error` for Anthropic, OpenAI and OpenRouter, `body` for fal), or Google's, which its SDK puts in the
 * message as JSON with a canonical status (UNAVAILABLE). A page from a proxy in between has none: the SDKs leave the
 * body unset, and Google's SDK makes one up from the HTTP status text ("Service Unavailable").
 */
function hasProviderBody(e: Record<string, unknown>): boolean {
  if (isObject(e.error) || isObject(e.body)) return true;
  if (typeof e.message !== 'string' || !e.message.startsWith('{')) return false;
  try {
    const status = (JSON.parse(e.message) as { error?: { status?: unknown } })?.error?.status;
    return typeof status === 'string' && /^[A-Z][A-Z_]+$/.test(status);
  } catch {
    return false;
  }
}

/** Whether the failure looks like a network failure (a socket or DNS code, a timeout or abort) anywhere in its chain. */
function networkSignature(err: unknown): Billing | undefined {
  for (const e of chain(err)) {
    const code = typeof e.code === 'string' ? e.code : '';
    if (BEFORE_WRITE_CODES.has(code)) return 'none';
    if (AFTER_WRITE_CODES.has(code)) return 'maybe';
  }
  for (const e of chain(err)) {
    const names = nameOf(e);
    // An SDK connection error is judged by its cause when it has one (the codes above); without one, nothing answered.
    if (names.includes('APIConnectionError') && isObject(e.cause)) continue;
    if (names.some((n) => AFTER_WRITE_NAMES.has(n))) return 'maybe';
  }
  return undefined;
}

/**
 * Whether a failed attempt may have been billed: the one reading every provider path and every retry decision uses
 * (ADR-0091). An error may state it outright (`billing`), as the gateway's own code does where it knows.
 * - none: an answer carrying the provider's own error body (429, 500, 503, 529, any 4xx), an error event in a stream
 *   (overloaded_error, api_error), or a connection that failed before the request was written (ECONNREFUSED, ENOTFOUND,
 *   EAI_AGAIN, UND_ERR_CONNECT_TIMEOUT).
 * - maybe: no answer after the request may have been written (ECONNRESET, EPIPE, UND_ERR_SOCKET, timeouts, aborts);
 *   408, 502 and 504, or any 5xx without a provider body (a proxy answered, not the provider); a stream that ended
 *   without its terminal event; and anything this cannot read, because only 'none' permits a blind re-send.
 * Treating a provider-bodied 5xx and a mid-stream error event as unbilled is today's behaviour and costs at most one
 * attempt (ADR-0091). Two providers document the 5xx half. fal, read again on 2026-10-18: "Server errors (HTTP 500+)
 * are never charged" (fal.ai/docs/documentation/model-apis/faq; its pricing page says the same), and fal's queue jobs
 * are never sent blind again anyway (BILLABLE_JOB). Google's billing page, read on 2026-10-22
 * (ai.google.dev/gemini-api/docs/billing): a request that fails with a 400 or 500 error is not charged for its tokens;
 * it says nothing about timeouts or aborted calls (ADR-0109's Later note of 2026-10-22, "Google's billing page").
 * Anthropic's errors and streaming pages, OpenAI's error codes and pricing pages, Google's troubleshooting, API errors
 * and pricing pages, and OpenRouter's errors page say nothing about whether a failed request is billed. OpenRouter's
 * says that when a model answers with no content, "you may still be charged for the prompt processing cost by the
 * upstream provider"; such an answer is a 200 with its usage, which is ledgered, not an error. So for Anthropic, OpenAI
 * and OpenRouter the 5xx reading is still an assumption, and so is the mid-stream error event (read as unbilled on
 * Anthropic's streams only, ADR-0111); the first live runs' ledger, against each provider's usage records, is what can
 * settle them (backlog).
 */
export function billingOf(err: unknown): Billing {
  const stated = isObject(err) ? err.billing : undefined;
  if (stated === 'none' || stated === 'maybe') return stated;
  if (!isObject(err)) return 'maybe';
  if (typeof err.status === 'number') {
    const status = err.status;
    if (status === 408 || status === 502 || status === 504) return 'maybe';
    if (status >= 500) return hasProviderBody(err) ? 'none' : 'maybe';
    return 'none';
  }
  if (bodyType(err) !== undefined) return 'none';
  return networkSignature(err) ?? 'maybe';
}

/**
 * A call byway cut off because its run was ending (SpendContext.operation.stop; ADR-0111). Never retryable: its run has
 * ended, and nothing is sent again. `billing` says how it is counted, as for any failed attempt: 'none' when nothing
 * billable reached the provider (the stop came first, or fal removed the queued job before it ran: released, counting
 * nothing), 'maybe' when the provider may have done (and billed) some of the work (counted at its estimate, as
 * interrupted, until it is cleared in Settings). `billed` is false only for 'none'.
 */
export type CutOffError = ClassifiedError & { cutOff: true };

export function cutOffError(provider: ProviderId, billing: Billing, detail?: string): CutOffError {
  const why = detail ? ` (${detail})` : '';
  const message =
    billing === 'none'
      ? `byway stopped this ${provider} call because its run was ending, before ${provider} did any paid work${why}.`
      : `byway cut off this ${provider} call because its run was ending${why}. ${provider} may have billed the work it did, so the call is counted at its estimate, as "may have been billed", and listed in Settings under Spending records until you clear it.`;
  const err = new GatewayError('byway-failure', message.slice(0, 2000), false, billing === 'none' ? { billed: false } : {}) as CutOffError;
  err.billing = billing;
  err.cutOff = true;
  return err;
}

/** Whether an error is a call byway cut off (cutOffError), by its mark, so it survives being passed along. */
export const isCutOff = (e: unknown): e is CutOffError => isObject(e) && e.cutOff === true && e instanceof GatewayError;

function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown }).headers;
  let value: string | null | undefined;
  if (headers instanceof Headers) value = headers.get('retry-after');
  else if (headers && typeof headers === 'object') value = (headers as Record<string, string | undefined>)['retry-after'];
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/**
 * Map anything a provider SDK throws to a GatewayError. The SDKs (Anthropic, OpenAI, Google) all expose an HTTP
 * `status` on API errors and name their connection errors, so classification reads those fields rather than importing
 * each SDK's classes. Retryability comes from the same reading as billing: an HTTP status as mapped below, a stream
 * error event by its type, a network failure found anywhere along the cause chain (a reset wrapped by undici is a
 * network failure, which the old top-level check missed), and a stream that ended early. Anything else is not retried.
 * Messages pass through the redactor: providers sometimes echo part of a key back.
 */
export function toGatewayError(err: unknown, provider: ProviderId, redact: Redactor): GatewayError {
  if (err instanceof GatewayError) return err;
  const e = (err ?? {}) as { status?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : undefined;
  const billing = billingOf(err);
  const byBody = status === undefined ? BODY_TYPES[bodyType(err) ?? ''] : undefined;
  const transient = status === undefined && (networkSignature(err) !== undefined || (typeof e.message === 'string' && ENDED_EARLY.test(e.message)));
  const { code, retryable } = status !== undefined ? classify(status) : (byBody ?? (transient ? { code: 'provider-error' as const, retryable: true } : { code: 'provider-error' as const, retryable: false }));
  const detail = typeof e.message === 'string' && e.message ? e.message : String(err);
  const prefix = status !== undefined ? `${provider} returned ${status}` : `${provider} call failed`;
  const out: ClassifiedError = new GatewayError(code, redact(`${prefix}: ${detail}`.slice(0, 2000)), retryable);
  out.billing = billing;
  const hint = retryAfterMs(err);
  if (hint !== undefined) out.retryAfterMs = hint;
  return out;
}
