import { GatewayError } from '@byway/contracts';
import { describe, expect, it, vi } from 'vitest';
import { billingOf, toGatewayError } from '../src/errors.ts';
import { makeRedactor } from '../src/redact.ts';
import { BILLABLE_CALL, BILLABLE_JOB, FREE_READ, withRetries } from '../src/retry.ts';

/**
 * F03: one decision on whether a failed attempt may have been billed (ADR-0091). 'none' means the provider certainly did
 * no paid work: it answered with its own error body, sent an error event in the stream, or the connection failed before
 * the request was written. 'maybe' means the request may have been written and the work done: no answer came, a gateway
 * between us answered (408, 502, 504, or a 5xx with no provider body), or the stream ended without its terminal event.
 */

/** Node's fetch (undici) wraps the socket's error in TypeError('fetch failed'), with the code only on the cause. */
const undici = (code: string) => new TypeError('fetch failed', { cause: Object.assign(new Error(`${code} socket`), { code }) });
/** The Anthropic and OpenAI SDKs wrap a failed fetch in their own APIConnectionError, with the fetch error as cause. */
class APIConnectionError extends Error {}
class APIConnectionTimeoutError extends APIConnectionError {}
/** An SDK API error: the status, and `error` holding the parsed JSON body (undefined when the body was not JSON). */
const sdkError = (status: number, body?: unknown) => Object.assign(new Error(`${status} status code`), { status, error: body });
const anthropicBody = (type: string) => ({ type: 'error', error: { type, message: type } });
/** fal's ApiError: `body` is the parsed JSON body. */
const falError = (status: number, body?: unknown) => Object.assign(new Error(`HTTP ${status}`), { status, ...(body !== undefined ? { body } : {}) });
/** Google's SDK puts the JSON body in the message; for a non-JSON answer it makes one up from the status text. */
const googleError = (status: number, body: unknown) => Object.assign(new Error(JSON.stringify(body)), { status });
/** An error event in a stream that had already answered 200 (the Anthropic SDK raises it with no status). */
const streamEvent = (type: string) => Object.assign(new Error(type), { error: anthropicBody(type) });

const NONE: [string, unknown][] = [
  ['undici ECONNREFUSED (nothing was written)', undici('ECONNREFUSED')],
  ['undici ENOTFOUND', undici('ENOTFOUND')],
  ['undici EAI_AGAIN', undici('EAI_AGAIN')],
  ['undici UND_ERR_CONNECT_TIMEOUT', undici('UND_ERR_CONNECT_TIMEOUT')],
  ['an SDK connection error over a refused connection', new APIConnectionError('Connection error.', { cause: undici('ECONNREFUSED') })],
  ['429 with the provider body', sdkError(429, anthropicBody('rate_limit_error'))],
  ['500 with the provider body', sdkError(500, anthropicBody('api_error'))],
  ['503 with the provider body', sdkError(503, { message: 'unavailable', type: 'server_error' })],
  ['529 with the provider body', sdkError(529, anthropicBody('overloaded_error'))],
  ['400 with the provider body', sdkError(400, anthropicBody('invalid_request_error'))],
  ['an overloaded_error stream event', streamEvent('overloaded_error')],
  ['an api_error stream event', streamEvent('api_error')],
  ["503 with fal's error body", falError(503, { detail: 'Service temporarily unavailable' })],
  ["503 with Google's error body", googleError(503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } })],
];

const MAYBE: [string, unknown][] = [
  ['undici ECONNRESET (the request may have been written)', undici('ECONNRESET')],
  ['undici EPIPE', undici('EPIPE')],
  ['undici UND_ERR_SOCKET', undici('UND_ERR_SOCKET')],
  ['a bare ECONNRESET', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
  ['an SDK connection error over a reset', new APIConnectionError('Connection error.', { cause: undici('ECONNRESET') })],
  ['an SDK timeout', new APIConnectionTimeoutError('Request timed out.')],
  ['an AbortError', Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })],
  ['a TimeoutError', Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })],
  ['408', sdkError(408, anthropicBody('timeout_error'))],
  ['502 even with a body', sdkError(502, anthropicBody('api_error'))],
  ['504 even with a body', falError(504, { detail: 'Gateway Timeout' })],
  ['503 with a bare HTML body', sdkError(503)],
  ['500 with no body', falError(500)],
  ["503 whose body Google's SDK made up from the status text", googleError(503, { error: { code: 503, message: '<html>', status: 'Service Unavailable' } })],
  ['a stream that ended without message_stop', new Error('stream ended without producing a Message with role=assistant')],
  ['a stream that sent nothing', new Error('request ended without sending any chunks')],
  ['an unknown failure', new Error('something odd')],
];

describe('billingOf: whether a failed attempt may have been billed (F03)', () => {
  it.each(NONE)('%s: none', (_label, err) => {
    expect(billingOf(err)).toBe('none');
  });

  it.each(MAYBE)('%s: maybe', (_label, err) => {
    expect(billingOf(err)).toBe('maybe');
  });

  it('takes an explicit statement from the code that knows', () => {
    expect(billingOf(Object.assign(new Error('x'), { billing: 'none' }))).toBe('none');
    expect(billingOf(Object.assign(new Error('x'), { status: 400, billing: 'maybe' }))).toBe('maybe');
  });

  it('survives a cause cycle', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b', { cause: a });
    a.cause = b;
    expect(billingOf(a)).toBe('maybe');
  });
});

describe('toGatewayError derives retryability from the same reading (F03)', () => {
  const redact = makeRedactor({});

  it('classes a reset wrapped by undici as a retryable failure that may have been billed (it was non-retryable)', () => {
    const e = toGatewayError(undici('ECONNRESET'), 'anthropic', redact) as GatewayError & { billing?: string };
    expect([e.code, e.retryable, e.billing]).toEqual(['provider-error', true, 'maybe']);
  });

  it('classes a refused connection, wrapped or bare, as retryable and not billed', () => {
    for (const err of [undici('ECONNREFUSED'), new APIConnectionError('Connection error.', { cause: undici('ECONNREFUSED') })]) {
      const e = toGatewayError(err, 'openai', redact) as GatewayError & { billing?: string };
      expect([e.code, e.retryable, e.billing]).toEqual(['provider-error', true, 'none']);
    }
  });

  it('classes a stream that ended early and an SDK timeout as retryable, billing maybe', () => {
    for (const err of [new Error('stream ended without producing a Message with role=assistant'), new APIConnectionTimeoutError('Request timed out.')]) {
      const e = toGatewayError(err, 'anthropic', redact) as GatewayError & { billing?: string };
      expect([e.retryable, e.billing]).toEqual([true, 'maybe']);
    }
  });

  it('keeps an unknown failure non-retryable', () => {
    const e = toGatewayError(new Error('something odd'), 'anthropic', redact) as GatewayError & { billing?: string };
    expect([e.code, e.retryable, e.billing]).toEqual(['provider-error', false, 'maybe']);
  });

  it('keeps the HTTP mapping: 503 with a body is retried without limit, a bare 502 is retryable but maybe billed', () => {
    const withBody = toGatewayError(sdkError(503, anthropicBody('api_error')), 'anthropic', redact) as GatewayError & { billing?: string };
    expect([withBody.retryable, withBody.billing]).toEqual([true, 'none']);
    const bare = toGatewayError(sdkError(502), 'anthropic', redact) as GatewayError & { billing?: string };
    expect([bare.retryable, bare.billing]).toEqual([true, 'maybe']);
  });
});

describe('withRetries: an attempt that may have been billed is sent again at most as the call allows (F03)', () => {
  const opts = (sleep: (ms: number) => Promise<void>) => ({ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000, sleep, random: () => 0.5 });
  const maybe = (n: number) => Object.assign(new GatewayError('provider-error', `reset ${n}`, true), { billing: 'maybe' as const });
  const none = (n: number) => Object.assign(new GatewayError('provider-error', `overloaded ${n}`, true), { billing: 'none' as const });

  it('a completion or image is sent once more after a maybe, and fails on the second', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw maybe(calls);
      }, opts(sleep), BILLABLE_CALL),
    ).rejects.toThrow('reset 2');
    expect(calls).toBe(2);
  });

  it('none failures keep the full backoff, with the one maybe re-send among them', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    const result = await withRetries(async () => {
      calls += 1;
      if (calls === 1) throw none(calls);
      if (calls === 2) throw maybe(calls);
      if (calls === 3) throw none(calls);
      return 'ok';
    }, opts(sleep), BILLABLE_CALL);
    expect([result, calls]).toEqual(['ok', 4]);
  });

  it('a queue job submission is never sent again after a maybe', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw maybe(calls);
      }, opts(sleep), BILLABLE_JOB),
    ).rejects.toThrow('reset 1');
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('a free read (a status poll, a download) is retried whatever the billing', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await withRetries(async () => {
      calls += 1;
      if (calls < 4) throw maybe(calls);
      return 'ok';
    }, opts(sleep), FREE_READ);
    expect(calls).toBe(4);
  });
});
