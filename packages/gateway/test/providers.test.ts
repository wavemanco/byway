import { describe, expect, it } from 'vitest';
import { anthropicAdapter, type AnthropicClientLike, type AnthropicMessageLike } from '../src/providers/anthropic.ts';
import { googleAdapter, type GoogleClientLike, type GoogleResponseLike } from '../src/providers/google.ts';
import { openaiAdapter, type ChatCompletionLike, type ImagesResponseLike, type OpenAIClientLike } from '../src/providers/openai.ts';
import { openrouterAdapter } from '../src/providers/openrouter.ts';
import { PRICES, priceFor, tokenCost } from '../src/prices.ts';
import type { ProviderCompletionRequest, ProviderImageRequest } from '../src/providers/types.ts';
import { chunksOf, streamOf } from './fakes.ts';

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

  it('maps the request: system, roles, base64 images, max_tokens, summarized thinking, and no fallback to another model (ADR-0102)', async () => {
    const { client, calls } = fake();
    const out = await anthropicAdapter({ client }).complete(request());
    const body = calls[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'model-x',
      max_tokens: 2048,
      system: 'You are a careful critic.',
    });
    // Neither the server-side fallback beta nor its field: a decline is never answered by another model.
    for (const k of ['betas', 'fallbacks']) {
      expect(body).not.toHaveProperty(k);
      expect(out.requestBody).not.toHaveProperty(k);
    }
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
    for (const k of SAMPLING) expect(body).not.toHaveProperty(k);
    // Thinking stays adaptive, each model's own default, and streams a summary instead of nothing (the owner's choice of
    // 2026-10-22, "Ask for summaries (Recommended)"), so a model that is thinking is not silent and its wait measures
    // true silence. Billed the same (the claude-api reference, read 2026-10-22). The logged request says so too.
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect((out.requestBody as Record<string, unknown>).thinking).toEqual({ type: 'adaptive', display: 'summarized' });
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

  it('reports a refusal as a decline, with its category when it states one', async () => {
    const { client } = fake({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] });
    const out = await anthropicAdapter({ client }).complete(request());
    expect(out.refusal).toContain('cyber');
    expect(out.declined).toEqual({ reason: 'cyber' });
    const bare = await anthropicAdapter({ client: fake({ stop_reason: 'refusal', stop_details: null, content: [] }).client }).complete(request());
    expect(bare.declined).toEqual({});
    expect((await anthropicAdapter({ client: fake().client }).complete(request())).declined).toBeUndefined();
  });

  it('prices each model a response lists as billed separately (byway asks for no fallback, but a response that names several attempts is still priced per model)', async () => {
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

  it('has no option that asks for a fallback model (ADR-0102)', async () => {
    const { client, calls } = fake();
    // @ts-expect-error The adapter takes a client only: no option can turn server-side fallbacks on.
    await anthropicAdapter({ client, refusalFallback: true }).complete(request());
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
          // Streamed (ADR-0111): the whole answer as the chunks that carry it.
          return streamOf(
            chunksOf({
              model: 'gpt-6.1-sol-2026-09-30',
              choices: [{ finish_reason: 'stop', message: { content: 'Choice: B', refusal: null } }],
              usage: { prompt_tokens: 300, completion_tokens: 25, prompt_tokens_details: { cached_tokens: 100 } },
              ...completion,
            }),
          );
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
    expect(out.usage).toEqual({ inputTokens: 300, outputTokens: 25, cacheReadTokens: 100, cacheWriteTokens: 0 });
  });

  it('reads the tokens a call wrote to the prompt cache apart from those it read (MONEY-1)', async () => {
    // OpenAI's prompt-caching guide (read 2026-10-21): cached_tokens "excludes tokens charged as writes", and the
    // ordinary input is the input count less both. OpenAI writes a new prompt by default from GPT-5.6, at 1.25× input.
    const usage = { prompt_tokens: 16_500, completion_tokens: 800, prompt_tokens_details: { cached_tokens: 4000, cache_write_tokens: 12_000 } };
    const { client } = fakeOpenAI({ model: 'gpt-6-astra', usage });
    const out = await openaiAdapter({ client }).complete(request());
    expect(out.usage).toEqual({ inputTokens: 16_500, outputTokens: 800, cacheReadTokens: 4000, cacheWriteTokens: 12_000 });
    // gpt-6-astra: 500 plain input tokens at $10, 4,000 read at $1 and 12,000 written at $12.50 per 1M, and 800 output
    // at $50 per 1M.
    expect(tokenCost(priceFor(PRICES, 'openai', 'gpt-6-astra', new Date('2026-10-21T12:00:00Z'))!, out.usage)).toBe(0.199);
    // A field the answer leaves out, or sends as null, is no tokens.
    const none = fakeOpenAI({ usage: { prompt_tokens: 300, completion_tokens: 25, prompt_tokens_details: { cached_tokens: null, cache_write_tokens: null } } });
    expect((await openaiAdapter({ client: none.client }).complete(request())).usage).toEqual({ inputTokens: 300, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it('reports refusals and content-filter stops as declines', async () => {
    const a = fakeOpenAI({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I cannot help with that.' } }] });
    const refused = await openaiAdapter({ client: a.client }).complete(request());
    expect(refused.refusal).toContain('cannot help');
    expect(refused.declined).toEqual({ reason: 'I cannot help with that.' });
    const b = fakeOpenAI({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] });
    const filtered = await openaiAdapter({ client: b.client }).complete(request());
    expect(filtered.refusal).toContain('content filter');
    expect(filtered.declined).toEqual({ reason: 'content filter' });
    expect((await openaiAdapter({ client: fakeOpenAI().client }).complete(request())).declined).toBeUndefined();
  });

  it('reads an image request its safety system blocked (HTTP 400, moderation_blocked) as a decline with no image, not an invalid request', async () => {
    const blocked = Object.assign(new Error('400 Your request was rejected by the safety system.'), {
      status: 400,
      code: 'moderation_blocked',
      // The shape OpenAI's image guide documents (read 2026-10-18), with the optional moderation_details.
      error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system.', type: 'image_generation_user_error', moderation_details: { moderation_stage: 'output', categories: ['violence'] } },
    });
    const { client } = fakeOpenAI();
    client.images.generate = async () => {
      throw blocked;
    };
    const out = await openaiAdapter({ client }).image!(imageRequest);
    expect(out.declined).toEqual({ reason: 'moderation_blocked' });
    expect(out.refusal).toContain('moderation_blocked');
    expect(out.bytes.byteLength).toBe(0);
    // OpenAI reports no usage on a blocked request: none is assumed.
    expect(out.usage).toEqual({ inputTokens: 0, outputTokens: 0, units: 0 });
    // The error body is the decline's stored response, so the stage that blocked it is on record (whether a block at the
    // output stage is billed is not documented; backlog).
    expect(out.responseBody).toMatchObject({ error: { code: 'moderation_blocked', moderation_details: { moderation_stage: 'output' } } });
    // Any other 400 is still the request's own fault, thrown as before.
    client.images.generate = async () => {
      throw Object.assign(new Error('400 bad size'), { status: 400, error: { code: 'invalid_value', message: 'bad size' } });
    };
    await expect(openaiAdapter({ client }).image!(imageRequest)).rejects.toMatchObject({ status: 400 });
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
    // No image is not a decline: nothing says the provider declined it.
    expect(out.declined).toBeUndefined();
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
    // No other model either: OpenRouter's model fallbacks (`models`, `route`) are never asked for (ADR-0102).
    for (const k of ['models', 'route']) expect(body).not.toHaveProperty(k);
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

  it('reports safety stops and blocked prompts as declines', async () => {
    const a = fake({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] });
    const stopped = await googleAdapter({ client: a.client }).complete(request());
    expect(stopped.refusal).toContain('SAFETY');
    expect(stopped.declined).toEqual({ reason: 'SAFETY' });
    const b = fake({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });
    const blocked = await googleAdapter({ client: b.client }).complete(request());
    expect(blocked.refusal).toContain('PROHIBITED_CONTENT');
    expect(blocked.declined).toEqual({ reason: 'prompt blocked: PROHIBITED_CONTENT' });
    expect((await googleAdapter({ client: fake(ok).client }).complete(request())).declined).toBeUndefined();
  });

  it('reports an image the safety filter stopped as a decline, and a text-only answer as no image, not a decline', async () => {
    const stopped = await googleAdapter({ client: fake({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }], usageMetadata: { promptTokenCount: 9 } }).client }).image!(imageRequest);
    expect(stopped.declined).toEqual({ reason: 'IMAGE_SAFETY' });
    const text = await googleAdapter({ client: fake({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'A loaf, described.' }] } }] }).client }).image!(imageRequest);
    expect(text.refusal).toMatch(/no image/);
    expect(text.declined).toBeUndefined();
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

  it('counts an image answer’s thinking and text tokens as output, not the image’s own tokens, which are priced per image (B1)', async () => {
    // Google's pricing page (read 2026-10-18): Nano Banana 2.1's "text and thinking" output is $7.50 per 1M tokens and its
    // images $30 per 1M ($0.0336 for a 1K image of 1,120 tokens). Thinking is reported apart from the answer's tokens.
    const answer = (usageMetadata: GoogleResponseLike['usageMetadata']): GoogleResponseLike => ({
      modelVersion: 'gemini-nano-banana-2.1',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here you go' }, { inlineData: { data: PNG_B64, mimeType: 'image/png' } }] } }],
      usageMetadata,
    });
    const usageOf = async (u: GoogleResponseLike['usageMetadata']) => (await googleAdapter({ client: fake(answer(u)).client }).image!(imageRequest)).usage;
    const details = [{ modality: 'IMAGE', tokenCount: 1120 }, { modality: 'TEXT', tokenCount: 10 }];
    expect(await usageOf({ promptTokenCount: 9, candidatesTokenCount: 1130, thoughtsTokenCount: 400, candidatesTokensDetails: details })).toEqual({ inputTokens: 9, outputTokens: 410, units: 1 });
    // No thinking reported: only the text.
    expect(await usageOf({ promptTokenCount: 9, candidatesTokenCount: 1130, candidatesTokensDetails: details })).toEqual({ inputTokens: 9, outputTokens: 10, units: 1 });
    // Without the breakdown by modality, every answer token counts at the text rate, the image's too: the cost leans high.
    expect(await usageOf({ promptTokenCount: 9, candidatesTokenCount: 1130, thoughtsTokenCount: 400 })).toEqual({ inputTokens: 9, outputTokens: 1530, units: 1 });
    // A count that is not a number is not read as zero: the gateway replaces it and flags the price (finiteUsage).
    expect((await usageOf({ promptTokenCount: 9, candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 'ten' as never }] })).outputTokens).toBeNaN();
    expect((await usageOf({ promptTokenCount: 9, candidatesTokenCount: 1130, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 'many' as never }] })).outputTokens).toBeNaN();
  });

  it('charges the answer tokens the breakdown by modality does not list at the text rate (MONEY-2)', async () => {
    // Google's reference promises no breakdown of every answer token; a third party measured image answers whose breakdown
    // lists only IMAGE, 88 to 630 tokens below candidatesTokenCount. Thinking is reported apart from the answer.
    const answer = (usageMetadata: GoogleResponseLike['usageMetadata']): GoogleResponseLike => ({
      modelVersion: 'gemini-nano-banana-2.1',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here you go' }, { inlineData: { data: PNG_B64, mimeType: 'image/png' } }] } }],
      ...(usageMetadata ? { usageMetadata } : {}),
    });
    const outputOf = async (u: GoogleResponseLike['usageMetadata']) => (await googleAdapter({ client: fake(answer(u)).client }).image!(imageRequest)).usage.outputTokens;
    const image = { modality: 'IMAGE', tokenCount: 1120 };
    // Only IMAGE listed: the 630 tokens above it count at the text rate, with the 200 thinking tokens.
    expect(await outputOf({ promptTokenCount: 9, candidatesTokenCount: 1750, thoughtsTokenCount: 200, candidatesTokensDetails: [image] })).toBe(830);
    // TEXT listed but the count leaves more: the larger of the two.
    expect(await outputOf({ candidatesTokenCount: 1750, candidatesTokensDetails: [image, { modality: 'TEXT', tokenCount: 10 }] })).toBe(630);
    // TEXT listed above what the count leaves: the listed tokens.
    expect(await outputOf({ candidatesTokenCount: 1130, candidatesTokensDetails: [image, { modality: 'TEXT', tokenCount: 50 }] })).toBe(50);
    // An empty breakdown is no breakdown: every answer token at the text rate, as when the field is absent.
    expect(await outputOf({ candidatesTokenCount: 1300, thoughtsTokenCount: 300, candidatesTokensDetails: [] })).toBe(1600);
    expect(await outputOf({ candidatesTokenCount: 1300, thoughtsTokenCount: 300 })).toBe(1600);
    // No candidatesTokenCount: only what the breakdown lists apart from IMAGE.
    expect(await outputOf({ thoughtsTokenCount: 300, candidatesTokensDetails: [image, { modality: 'TEXT', tokenCount: 10 }] })).toBe(310);
    expect(await outputOf({ candidatesTokensDetails: [image] })).toBe(0);
    // No usage at all: nothing.
    expect(await outputOf(undefined)).toBe(0);
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
