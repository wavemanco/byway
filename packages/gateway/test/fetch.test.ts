/**
 * The fetch byway's clients send their requests with (the waits design of 2026-10-22, section 2): Node's own gives up
 * after five minutes without headers or body bytes, which would cut Google calls and images off under any wait chosen
 * in Settings, so the Anthropic, OpenAI, OpenRouter and Google clients fetch through an undici Agent whose two
 * timeouts are 80 minutes, and fal keeps Node's default. undici is replaced here by a recorder around the real one: no
 * request leaves the process, and Node's own fetch is a stub that fails the test if anything but fal reaches it.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ agents: [] as { agent: unknown; options: unknown }[], requests: [] as { url: string; dispatcher: unknown }[] }));

vi.mock('undici', async (importOriginal) => {
  const real = await importOriginal<typeof import('undici')>();
  class RecordedAgent extends real.Agent {
    constructor(options: ConstructorParameters<typeof real.Agent>[0]) {
      super(options);
      seen.agents.push({ agent: this, options });
    }
  }
  return {
    ...real,
    Agent: RecordedAgent,
    // Every provider refuses the key at once (401 with its own error body), so each SDK's call ends there.
    fetch: async (input: unknown, init?: { dispatcher?: unknown }) => {
      seen.requests.push({ url: String(input), dispatcher: init?.dispatcher });
      return new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'not a real key', code: 401, status: 'UNAUTHENTICATED' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
});

const { PROVIDER_TIMEOUT_MS, providerAgent } = await import('../src/providers/fetch.ts');
const { createAnthropicClient } = await import('../src/providers/anthropic.ts');
const { createOpenAIClient } = await import('../src/providers/openai.ts');
const { createOpenRouterClient } = await import('../src/providers/openrouter.ts');
const { createGoogleClient } = await import('../src/providers/google.ts');
const { createFalClient } = await import('../src/providers/fal.ts');

/** Node's own fetch, replaced: what reached it. */
let nodeFetch: string[];

beforeEach(() => {
  seen.requests.length = 0;
  nodeFetch = [];
  vi.stubGlobal('fetch', async (input: unknown) => {
    nodeFetch.push(String(input));
    return new Response(JSON.stringify({ request_id: 'req-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const KEY = 'test-key-not-real';
const settled = (p: Promise<unknown>) => p.then(
  () => undefined,
  () => undefined,
);

describe('the provider Agent', () => {
  it('is one undici Agent whose headers and body timeouts are 80 minutes, above the longest wait anyone can choose', () => {
    expect(PROVIDER_TIMEOUT_MS).toBe(80 * 60_000);
    expect(seen.agents).toEqual([{ agent: providerAgent, options: { headersTimeout: 80 * 60_000, bodyTimeout: 80 * 60_000 } }]);
  });

  // Every undici 7.x before 7.30.1 has advisories published against it (GitHub's advisory database and undici's own,
  // read 2026-10-23): 7.18.2, the version Node 24.13.1 bundles and the gateway first pinned, has 23, and 7.29.1 and
  // 7.30.0 still have the eight of 2026-10-15. So the package the gateway fetches through is never older than 7.30.1.
  it('is undici 7.30.1 or later, the first 7.x clear of every published advisory', () => {
    const { version } = createRequire(import.meta.url)('undici/package.json') as { version: string };
    const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
    expect(major * 1e6 + minor * 1e3 + patch, `undici ${version}`).toBeGreaterThanOrEqual(7_030_001);
  });
});

describe('each text and image client fetches through it, and fal through Node’s own fetch', () => {
  it.each([
    ['anthropic', () => createAnthropicClient(KEY).beta.messages.stream({ model: 'claude-opus-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }).finalMessage(), 'https://api.anthropic.com/'],
    ['openai chat', () => createOpenAIClient(KEY).chat.completions.create({ model: 'gpt-6-astra', messages: [{ role: 'user', content: 'hi' }], stream: true }), 'https://api.openai.com/'],
    ['openai images', () => createOpenAIClient(KEY).images.generate({ model: 'gpt-image-3', prompt: 'a loaf', n: 1 }), 'https://api.openai.com/'],
    ['openrouter', () => createOpenRouterClient(KEY).chat.completions.create({ model: 'anthropic/claude-opus-5.5', messages: [{ role: 'user', content: 'hi' }], stream: true }), 'https://openrouter.ai/'],
    ['google', () => createGoogleClient(KEY).models.generateContent({ model: 'gemini-3.1-pro-preview', contents: 'hi' }), 'https://generativelanguage.googleapis.com/'],
  ] as const)('%s', async (_name, call, origin) => {
    await settled(call());
    expect(seen.requests).toEqual([{ url: expect.stringMatching(new RegExp(`^${origin.replace(/[.]/g, '[.]')}`)), dispatcher: providerAgent }]);
    expect(nodeFetch).toEqual([]);
  });

  it('fal: its job submission goes through Node’s own fetch, never the provider Agent', async () => {
    await createFalClient('test-key-id:test-secret-not-real').queue.submit('fal-ai/kling-video/v3/pro/image-to-video', { input: { prompt: 'p' } });
    expect(nodeFetch).toEqual(['https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video']);
    expect(seen.requests).toEqual([]);
  });
});
