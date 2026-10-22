import { GatewayError } from '@byway/contracts';
import { describe, expect, it, vi } from 'vitest';
import { toGatewayError } from '../src/errors.ts';
import { makeRedactor } from '../src/redact.ts';
import { BILLABLE_CALL, withRetries } from '../src/retry.ts';

const apiError = (status: number, message: string, headers?: Record<string, string>) =>
  Object.assign(new Error(message), { status, ...(headers ? { headers: new Headers(headers) } : {}) });

describe('makeRedactor', () => {
  it('removes configured key values and well-known key shapes', () => {
    const redact = makeRedactor({ ANTHROPIC_API_KEY: 'sk-ant-api03-SECRETSECRETSECRET', OTHER: 'not-a-key' });
    const text = 'bad key sk-ant-api03-SECRETSECRETSECRET and sk-proj-ABCDEFGHIJKLMNOPQRSTUV and AIzaSyA1234567890abcdefghijk and sk-or-v1-0123456789abcdef';
    const out = redact(text);
    expect(out).not.toMatch(/SECRET|ABCDEFGHIJ|AIzaSy|0123456789abcdef/);
    expect(out).toContain('[redacted]');
  });

  it('removes fal.ai keys (key id, colon, secret) even when they are not in the environment', () => {
    const out = makeRedactor({})('Authorization: Key 0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff rejected');
    expect(out).toBe('Authorization: Key [redacted] rejected');
    // In a URL or a form body the colon is written %3A.
    expect(makeRedactor({})('key=0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6%3A00112233445566778899aabbccddeeff&x=1')).toBe('key=[redacted]&x=1');
  });

  it('removes a bearer token whatever the case of "Bearer", since HTTP reads the scheme so', () => {
    const token = 'abcDEF0123456789._~+/-xyz';
    for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
      expect(makeRedactor({})(`authorization: ${scheme} ${token}== sent`)).toBe('authorization: [redacted] sent');
    }
  });

  it('leaves ordinary text alone', () => {
    expect(makeRedactor({})('Score: 7/10')).toBe('Score: 7/10');
    // "bearer" in prose, in any case, is not a token.
    expect(makeRedactor({})('A bearer token is required; Bearer tokens expire.')).toBe('A bearer token is required; Bearer tokens expire.');
    // A request id is a bare UUID, not a key.
    expect(makeRedactor({})('request 0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6 done')).toBe('request 0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6 done');
  });
});

describe('toGatewayError', () => {
  const redact = makeRedactor({ OPENAI_API_KEY: 'sk-live-0123456789abcdefXYZ' });

  it.each([
    [429, 'rate-limited', true],
    [500, 'provider-error', true],
    [503, 'provider-error', true],
    [529, 'provider-error', true],
    [408, 'provider-error', true],
    [400, 'invalid-request', false],
    [404, 'invalid-request', false],
    [413, 'invalid-request', false],
    [401, 'no-credentials', false],
    [403, 'provider-error', false],
  ] as const)('maps HTTP %i to %s (retryable %s)', (status, code, retryable) => {
    const e = toGatewayError(apiError(status, 'upstream says no'), 'openai', redact);
    expect(e).toBeInstanceOf(GatewayError);
    expect([e.code, e.retryable]).toEqual([code, retryable]);
    expect(e.message).toContain('openai');
  });

  it('treats timeouts and connection failures as retryable', () => {
    const timeout = Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
    const conn = Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' });
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    for (const err of [timeout, conn, reset]) {
      const e = toGatewayError(err, 'anthropic', redact);
      expect([e.code, e.retryable]).toEqual(['provider-error', true]);
    }
  });

  it('classifies errors that arrive mid-stream, without an HTTP status, by their error type', () => {
    const overloaded = Object.assign(new Error('Overloaded'), { error: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } });
    const rate = Object.assign(new Error('slow down'), { error: { type: 'error', error: { type: 'rate_limit_error' } } });
    const invalidReq = Object.assign(new Error('bad'), { error: { type: 'error', error: { type: 'invalid_request_error' } } });
    expect([toGatewayError(overloaded, 'anthropic', redact).code, toGatewayError(overloaded, 'anthropic', redact).retryable]).toEqual(['provider-error', true]);
    expect([toGatewayError(rate, 'anthropic', redact).code, toGatewayError(rate, 'anthropic', redact).retryable]).toEqual(['rate-limited', true]);
    expect([toGatewayError(invalidReq, 'anthropic', redact).code, toGatewayError(invalidReq, 'anthropic', redact).retryable]).toEqual(['invalid-request', false]);
  });

  it('never carries a key in its message', () => {
    const e = toGatewayError(apiError(401, 'Incorrect API key provided: sk-live-0123456789abcdefXYZ'), 'openai', redact);
    expect(e.message).not.toContain('0123456789abcdef');
  });

  it('passes GatewayErrors through unchanged', () => {
    const original = new GatewayError('refused', 'declined');
    expect(toGatewayError(original, 'anthropic', redact)).toBe(original);
  });

  it('reads retry-after hints', () => {
    const e = toGatewayError(apiError(429, 'slow down', { 'retry-after': '3' }), 'openai', redact);
    expect((e as GatewayError & { retryAfterMs?: number }).retryAfterMs).toBe(3000);
  });
});

describe('withRetries', () => {
  const opts = (sleep: (ms: number) => Promise<void>) => ({ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000, sleep, random: () => 0.5 });

  it('retries retryable errors with exponential backoff, then succeeds', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    const result = await withRetries(async () => {
      calls += 1;
      if (calls < 3) throw new GatewayError('rate-limited', 'busy', true);
      return 'ok';
    }, opts(sleep), BILLABLE_CALL);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    // Full jitter at random()=0.5: half of base * 2^attempt.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100]);
  });

  it('does not retry non-retryable errors', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw new GatewayError('invalid-request', 'bad', false);
      }, opts(sleep), BILLABLE_CALL),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw new GatewayError('provider-error', `fail ${calls}`, true);
      }, opts(sleep), BILLABLE_CALL),
    ).rejects.toThrow('fail 4');
    expect(calls).toBe(4);
  });

  it('honours a retry-after hint, capped at maxDelayMs', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await withRetries(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new GatewayError('rate-limited', 'busy', true), { retryAfterMs: 5000 });
      return 'ok';
    }, opts(sleep), BILLABLE_CALL);
    expect(sleep.mock.calls[0]?.[0]).toBe(1000);
  });
});
