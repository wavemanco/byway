import { GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import type { MediaType } from '@byway/contracts';
import { IMAGE_ASPECT, imageData, plain, type ProviderAdapter, type ProviderCompletion, type ProviderCompletionRequest, type ProviderImage, type ProviderImageRequest } from './types.ts';

/** The fields of a generateContent response the adapter reads (a structural subset of GenerateContentResponse). */
export interface GoogleResponseLike {
  modelVersion?: string;
  candidates?: ReadonlyArray<{
    finishReason?: string;
    content?: { parts?: ReadonlyArray<{ text?: string; thought?: boolean; inlineData?: { data?: string; mimeType?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
}

export interface GoogleClientLike {
  models: { generateContent(params: GenerateContentParameters): Promise<GoogleResponseLike> };
}

export function createGoogleClient(apiKey: string): GoogleClientLike {
  return new GoogleGenAI({ apiKey });
}

/** Finish reasons that mean the model or its filters declined. */
const DECLINED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT']);

/** generateContent params: Gemini calls the assistant role `model`; no sampling parameters are sent. */
export function googleParams(req: ProviderCompletionRequest, inline: boolean): GenerateContentParameters {
  return {
    model: req.model,
    contents: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.content.map((p) => (p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.image.mediaType, data: imageData(p.image, inline) } })),
    })),
    config: {
      maxOutputTokens: req.maxOutputTokens,
      ...(req.system ? { systemInstruction: req.system } : {}),
      ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
    },
  };
}

function refusalOf(res: GoogleResponseLike): string | undefined {
  if (res.promptFeedback?.blockReason) return `declined (prompt blocked: ${res.promptFeedback.blockReason})`;
  const reason = res.candidates?.[0]?.finishReason;
  return reason && DECLINED.has(reason) ? `declined (${reason})` : undefined;
}

export function parseGoogleResponse(res: GoogleResponseLike, requestedModel: string): Omit<ProviderCompletion, 'requestBody'> {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const text = parts.flatMap((p) => (typeof p.text === 'string' && !p.thought ? [p.text] : [])).join('');
  const u = res.usageMetadata ?? {};
  const refusal = refusalOf(res);
  return {
    text,
    servedModel: res.modelVersion ?? requestedModel,
    // Gemini bills thinking tokens as output ("output price including thinking tokens").
    usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheReadTokens: u.cachedContentTokenCount ?? 0 },
    ...(refusal ? { refusal } : {}),
    // MAX_TOKENS: the answer hit maxOutputTokens (thinking tokens count toward it).
    ...(res.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? { truncated: true } : {}),
    responseBody: plain(res),
  };
}

/** Image generation through generateContent with an image model and imageConfig (js-genai codegen instructions). */
export function googleImageParams(req: ProviderImageRequest): GenerateContentParameters {
  return { model: req.model, contents: req.prompt, config: { imageConfig: { aspectRatio: IMAGE_ASPECT[req.size], imageSize: '1K' } } };
}

const MEDIA_TYPES = new Set<MediaType>(['image/png', 'image/jpeg', 'image/webp']);

/**
 * An image answer. Image models sometimes answer an image request with text only (finishReason STOP): that answer was
 * billed for its tokens, so it comes back as a no-image result with its usage and a refusal-like reason, which the
 * gateway ledgers and then refuses (not retryable). It used to be thrown as a synthetic 502, which the gateway retried
 * up to four times, paying each time and ledgering none (ENG-5). Whether to try the slot again is the asset step's
 * decision (its triesPerSlot), not a transport retry's.
 */
export function parseGoogleImage(res: GoogleResponseLike, requestedModel: string): Omit<ProviderImage, 'requestBody'> {
  const refusal = refusalOf(res);
  const body = plain(res) as GoogleResponseLike;
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
  for (const c of body.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      if (p.inlineData?.data) (p.inlineData as { data: string }).data = `[${p.inlineData.data.length} base64 chars, stored as an artifact]`;
    }
  }
  const u = res.usageMetadata ?? {};
  const usage = { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0, units: inline?.data ? 1 : 0 };
  const servedModel = res.modelVersion ?? requestedModel;
  const noImage = (reason: string) => ({ bytes: new Uint8Array(), mediaType: 'image/png' as const, servedModel, usage, refusal: reason, responseBody: body });
  if (!inline?.data) {
    if (refusal) return noImage(refusal);
    const finish = res.candidates?.[0]?.finishReason ?? 'none';
    const content = parts.some((p) => typeof p.text === 'string' && p.text.trim() && !p.thought) ? 'text only' : 'no content';
    return noImage(`returned no image (finishReason ${finish}, ${content})`);
  }
  const mediaType = (inline.mimeType ?? 'image/png') as MediaType;
  if (!MEDIA_TYPES.has(mediaType)) return noImage(`returned an image of type ${inline.mimeType}, which byway cannot use (PNG, JPEG or WebP only)`);
  return { bytes: Buffer.from(inline.data, 'base64'), mediaType, servedModel, usage, responseBody: body };
}

export function googleAdapter(opts: { client: GoogleClientLike }): ProviderAdapter {
  return {
    id: 'google',
    async complete(req) {
      const res = await opts.client.models.generateContent(googleParams(req, true));
      return { ...parseGoogleResponse(res, req.model), requestBody: googleParams(req, false) };
    },
    async image(req) {
      const params = googleImageParams(req);
      return { ...parseGoogleImage(await opts.client.models.generateContent(params), req.model), requestBody: params };
    },
  };
}
