import { GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import type { MediaType } from '@byway/contracts';
import { providerFetch } from './fetch.ts';
import {
  IMAGE_ASPECT,
  imageData,
  plain,
  type ProviderAdapter,
  type ProviderCompletion,
  type ProviderCompletionRequest,
  type ProviderImage,
  type ProviderImageRequest,
  type WholeCallDeadline,
} from './types.ts';

/** The fields of a generateContent response the adapter reads (a structural subset of GenerateContentResponse). */
export interface GoogleResponseLike {
  modelVersion?: string;
  candidates?: ReadonlyArray<{
    finishReason?: string;
    content?: { parts?: ReadonlyArray<{ text?: string; thought?: boolean; inlineData?: { data?: string; mimeType?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    /** The answer's tokens by modality ("List of modalities that were returned in the response"): TEXT, IMAGE, ... */
    candidatesTokensDetails?: ReadonlyArray<{ modality?: string; tokenCount?: number }>;
  };
}

export interface GoogleClientLike {
  models: { generateContent(params: GenerateContentParameters): Promise<GoogleResponseLike> };
}

/**
 * The SDK retries only when asked to (no retryOptions), so the gateway's policy is the only one. Requests go through the
 * provider Agent's fetch (fetch.ts): Node's own gives up on a call that has sent nothing for five minutes, and a Google
 * answer arrives whole, so it would cut every call at about five minutes, under any wait chosen in Settings.
 */
export function createGoogleClient(apiKey: string, fetchImpl: typeof fetch = providerFetch): GoogleClientLike {
  return new GoogleGenAI({ apiKey, httpOptions: { fetch: fetchImpl } });
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

/** A blocked prompt or a safety stop: a decline (ADR-0102), with the block or finish reason as its stated reason. */
function declineOf(res: GoogleResponseLike): { reason: string } | undefined {
  if (res.promptFeedback?.blockReason) return { reason: `prompt blocked: ${res.promptFeedback.blockReason}` };
  const reason = res.candidates?.[0]?.finishReason;
  return reason && DECLINED.has(reason) ? { reason } : undefined;
}

function refusalOf(res: GoogleResponseLike): string | undefined {
  const declined = declineOf(res);
  return declined ? `declined (${declined.reason})` : undefined;
}

export function parseGoogleResponse(res: GoogleResponseLike, requestedModel: string): Omit<ProviderCompletion, 'requestBody'> {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const text = parts.flatMap((p) => (typeof p.text === 'string' && !p.thought ? [p.text] : [])).join('');
  const u = res.usageMetadata ?? {};
  const refusal = refusalOf(res);
  const declined = declineOf(res);
  return {
    text,
    servedModel: res.modelVersion ?? requestedModel,
    // Gemini bills thinking tokens as output ("output price including thinking tokens").
    usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheReadTokens: u.cachedContentTokenCount ?? 0 },
    ...(refusal ? { refusal } : {}),
    ...(declined ? { declined } : {}),
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
 * The tokens of an image answer that are billed at the image model's text-and-thinking rate, on top of the image's own
 * per-image price (prices.ts, gemini-nano-banana-2.1; read 2026-10-18). Google's pricing page lists that model's output
 * as "text and thinking" at $7.50 per 1M tokens and images at $30 per 1M ($0.0336 a 1K image); its image guide says
 * thinking tokens are billed. The API reference (ai.google.dev/api/generate-content, read 2026-10-21) reports thinking
 * apart from the answer (totalTokenCount is "prompt + tool-use prompt + thoughts + response candidates"), so the two are
 * added, and the answer's tokens by modality (candidatesTokensDetails, "List of modalities that were returned in the
 * response"), so the image's own tokens (IMAGE) are left out here: the image is charged per image.
 *
 * Nothing promises that the breakdown lists every answer token: a third party's measurements of Google's image models
 * (docs.apiyi.com, nano-banana-usage-metadata) found it listing only IMAGE, with candidatesTokenCount 88 to 630 tokens
 * above it. So the answer's text-rate tokens are whichever is larger: those the breakdown lists apart from IMAGE, or
 * candidatesTokenCount less the IMAGE tokens. Unlisted tokens are charged at the text rate, the rate Google's page gives
 * for an answer's output other than images; neither page says how Google bills them, and the first live run's ledger is
 * to be compared with Google's usage records (backlog "Gemini image thinking tokens"). Without the breakdown (or with an
 * empty one) every answer token is counted at the text rate, the image's included, so the cost leans high; without
 * candidatesTokenCount, only the listed tokens count. Neither page says whether the interim "thought images" the guide
 * describes ("not charged") are counted in thoughtsTokenCount; if they are, this leans high too.
 */
function textAndThinkingTokens(u: NonNullable<GoogleResponseLike['usageMetadata']>): number {
  const thoughts = u.thoughtsTokenCount ?? 0;
  const details = u.candidatesTokensDetails;
  if (!Array.isArray(details)) return thoughts + (u.candidatesTokenCount ?? 0);
  // A count that is not a number makes the sum not a number, which the gateway replaces and flags (finiteUsage).
  const sum = (image: boolean) => details.reduce((n, d) => n + ((d?.modality === 'IMAGE') === image ? Number(d?.tokenCount ?? 0) : 0), 0);
  const listed = sum(false);
  const answer = u.candidatesTokenCount == null ? listed : Math.max(listed, u.candidatesTokenCount - sum(true));
  return thoughts + answer;
}

/**
 * An image answer. Image models sometimes answer an image request with text only (finishReason STOP): that answer was
 * billed for its tokens, so it comes back as a no-image result with its usage and a refusal-like reason, which the
 * gateway ledgers and then refuses (not retryable). It used to be thrown as a synthetic 502, which the gateway retried
 * up to four times, paying each time and ledgering none (ENG-5). Whether to try the slot again is the asset step's
 * decision (its triesPerSlot), not a transport retry's. A safety stop or a blocked prompt is a decline instead, which the
 * gateway asks once more and the asset step then leaves alone (ADR-0102).
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
  // outputTokens: the text and thinking tokens, billed on top of the image (units), which is priced per image.
  const usage = { inputTokens: u.promptTokenCount ?? 0, outputTokens: textAndThinkingTokens(u), units: inline?.data ? 1 : 0 };
  const servedModel = res.modelVersion ?? requestedModel;
  const noImage = (reason: string) => ({ bytes: new Uint8Array(), mediaType: 'image/png' as const, servedModel, usage, refusal: reason, responseBody: body });
  if (!inline?.data) {
    // A safety stop or a blocked prompt is a decline (ADR-0102); a text-only answer is only an answer with no image.
    const declined = declineOf(res);
    if (refusal !== undefined && declined) return { ...noImage(refusal), declined };
    const finish = res.candidates?.[0]?.finishReason ?? 'none';
    const content = parts.some((p) => typeof p.text === 'string' && p.text.trim() && !p.thought) ? 'text only' : 'no content';
    return noImage(`returned no image (finishReason ${finish}, ${content})`);
  }
  const mediaType = (inline.mimeType ?? 'image/png') as MediaType;
  if (!MEDIA_TYPES.has(mediaType)) return noImage(`returned an image of type ${inline.mimeType}, which byway cannot use (PNG, JPEG or WebP only)`);
  return { bytes: Buffer.from(inline.data, 'base64'), mediaType, servedModel, usage, responseBody: body };
}

/**
 * The params as sent, with the call's whole-call deadline as the SDK's abort signal (`config.abortSignal`), never the
 * run's stop. Only the request as logged leaves it out: a signal is not part of the request.
 */
function withDeadline(params: GenerateContentParameters, deadline: WholeCallDeadline | undefined): GenerateContentParameters {
  return deadline ? { ...params, config: { ...params.config, abortSignal: deadline.signal } } : params;
}

export function googleAdapter(opts: { client: GoogleClientLike }): ProviderAdapter {
  return {
    id: 'google',
    // Text and images are answered whole: each waits its model's wait in all (the waits design of 2026-10-22).
    answersWhole: { complete: true, image: true },
    async complete(req) {
      const res = await opts.client.models.generateContent(withDeadline(googleParams(req, true), req.deadline));
      return { ...parseGoogleResponse(res, req.model), requestBody: googleParams(req, false) };
    },
    async image(req) {
      const params = googleImageParams(req);
      return { ...parseGoogleImage(await opts.client.models.generateContent(withDeadline(params, req.deadline)), req.model), requestBody: params };
    },
  };
}
