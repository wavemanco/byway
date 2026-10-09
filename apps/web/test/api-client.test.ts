/**
 * The client's GET helper (components/api.ts), which the Run screen and Nav poll through (view/refresh.ts, ADR-0082).
 * A successful status whose body cannot be read is not data: before this, it came back as `{}`, and a body cut off by
 * the refresher's timeout was applied as an empty snapshot that crashed the Run screen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, get } from '../src/components/api.ts';

/** A response whose headers have arrived; its body is whatever `body` does. */
const response = (status: number, body: () => Promise<unknown>) => ({ ok: status >= 200 && status < 300, status, json: body }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('get()', () => {
  it('returns the parsed body of a successful response', async () => {
    vi.stubGlobal('fetch', async () => response(200, async () => ({ count: 2 })));
    await expect(get<{ count: number }>('/api/waiting')).resolves.toEqual({ count: 2 });
  });

  it('fails when reading the body was cut off by its signal, rather than returning an empty object', async () => {
    const ctl = new AbortController();
    vi.stubGlobal('fetch', async () =>
      response(200, () => {
        ctl.abort();
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }),
    );
    await expect(get('/api/runs/r1?after=0', ctl.signal)).rejects.toThrow();
  });

  it('fails, saying so, when a successful response has a body that is not JSON', async () => {
    vi.stubGlobal('fetch', async () => response(200, () => Promise.reject(new SyntaxError('Unexpected token <'))));
    await expect(get('/api/runs/r1?after=0')).rejects.toBeInstanceOf(ApiError);
  });

  it('keeps the server’s message for a refusal, and a plain one when the refusal has no readable body', async () => {
    vi.stubGlobal('fetch', async () => response(404, async () => ({ error: 'No such run.' })));
    await expect(get('/api/runs/x')).rejects.toThrow('No such run.');
    vi.stubGlobal('fetch', async () => response(503, () => Promise.reject(new SyntaxError('empty'))));
    await expect(get('/api/runs/x')).rejects.toThrow('The request failed (503).');
  });
});
