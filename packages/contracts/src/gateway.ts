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
  /**
   * A big-tier model from a different provider family than `tiers.big`, for critics whose `family` knob is 'other'
   * (01 CRITIC: a different-family critic for prose). Its use is recorded in the gateway's exposure register (CR12).
   */
  otherFamily?: ModelRef;
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

/** Which prompt template produced a call (from RenderedPrompt), recorded in the ledger for provenance (CR14). */
export interface PromptRef {
  id: string;
  version: number;
  /** "sha256:<hex>" of the template file. */
  hash: string;
  fidelity: 'verbatim' | 'paraphrase' | 'project';
}

export interface CompletionRequest extends SpendContext {
  /** The template behind this call; the gateway writes it into the ledger entry. Omitted only for template-free calls. */
  prompt?: PromptRef;
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
  /** 'max-tokens' when the answer was cut off at maxOutputTokens (callers should not trust a truncated parse). */
  stopReason?: 'end' | 'max-tokens';
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

export interface VideoRequest extends SpendContext {
  profileId: string;
  prompt: string;
  /**
   * The relay anchor: the clip starts from this exact frame (C5 relay links, 01 RELAY). Required by image-to-video
   * models (every v1 profile's video model); the mock does not need it.
   */
  startFrameArtifactId?: string;
  durationSec: number;
  /** The storyboard shot this clip is for (1-based), for labels and the ledger. */
  shot?: number;
}

export interface VideoResult {
  /**
   * The clip, stored in the artifact store immediately (provider URLs expire): video/mp4 from real providers; the
   * demo-mode mock stores a labelled placeholder (an animated SVG) instead.
   */
  artifactId: string;
  /** The clip's media type: 'video/mp4', or 'image/svg+xml' for the demo placeholder. */
  mediaType: 'video/mp4' | 'image/svg+xml';
  /** The clip's last frame, the anchor the next relay link starts from. */
  lastFrameArtifactId: string;
  /** Stored under its real type (the provider's frame extractor does not promise PNG). */
  lastFrameMediaType: MediaType;
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
  /**
   * Calls in this workspace whose served model had no price row, so they were settled at the requested model's rates
   * (LedgerEntry.priceBasis 'assumed'): how many, and what they were counted at. Absent when there are none.
   */
  assumedPricing?: { calls: number; usd: number };
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
  /** The host that actually served a routed call (OpenRouter's pinned upstream). Covered by the hash chain. */
  upstreamProvider?: string;
  /** The prompt template behind a completion (CompletionRequest.prompt). Covered by the hash chain. */
  prompt?: PromptRef;
  /**
   * 'assumed' when a served model had no price row and was settled at the requested model's rates (F04, ADR-0091);
   * absent when every model was priced at its own row or as a snapshot of a priced model. Covered by the hash chain.
   */
  priceBasis?: 'assumed';
}

export type GatewayErrorCode =
  | 'no-credentials'
  | 'budget-exceeded'
  | 'provider-error'
  | 'rate-limited'
  | 'refused'
  | 'invalid-request'
  | 'unknown-profile';

/** What a 'budget-exceeded' refusal carries, so the runner can offer "Raise the budget by $X?" (spec §3.4). */
export interface BudgetDetails {
  scope: 'workspace' | 'run';
  capUsd: number;
  spentUsd: number;
  /** In-flight calls' estimates, already counted against the cap. */
  reservedUsd: number;
  estimateUsd: number;
  /** How much the cap would need to rise for this call to proceed. */
  shortfallUsd: number;
}

export class GatewayError extends Error {
  override name = 'GatewayError';
  readonly code: GatewayErrorCode;
  readonly retryable: boolean;
  /** Set on 'budget-exceeded'. */
  budget?: BudgetDetails;
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

/** Whether a profile can run with the keys in the environment. Names providers only, never keys. */
export interface ProfileStatus {
  profile: ModelProfile;
  /** True when every text tier's provider has a key. */
  usable: boolean;
  /** Providers whose keys are missing for the text tiers. */
  missing: ProviderId[];
  /** True when the profile has an image model and its provider has a key. */
  images: boolean;
  /** True when the profile has a video model and its provider has a key (C5 relay links; ADR-0069). */
  video: boolean;
  /** True when the profile has an other-family critic model and its provider has a key. */
  otherFamily: boolean;
}

export interface Gateway {
  /**
   * True when every call goes to the mock provider (demo mode forced, or no keys). Callers then use the 'demo'
   * profile for estimates and for image/video availability, whatever profile the preferences name.
   */
  readonly demo: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  image(req: ImageRequest): Promise<ImageResult>;
  /** Fails with 'no-credentials' when the profile has no video model or its provider has no key. */
  video(req: VideoRequest): Promise<VideoResult>;
  spend(workspaceId: string): Promise<SpendSummary>;
  providers(): ProviderStatus[];
  /** Profiles usable now (only 'demo' in demo mode or with no keys). */
  profiles(): ModelProfile[];
  /** Every profile with what it is missing, for Settings. */
  profileStatus(): ProfileStatus[];
  /**
   * Verify the ledger hash chain; returns the first broken entry id (`line:<n>` for a line that is not an entry, `head`
   * for a head record that cannot be read), or null if intact. Reports damage rather than throwing on it.
   */
  verifyLedger(): Promise<string | null>;
}
