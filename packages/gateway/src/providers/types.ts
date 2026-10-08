import type { ImageRequest, MediaType, ProviderId, SpendContext, Tier, Usage } from '@byway/contracts';
import type { TokenBreakdown } from '../prices.ts';

/** An image part with its bytes loaded from the artifact store. */
export interface ResolvedImage {
  artifactId: string;
  mediaType: MediaType;
  base64: string;
}

export type ResolvedPart = { type: 'text'; text: string } | { type: 'image'; image: ResolvedImage };

export interface ResolvedMessage {
  role: 'user' | 'assistant';
  content: ResolvedPart[];
}

/** Who is asking: the mock answers by purpose and counts critic iterations by run and step. */
export type CallContext = SpendContext & { tier?: Tier; profileId: string };

export interface ProviderCompletionRequest {
  model: string;
  system?: string;
  messages: ResolvedMessage[];
  maxOutputTokens: number;
  responseFormat: 'text' | 'json';
  context: CallContext;
}

export interface ProviderCompletion {
  text: string;
  servedModel: string;
  /** Total tokens across every attempt the provider billed for this call. */
  usage: TokenBreakdown;
  /** Per-model usage when more than one model served the call (Anthropic refusal fallbacks), for pricing. */
  usageByModel?: { model: string; usage: TokenBreakdown }[];
  /** Cost the provider itself reports (OpenRouter `usage.cost`), preferred over the price table. */
  reportedCostUsd?: number;
  /** The host that actually served a routed call (OpenRouter). */
  upstreamProvider?: string;
  /** Set when the provider declined: the call is still ledgered (it may be billed) before the gateway raises 'refused'. */
  refusal?: string;
  /** True when the answer was cut off at the output limit; the gateway reports it as stopReason 'max-tokens'. */
  truncated?: boolean;
  /** The request as sent, with image bytes replaced by artifact references. Stored by hash, never inline. */
  requestBody: unknown;
  /** The provider's response as plain JSON. */
  responseBody: unknown;
}

export interface ProviderImageRequest {
  model: string;
  prompt: string;
  size: ImageRequest['size'];
  context: CallContext;
}

export interface ProviderImage {
  bytes: Uint8Array;
  mediaType: MediaType;
  servedModel: string;
  usage: Usage;
  refusal?: string;
  requestBody: unknown;
  /** The provider's response as plain JSON, with image bytes removed (they go to the artifact store). */
  responseBody: unknown;
}

/**
 * The one small interface every provider adapter implements. Adapters translate requests and parse responses; the
 * gateway owns credentials, budgets, retries, the ledger and storage. SDK clients are injected, so tests use fakes.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  complete(req: ProviderCompletionRequest): Promise<ProviderCompletion>;
  image?(req: ProviderImageRequest): Promise<ProviderImage>;
}

/** Concatenated text of a message's text parts. */
export function textOf(parts: ResolvedPart[]): string {
  return parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n');
}

/** Image data as sent (inline base64) or as logged (a reference to the artifact that holds the bytes). */
export function imageData(image: ResolvedImage, inline: boolean): string {
  return inline ? image.base64 : `artifact:${image.artifactId}`;
}

/** A plain-JSON copy (class instances and undefined fields dropped), safe to canonicalize and hash. */
export function plain(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export const IMAGE_ASPECT: Record<ImageRequest['size'], string> = {
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3',
};
