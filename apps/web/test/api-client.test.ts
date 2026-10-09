/**
 * The client's GET helper (components/api.ts), which the Run screen and Nav poll through (view/refresh.ts, ADR-0082).
 * A successful status whose body cannot be read is not data: before this, it came back as `{}`, and a body cut off by
 * the refresher's timeout was applied as an empty snapshot that crashed the Run screen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, get, patch, post } from '../src/components/api.ts';

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

describe('post() and patch()', () => {
  it('fail, saying so, when a successful response has a body that cannot be read, rather than returning an empty object', async () => {
    // The Recommendation commands apply what post() returns directly; an empty object would throw inside a state updater.
    vi.stubGlobal('fetch', async () => response(200, () => Promise.reject(new SyntaxError('Unexpected end of JSON input'))));
    await expect(post('/api/intakes/i1/recommend', { ensure: true })).rejects.toBeInstanceOf(ApiError);
    await expect(patch('/api/settings', { demoMode: true })).rejects.toBeInstanceOf(ApiError);
  });

  it('return the parsed body of a successful response, and keep the server’s message for a refusal', async () => {
    vi.stubGlobal('fetch', async () => response(200, async () => ({ runId: 'r1' })));
    await expect(post<{ runId: string }>('/api/runs', {})).resolves.toEqual({ runId: 'r1' });
    vi.stubGlobal('fetch', async () => response(409, async () => ({ error: 'That question has already been answered.' })));
    await expect(post('/api/checkpoints/c1', {})).rejects.toThrow('That question has already been answered.');
    vi.stubGlobal('fetch', async () => response(503, () => Promise.reject(new SyntaxError('empty'))));
    await expect(post('/api/runs', {})).rejects.toThrow('The request failed (503). Try again.');
  });

  it('carry the server’s refusal code, so a screen can tell a held-key refusal from the rest', async () => {
    vi.stubGlobal('fetch', async () => response(400, async () => ({ error: 'This text contains your ANTHROPIC_API_KEY.', code: 'held-key' })));
    await expect(post('/api/intakes', {})).rejects.toMatchObject({ name: 'ApiError', code: 'held-key', message: 'This text contains your ANTHROPIC_API_KEY.' });
    vi.stubGlobal('fetch', async () => response(400, async () => ({ error: 'Describe what you are working on.' })));
    await expect(post('/api/intakes', {})).rejects.toMatchObject({ code: undefined });
  });

  it('carry the fields a refusal names, and only a list of strings', async () => {
    vi.stubGlobal('fetch', async () => response(400, async () => ({ error: 'This text contains your ANTHROPIC_API_KEY.', code: 'held-key', fields: ['attachments'] })));
    await expect(post('/api/intakes', {})).rejects.toMatchObject({ code: 'held-key', fields: ['attachments'] });
    for (const fields of [undefined, 'text', [1], null]) {
      vi.stubGlobal('fetch', async () => response(400, async () => ({ error: 'Refused.', code: 'held-key', fields })));
      await expect(post('/api/intakes', {})).rejects.toMatchObject({ fields: undefined });
    }
  });
});
