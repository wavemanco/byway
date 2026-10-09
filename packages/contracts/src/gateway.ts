/**
 * The model gateway: the only path out for every model, image and video call (ADR-0030).
 * Implemented by @byway/gateway. Keys come from the environment only and never appear in requests, logs or the store.
 */

import type { LedgerAudit, SpendRecords } from './spend.ts';

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
  /**
   * The call's identity across Temporal's attempts of its step, and its caller's liveness (stage 3, ADR-0099). The
   * runner's memo layer sets it on a step's calls, after hashing the request, so memo keys are unchanged. Never sent to a
   * provider or recorded.
   * - `key`: the run and memo key of the call (AdmitRequest.operationKey). While one attempt holds it, another waits for
   *   its result (GatewayError 'in-flight') instead of paying again; a dead or timed-out holder's call is taken over.
   * - `cancel`: aborts when Temporal cancels the attempt (a cancel, a timeout, a lost worker): an unsettled call is held
   *   no longer, so a later attempt can take it over within one lease.
   * - `until`: aborts when the attempt's invocation ends: a settled call is held until then, while its result is kept.
   * - `rebuy`: the caller was told an earlier attempt settled the call (GatewayError.settledEarlier), looked for its kept
   *   result and found none: buy it again (counted).
   */
  operation?: { key: string; until: AbortSignal; cancel?: AbortSignal; rebuy?: boolean };
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

/**
 * Spend as the spend book holds it (ADR-0095). `spentUsd` and `byRun` are settled cost only, as the audit file records
 * it, so a run's recorded cost never includes a guess. What is under way and what may have been billed are separate.
 */
export interface SpendSummary {
  workspaceId: string;
  spentUsd: number;
  capUsd: number;
  byRun: Record<string, number>;
  /** Reservations of calls under way now (counted against the caps until they settle). */
  inFlightUsd?: number;
  /**
   * Calls that may have been billed and whose cost is not known (an attempt that failed after its request may have
   * reached the provider, or a call whose caller stopped or died while waiting), counted at their estimate against the
   * workspace cap until the person clears them in Settings. Never charged to a run's cap.
   */
  uncertainUsd?: number;
  /**
   * Calls in this workspace recorded on an assumption (LedgerEntry.priceBasis 'assumed': a served model with no price
   * row, an answer that named no served model, or usage or a cost byway could not use): how many, and what they were
   * counted at. Absent when there are none.
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
   * 'assumed' when byway assumed part of what this entry records instead of reading it from the provider's answer:
   * - a served model with no price row (or a label that is not text) was settled at the requested model's rates (F04,
   *   ADR-0091);
   * - the answer named no served model (the field missing, null or empty): it is recorded as the requested model, and
   *   was priced at that model's rates unless the provider reported its cost (ADR-0095 decision 7);
   * - a usage count or cost that was not a finite, non-negative number was replaced by the call's planning figure; or
   *   the reported figures would price the call above MAX_PLAUSIBLE_CALL_USD, so it was settled at its planning
   *   estimate (ADR-0095 decision 7).
   * Absent when every model was priced at its own row or as a snapshot of a priced model, from figures the provider
   * reported. Covered by the hash chain.
   */
  priceBasis?: 'assumed';
  /**
   * The spend-book operation this entry records (ADR-0095), so the book and the audit file reconcile one-to-one: an entry
   * written twice, or found again after a restart, is recognised. Absent on entries from before the book. Covered by the
   * hash chain.
   */
  operationId?: string;
}

export type GatewayErrorCode =
  | 'no-credentials'
  | 'budget-exceeded'
  | 'provider-error'
  | 'rate-limited'
  | 'refused'
  | 'invalid-request'
  | 'unknown-profile'
  /** The spend book found a line in the audit file it cannot read: paid calls wait until it is acknowledged (ADR-0095). */
  | 'accounting-fault'
  /**
   * byway's own failure around a call, not the provider's (ADR-0099): it could not keep or record a call the provider
   * answered (`billed` is then true: trying again pays again), or it did not start the call at all (it is stopping, or
   * could not record the call as sent; `billed` false). These used to be 'provider-error', which read as the provider
   * not answering.
   */
  | 'byway-failure'
  /**
   * Another attempt of the same call (the same operation key: a step Temporal runs again while its first attempt still
   * holds the call) is under way. The runner waits for that attempt's result instead of paying again (ADR-0099).
   */
  | 'in-flight';

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
  /** Workspace scope: calls that may have been billed, counted until cleared in Settings (ADR-0095). */
  uncertainUsd?: number;
}

export class GatewayError extends Error {
  override name = 'GatewayError';
  readonly code: GatewayErrorCode;
  readonly retryable: boolean;
  /** Set on 'budget-exceeded'. */
  budget?: BudgetDetails;
  /**
   * Whether the provider was paid for this call before it failed (ADR-0099). True when the provider answered and billed
   * it but byway could not use, keep or record the answer: trying the call again pays for it again, so callers say so
   * and do not retry. False when byway knows nothing was sent. Absent when it is not known (a provider's own failure).
   */
  billed?: boolean;
  /**
   * Set on 'in-flight' when an earlier attempt settled the call and has ended (ADR-0099): its result may be kept (the
   * runner's memo), so the caller looks for it before asking again with SpendContext.operation.rebuy.
   */
  settledEarlier?: boolean;
  constructor(code: GatewayErrorCode, message: string, retryable = false, opts: { billed?: boolean; settledEarlier?: boolean } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    if (opts.billed !== undefined) this.billed = opts.billed;
    if (opts.settledEarlier) this.settledEarlier = true;
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
  /** What Settings lists of the spend book (ADR-0095): calls under way, calls that may have been billed, faults, set-aside tails. */
  spendRecords(workspaceId: string): Promise<SpendRecords>;
  /**
   * The audit file's chain, and the audit file against the spend book (on demand: it reads the whole file). New ledger
   * lines are read into the book first, so it can say what the book did with a line that is not an entry, and how many
   * faults are open.
   */
  auditLedger(): Promise<LedgerAudit>;
  /**
   * A clean stop: stops the gateway's lease renewal and outbox timer, hands its calls in progress back to the spend book
   * at once (SpendBook.endLeases), and makes a last bounded write of the outbox; it starts no paid call afterwards. Call
   * before closing the store.
   */
  close(): Promise<void>;
}
