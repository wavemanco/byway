import { GatewayError, type GatewayErrorCode, type ProviderId } from '@byway/contracts';
import type { Redactor } from './redact.ts';

/** A GatewayError that may carry the provider's retry-after hint. */
export type RetryHintedError = GatewayError & { retryAfterMs?: number };

/** Network-level failure names and codes from the SDKs and Node, all worth retrying. */
const TRANSIENT_NAMES = new Set(['APIConnectionError', 'APIConnectionTimeoutError', 'TimeoutError', 'AbortError', 'FetchError']);
const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);

function classify(status: number | undefined): { code: GatewayErrorCode; retryable: boolean } {
  if (status === undefined) return { code: 'provider-error', retryable: false };
  if (status === 429) return { code: 'rate-limited', retryable: true };
  if (status === 401) return { code: 'no-credentials', retryable: false };
  if (status === 408 || status >= 500) return { code: 'provider-error', retryable: true };
  if (status === 403) return { code: 'provider-error', retryable: false };
  if (status >= 400) return { code: 'invalid-request', retryable: false };
  return { code: 'provider-error', retryable: false };
}

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
 * each SDK's classes. Messages pass through the redactor: providers sometimes echo part of a key back.
 */
export function toGatewayError(err: unknown, provider: ProviderId, redact: Redactor): GatewayError {
  if (err instanceof GatewayError) return err;
  const e = (err ?? {}) as { status?: unknown; name?: unknown; code?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : undefined;
  const transient =
    status === undefined &&
    ((typeof e.name === 'string' && TRANSIENT_NAMES.has(e.name)) || (typeof e.code === 'string' && TRANSIENT_CODES.has(e.code)));
  const { code, retryable } = transient ? { code: 'provider-error' as const, retryable: true } : classify(status);
  const detail = typeof e.message === 'string' && e.message ? e.message : String(err);
  const prefix = status !== undefined ? `${provider} returned ${status}` : `${provider} call failed`;
  const out: RetryHintedError = new GatewayError(code, redact(`${prefix}: ${detail}`.slice(0, 2000)), retryable);
  const hint = retryAfterMs(err);
  if (hint !== undefined) out.retryAfterMs = hint;
  return out;
}
