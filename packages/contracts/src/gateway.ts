/**
 * The model gateway: the only path out for every model, image and video call (ADR-0030).
 * Implemented by @byway/gateway. Keys come from the environment only and never appear in requests, logs or the store.
 */

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'fal' | 'mock';

/** Judgment uses the big tier, execution the mid tier (default rule 5). */
export type Tier = 'big' | 'mid';

export interface ModelRef {
  provider: ProviderId;
  /** Exact provider model id, e.g. "claude-opus-5-5". */
  model: string;
}

/** A named mapping from tiers (and media) to concrete models. Profiles are data, chosen per run. */
export interface ModelProfile {
  id: string;
  label: string;
  tiers: Record<Tier, ModelRef>;
  image?: ModelRef;
  video?: ModelRef;
}

export type MediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export type ContentPart =
  | { type: 'text'; text: string }
  /** Images travel by artifact id; the gateway loads bytes from the artifact store. */
  | { type: 'image'; artifactId: string; mediaType: MediaType };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

/** Who is spending, for the ledger and the spend caps. */
export interface SpendContext {
  workspaceId: string;
  runId?: string;
  stepId?: string;
  /**
   * Purpose label (product spec §3.3): `<role>:<medium>` for recipe steps (e.g. `build:web-page`, `critic:prose`),
   * or a helper (`asset.briefs:web-page`, `asset.integrate:web-page`, `voice.apply:<medium>`, `rerank:<medium>`,
   * `advisor.intake`, `advisor.compose`, `advisor.compose.repair`). The mock provider answers by purpose.
   */
  purpose: string;
}

export interface CompletionRequest extends SpendContext {
  tier: Tier;
  /** Overrides the profile's model for this tier (rare; e.g. a different family for a held-out judge). */
  model?: ModelRef;
  profileId: string;
  system?: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  /** 'json' asks the provider for a JSON object; the gateway still returns text. */
  responseFormat?: 'text' | 'json';
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Image or video units, when relevant. */
  units?: number;
}

export interface CompletionResult {
  text: string;
  /** Model id the provider reports it served (may differ from the requested alias). */
  servedModel: string;
  provider: ProviderId;
  usage: Usage;
  costUsd: number;
  ledgerEntryId: string;
}

export interface ImageRequest extends SpendContext {
  profileId: string;
  prompt: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
}

export interface ImageResult {
  /** The gateway stores generated media in the artifact store immediately (provider URLs expire). */
  artifactId: string;
  mediaType: MediaType;
  servedModel: string;
  provider: ProviderId;
  costUsd: number;
  ledgerEntryId: string;
}

export interface SpendSummary {
  workspaceId: string;
  spentUsd: number;
  capUsd: number;
  byRun: Record<string, number>;
}

/** One append-only, hash-chained ledger entry (CR7). Request and response bodies are stored by hash, not inline. */
export interface LedgerEntry {
  id: string;
  seq: number;
  at: string;
  prevHash: string;
  hash: string;
  workspaceId: string;
  runId?: string;
  stepId?: string;
  purpose: string;
  kind: 'completion' | 'image' | 'video';
  provider: ProviderId;
  requestedModel: string;
  servedModel: string;
  requestSha256: string;
  responseSha256: string;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
}

export type GatewayErrorCode =
  | 'no-credentials'
  | 'budget-exceeded'
  | 'provider-error'
  | 'rate-limited'
  | 'refused'
  | 'invalid-request'
  | 'unknown-profile';

export class GatewayError extends Error {
  override name = 'GatewayError';
  readonly code: GatewayErrorCode;
  readonly retryable: boolean;
  constructor(code: GatewayErrorCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ProviderStatus {
  provider: ProviderId;
  /** True when a key for this provider is present in the environment. The key itself is never exposed. */
  configured: boolean;
}

export interface Gateway {
  complete(req: CompletionRequest): Promise<CompletionResult>;
  image(req: ImageRequest): Promise<ImageResult>;
  spend(workspaceId: string): Promise<SpendSummary>;
  providers(): ProviderStatus[];
  profiles(): ModelProfile[];
  /** Verify the ledger hash chain; returns the first broken entry id, or null if intact. */
  verifyLedger(): Promise<string | null>;
}
