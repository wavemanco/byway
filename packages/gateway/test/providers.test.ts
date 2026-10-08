import { describe, expect, it } from 'vitest';
import { anthropicAdapter, type AnthropicClientLike, type AnthropicMessageLike } from '../src/providers/anthropic.ts';
import { googleAdapter, type GoogleClientLike, type GoogleResponseLike } from '../src/providers/google.ts';
import { openaiAdapter, type ChatCompletionLike, type ImagesResponseLike, type OpenAIClientLike } from '../src/providers/openai.ts';
import { openrouterAdapter } from '../src/providers/openrouter.ts';
import type { ProviderCompletionRequest, ProviderImageRequest } from '../src/providers/types.ts';

const PNG_B64 = Buffer.from('fake-png-bytes').toString('base64');

const request = (over: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest => ({
  model: 'model-x',
  system: 'You are a careful critic.',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Judge this render.' },
        { type: 'image', image: { artifactId: 'sha256:abc', mediaType: 'image/png', base64: PNG_B64 } },
      ],
    },
    { role: 'assistant', content: [{ type: 'text', text: 'Earlier answer.' }] },
    { role: 'user', content: [{ type: 'text', text: 'Again, please.' }] },
  ],
  maxOutputTokens: 2048,
  responseFormat: 'text',
  context: { workspaceId: 'ws', purpose: 'critic:web-page', profileId: 'balanced', tier: 'big' },
  ...over,
});

const imageRequest: ProviderImageRequest = {
  model: 'img-model',
  prompt: 'A loaf of sourdough on linen',
  size: '1536x1024',
  context: { workspaceId: 'ws', purpose: 'asset:web-page', profileId: 'balanced' },
};

/** Sampling parameters Claude 4.7+ and reasoning models reject; the gateway must never send them. */
const SAMPLING = ['temperature', 'top_p', 'top_k'];

describe('anthropic adapter', () => {
  function fake(message: Partial<AnthropicMessageLike> = {}) {
    const calls: unknown[] = [];
    const client: AnthropicClientLike = {
      beta: {
        messages: {
          stream(body) {
            calls.push(body);
            return {
              finalMessage: async () => ({
                model: 'claude-opus-5-5',
                content: [
                  { type: 'thinking', text: undefined },
                  { type: 'text', text: 'Score: ' },
                  { type: 'text', text: '7/10' },
                ],
                stop_reason: 'end_turn',
                usage: { input_tokens: 100, output_tokens: 40, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 },
                ...message,
              }),
            };
          },
        },
      },
    };
    return { client, calls };
  }

  it('maps the request: system, roles, base64 images, max_tokens, and the refusal fallback', async () => {
    const { client, calls } = fake();
    const out = await anthropicAdapter({ client }).complete(request());
    const body = calls[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'model-x',
      max_tokens: 2048,
      system: 'You are a careful critic.',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Judge this render.' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Earlier answer.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Again, please.' }] },
    ]);
    for (const k of [...SAMPLING, 'thinking']) expect(body).not.toHaveProperty(k);
    // The logged request references the artifact instead of carrying its bytes.
    expect(JSON.stringify(out.requestBody)).toContain('artifact:sha256:abc');
    expect(JSON.stringify(out.requestBody)).not.toContain(PNG_B64);
  });

  it('parses text blocks only, and counts cache tokens as input', async () => {
    const { client } = fake();
    const out = await anthropicAdapter({ client }).complete(request());
    expect(out.text).toBe('Score: 7/10');
    expect(out.servedModel).toBe('claude-opus-5-5');
    expect(out.usage).toEqual({ inputTokens: 115, outputTokens: 40, cacheReadTokens: 5, cacheWriteTokens: 10 });
    expect(out.refusal).toBeUndefined();
  });

  it('reports a refusal with its category', async () => {
    const { client } = fake({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] });
    const out = await anthropicAdapter({ client }).complete(request());
    expect(out.refusal).toContain('cyber');
  });

  it('prices each model separately when a refusal fallback served the call', async () => {
    const { client } = fake({
      model: 'claude-opus-4-8',
      usage: {
        input_tokens: 50,
        output_tokens: 20,
        iterations: [
          { type: 'message', model: 'claude-opus-5-5', input_tokens: 50, output_tokens: 3 },
          { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 50, output_tokens: 20 },
        ],
      },
    });
    const out = await anthropicAdapter({ client }).complete(request());
    expect(out.servedModel).toBe('claude-opus-4-8');
    expect(out.usageByModel?.map((u) => [u.model, u.usage.outputTokens])).toEqual([
      ['claude-opus-5-5', 3],
      ['claude-opus-4-8', 20],
    ]);
    expect(out.usage).toMatchObject({ inputTokens: 100, outputTokens: 23 });
  });

  it('reports truncation when the answer stopped at max_tokens (or ran out of context window)', async () => {
    expect((await anthropicAdapter({ client: fake().client }).complete(request())).truncated).toBeFalsy();
    for (const stop_reason of ['max_tokens', 'model_context_window_exceeded']) {
      const out = await anthropicAdapter({ client: fake({ stop_reason }).client }).complete(request());
      expect(out.truncated, stop_reason).toBe(true);
      expect(out.text).toBe('Score: 7/10');
    }
    for (const stop_reason of ['end_turn', 'stop_sequence', 'refusal', null]) {
      expect((await anthropicAdapter({ client: fake({ stop_reason }).client }).complete(request())).truncated, String(stop_reason)).toBeFalsy();
    }
  });

  it('can turn the refusal fallback off', async () => {
    const { client, calls } = fake();
    await anthropicAdapter({ client, refusalFallback: false }).complete(request());
    expect(calls[0]).not.toHaveProperty('betas');
    expect(calls[0]).not.toHaveProperty('fallbacks');
  });
});

function fakeOpenAI(completion: Partial<ChatCompletionLike> = {}, images: Partial<ImagesResponseLike> = {}) {
  const chat: Record<string, unknown>[] = [];
  const imgs: Record<string, unknown>[] = [];
  const client: OpenAIClientLike = {
    chat: {
      completions: {
        async create(body) {
          chat.push(body as unknown as Record<string, unknown>);
          return {
            model: 'gpt-6.1-sol-2026-09-30',
            choices: [{ finish_reason: 'stop', message: { content: 'Choice: B', refusal: null } }],
            usage: { prompt_tokens: 300, completion_tokens: 25, prompt_tokens_details: { cached_tokens: 100 } },
            ...completion,
          };
        },
      },
    },
    images: {
      async generate(body) {
        imgs.push(body as unknown as Record<string, unknown>);
        return { data: [{ b64_json: PNG_B64 }], output_format: 'png', usage: { input_tokens: 12, output_tokens: 4000 }, ...images };
      },
    },
  };
  return { client, chat, imgs };
}

describe('openai adapter', () => {
  it('maps the request to Chat Completions with a developer prompt and data-URL images', async () => {
    const { client, chat } = fakeOpenAI();
    const out = await openaiAdapter({ client }).complete(request({ responseFormat: 'json' }));
    const body = chat[0] as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'model-x', max_completion_tokens: 2048, response_format: { type: 'json_object' } });
    expect(body.messages).toEqual([
      { role: 'developer', content: 'You are a careful critic.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Judge this render.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_B64}` } },
        ],
      },
      { role: 'assistant', content: 'Earlier answer.' },
      { role: 'user', content: [{ type: 'text', text: 'Again, please.' }] },
    ]);
    for (const k of [...SAMPLING, 'max_tokens']) expect(body).not.toHaveProperty(k);
    expect(JSON.stringify(out.requestBody)).not.toContain(PNG_B64);
  });

  it('parses text, served model and cached tokens', async () => {
    const { client } = fakeOpenAI();
    const out = await openaiAdapter({ client }).complete(request());
    expect([out.text, out.servedModel]).toEqual(['Choice: B', 'gpt-6.1-sol-2026-09-30']);
    expect(out.usage).toEqual({ inputTokens: 300, outputTokens: 25, cacheReadTokens: 100 });
  });

  it('reports refusals and content-filter stops', async () => {
    const a = fakeOpenAI({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I cannot help with that.' } }] });
    expect((await openaiAdapter({ client: a.client }).complete(request())).refusal).toContain('cannot help');
    const b = fakeOpenAI({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] });
    expect((await openaiAdapter({ client: b.client }).complete(request())).refusal).toContain('content filter');
  });

  it("reports truncation when finish_reason is 'length'", async () => {
    const cut = fakeOpenAI({ choices: [{ finish_reason: 'length', message: { content: '{"options": [' } }] });
    const out = await openaiAdapter({ client: cut.client }).complete(request());
    expect([out.truncated, out.text]).toEqual([true, '{"options": [']);
    expect((await openaiAdapter({ client: fakeOpenAI().client }).complete(request())).truncated).toBeFalsy();
    const filtered = fakeOpenAI({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] });
    expect((await openaiAdapter({ client: filtered.client }).complete(request())).truncated).toBeFalsy();
  });

  it('generates a PNG and keeps base64 out of the logged response', async () => {
    const { client, imgs } = fakeOpenAI();
    const adapter = openaiAdapter({ client });
    const out = await adapter.image!(imageRequest);
    expect(imgs[0]).toEqual({ model: 'img-model', prompt: 'A loaf of sourdough on linen', size: '1536x1024', quality: 'medium', n: 1, output_format: 'png' });
    expect(Buffer.from(out.bytes).toString()).toBe('fake-png-bytes');
    expect(out.mediaType).toBe('image/png');
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 4000, units: 1 });
    expect(JSON.stringify(out.responseBody)).not.toContain(PNG_B64);
  });

  it('returns a response without image data as a no-image result with its usage, not a fake 502 (ENG-5)', async () => {
    const { client } = fakeOpenAI({}, { data: [], usage: { input_tokens: 12, output_tokens: 0 } });
    const out = await openaiAdapter({ client }).image!(imageRequest);
    expect(out.refusal).toMatch(/no image/);
    expect(out.bytes.byteLength).toBe(0);
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 0, units: 0 });
  });
});

describe('openrouter adapter', () => {
  const pins = { 'anthropic/claude-opus-5.5': 'anthropic' };

  it('pins one upstream provider with fallbacks off, using the system role', async () => {
    const { client, chat } = fakeOpenAI({ provider: 'Anthropic', usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.00014 } });
    const out = await openrouterAdapter({ client, pins }).complete(request({ model: 'anthropic/claude-opus-5.5' }));
    const body = chat[0] as Record<string, unknown>;
    expect(body.provider).toEqual({ only: ['anthropic'], allow_fallbacks: false });
    expect((body.messages as { role: string }[])[0]?.role).toBe('system');
    expect(out.upstreamProvider).toBe('Anthropic');
    expect(out.reportedCostUsd).toBe(0.00014);
  });

  it("reports truncation when finish_reason is 'length'", async () => {
    const { client } = fakeOpenAI({ choices: [{ finish_reason: 'length', message: { content: '- Tighten' } }] });
    expect((await openrouterAdapter({ client, pins }).complete(request({ model: 'anthropic/claude-opus-5.5' }))).truncated).toBe(true);
    const whole = fakeOpenAI();
    expect((await openrouterAdapter({ client: whole.client, pins }).complete(request({ model: 'anthropic/claude-opus-5.5' }))).truncated).toBeFalsy();
  });

  it('records the pin as the upstream when the response does not name one', async () => {
    const { client } = fakeOpenAI();
    const out = await openrouterAdapter({ client, pins }).complete(request({ model: 'anthropic/claude-opus-5.5' }));
    expect(out.upstreamProvider).toBe('anthropic');
  });

  it('refuses a model with no pinned upstream', async () => {
    const { client, chat } = fakeOpenAI();
    await expect(openrouterAdapter({ client, pins }).complete(request({ model: 'some/other-model' }))).rejects.toMatchObject({ code: 'invalid-request' });
    expect(chat).toHaveLength(0);
  });
});

describe('google adapter', () => {
  function fake(response: GoogleResponseLike) {
    const calls: Record<string, unknown>[] = [];
    const client: GoogleClientLike = {
      models: {
        async generateContent(params) {
          calls.push(params as unknown as Record<string, unknown>);
          return response;
        },
      },
    };
    return { client, calls };
  }
  const ok: GoogleResponseLike = {
    modelVersion: 'gemini-3.8-flash-001',
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: '- Remove the banner' }] } }],
    usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 30, thoughtsTokenCount: 70 },
  };

  it('maps roles, inline images, the system instruction and JSON mode', async () => {
    const { client, calls } = fake(ok);
    const out = await googleAdapter({ client }).complete(request({ responseFormat: 'json' }));
    expect(calls[0]).toEqual({
      model: 'model-x',
      contents: [
        { role: 'user', parts: [{ text: 'Judge this render.' }, { inlineData: { mimeType: 'image/png', data: PNG_B64 } }] },
        { role: 'model', parts: [{ text: 'Earlier answer.' }] },
        { role: 'user', parts: [{ text: 'Again, please.' }] },
      ],
      config: { maxOutputTokens: 2048, systemInstruction: 'You are a careful critic.', responseMimeType: 'application/json' },
    });
    expect(JSON.stringify(out.requestBody)).not.toContain(PNG_B64);
  });

  it('skips thought parts and bills thinking tokens as output', async () => {
    const { client } = fake(ok);
    const out = await googleAdapter({ client }).complete(request());
    expect(out.text).toBe('- Remove the banner');
    expect(out.servedModel).toBe('gemini-3.8-flash-001');
    expect(out.usage).toMatchObject({ inputTokens: 200, outputTokens: 100 });
  });

  it('reports safety stops and blocked prompts as refusals', async () => {
    const a = fake({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] });
    expect((await googleAdapter({ client: a.client }).complete(request())).refusal).toContain('SAFETY');
    const b = fake({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });
    expect((await googleAdapter({ client: b.client }).complete(request())).refusal).toContain('PROHIBITED_CONTENT');
  });

  it("reports truncation when finishReason is 'MAX_TOKENS'", async () => {
    const cut = fake({ ...ok, candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '- Remove the' }] } }] });
    const out = await googleAdapter({ client: cut.client }).complete(request());
    expect([out.truncated, out.text, out.refusal]).toEqual([true, '- Remove the', undefined]);
    expect((await googleAdapter({ client: fake(ok).client }).complete(request())).truncated).toBeFalsy();
    expect((await googleAdapter({ client: fake({ promptFeedback: { blockReason: 'SAFETY' } }).client }).complete(request())).truncated).toBeFalsy();
  });

  it('returns a text-only answer from an image model as a no-image result with its usage, not a fake 502 (ENG-5)', async () => {
    const { client } = fake({ modelVersion: 'gemini-nano-banana-2.1', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'A loaf, described.' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 40 } });
    const out = await googleAdapter({ client }).image!(imageRequest);
    expect(out.refusal).toBe('returned no image (finishReason STOP, text only)');
    expect(out.usage).toEqual({ inputTokens: 9, outputTokens: 40, units: 0 });
    // An image of a type the contract cannot carry is not an image either.
    const odd = fake({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: PNG_B64, mimeType: 'image/gif' } }] } }] });
    expect((await googleAdapter({ client: odd.client }).image!(imageRequest)).refusal).toMatch(/image\/gif/);
  });

  it('generates images through generateContent with an aspect ratio and the 1K size', async () => {
    const { client, calls } = fake({
      modelVersion: 'gemini-nano-banana-2.1',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here you go' }, { inlineData: { data: PNG_B64, mimeType: 'image/png' } }] } }],
      usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 1290 },
    });
    const out = await googleAdapter({ client }).image!(imageRequest);
    expect(calls[0]).toEqual({ model: 'img-model', contents: 'A loaf of sourdough on linen', config: { imageConfig: { aspectRatio: '3:2', imageSize: '1K' } } });
    expect(Buffer.from(out.bytes).toString()).toBe('fake-png-bytes');
    expect(out.usage.units).toBe(1);
    expect(JSON.stringify(out.responseBody)).not.toContain(PNG_B64);
  });
});
