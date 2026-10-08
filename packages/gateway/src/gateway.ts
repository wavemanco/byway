import { canonicalize, sha256Hex } from '@byway/canonical';
import {
  GatewayError,
  type ArtifactRecord,
  type ArtifactStore,
  type BudgetDetails,
  type CompletionRequest,
  type CompletionResult,
  type Gateway,
  type ImageRequest,
  type ImageResult,
  type MediaType,
  type ModelProfile,
  type ModelRef,
  type ProfileStatus,
  type PromptRef,
  type ProviderId,
  type ProviderStatus,
  type SpendSummary,
  type VideoRequest,
  type VideoResult,
} from '@byway/contracts';
import { configuredProviders, isConfigured, KEY_VARS, keyFor, loadEnvFile, type Env } from './env.ts';
import { toGatewayError } from './errors.ts';
import { estimateInputTokens, imageSize, maxCompletionCost, maxImageCost, maxVideoCost } from './estimate.ts';
import { ExposureRegister, exposurePath } from './exposure.ts';
import { findHeldKey, heldKeyError } from './held-key.ts';
import { Ledger, type LedgerDraft } from './ledger.ts';
import { PRICES, priceFor, roundUsd, tokenCost, type PriceRow, type TokenBreakdown } from './prices.ts';
import { DEMO_PROFILE_ID, OPENROUTER_PINS, PROFILES, profileStatus } from './profiles.ts';
import { anthropicAdapter, createAnthropicClient, type AnthropicClientLike } from './providers/anthropic.ts';
import { createFalClient, falAdapter, type FalClientLike } from './providers/fal.ts';
import { createGoogleClient, googleAdapter, type GoogleClientLike } from './providers/google.ts';
import { mockAdapter } from './providers/mock.ts';
import { createOpenAIClient, openaiAdapter, type OpenAIClientLike } from './providers/openai.ts';
import { createOpenRouterClient, openrouterAdapter } from './providers/openrouter.ts';
import type { ProviderAdapter, ProviderCompletion, ProviderVideoRequest, ResolvedImage, ResolvedMessage } from './providers/types.ts';
import type { Responder } from './mock/responders.ts';
import { makeRedactor, type Redactor } from './redact.ts';
import { DEFAULT_RETRY, withRetries, type RetryOptions } from './retry.ts';

/** Where spend caps come from: the workspace budget (Workspace.budgetUsd) and each run's budget (StartRunInput.budgetUsd). */
export interface CapsSource {
  workspaceCapUsd(workspaceId: string): number | Promise<number>;
  /** The run's cap, or undefined when the run has none. Consulted on every call, so a raised budget applies at once. */
  runCapUsd?(runId: string): number | undefined | Promise<number | undefined>;
}

export interface GatewayOptions {
  /** The hash-chained JSONL ledger (spec §2: `<BYWAY_DATA_DIR>/ledger.jsonl`). */
  ledgerPath: string;
  /** Request and response bodies and generated images are stored here; the ledger keeps their hashes. */
  artifacts: ArtifactStore;
  caps: CapsSource;
  /** Where keys are read. Defaults to process.env. Read at call time, so keys added later are picked up. */
  env?: Env;
  /** A dotenv file (`.env.agents`) loaded into `env` at construction, filling only missing variables. */
  envFile?: string;
  /** Route every call to the mock provider (`pnpm demo`; spec §5 "Demo mode"). */
  demo?: boolean;
  /** Injected SDK clients (tests pass fakes). Missing ones are built from the environment's keys on first use. */
  clients?: { anthropic?: AnthropicClientLike; openai?: OpenAIClientLike; google?: GoogleClientLike; openrouter?: OpenAIClientLike; fal?: FalClientLike };
  /** Downloads generated media from provider URLs (fal.ai clips and frames). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Replace whole adapters (tests). */
  adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  /** Override mock answers by purpose or role. */
  mockResponders?: Readonly<Record<string, Responder>>;
  profiles?: readonly ModelProfile[];
  prices?: readonly PriceRow[];
  retry?: Partial<RetryOptions>;
  now?: () => Date;
  /** Output allowance when a request names none; it also bounds the pre-call estimate. */
  defaultMaxOutputTokens?: number;
  /** Anthropic server-side refusal fallback (default on). */
  anthropicRefusalFallback?: boolean;
  /**
   * How long a call the provider has already answered (and billed) waits for the ledger's cross-process lock before the
   * gateway gives up on ledgering it. Default two minutes: losing a billed entry under-counts spend, and failing the
   * call would make the runner retry it and pay again (ENG-3).
   */
  billedLedgerWaitMs?: number;
}

/** The contract's budget details, re-exported under the name this package has always used. */
export type { BudgetDetails };

/** A 'budget-exceeded' GatewayError, whose `budget` (optional on GatewayError) is always set. */
export type BudgetError = GatewayError & { budget: BudgetDetails };

const DEFAULT_MAX_OUTPUT = 16_000;
const DEFAULT_BILLED_LEDGER_WAIT_MS = 120_000;
const MAX_OUTPUT_LIMIT = 128_000;
const TIERS = new Set(['big', 'mid']);
const MEDIA_TYPES = new Set<MediaType>(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);
const MOCK_MODELS = { big: 'mock-big', mid: 'mock-mid', image: 'mock-image', video: 'mock-video' } as const;
/** Relay links are a few seconds each (03 C5); a request far beyond that is a mistake, not a clip. */
const MAX_VIDEO_SECONDS = 60;
/** The clip types VideoResult.mediaType can name: real providers' MP4, and the demo mock's labelled SVG placeholder. */
const CLIP_TYPES = new Set<VideoResult['mediaType']>(['video/mp4', 'image/svg+xml']);
const FIDELITIES = new Set<PromptRef['fidelity']>(['verbatim', 'paraphrase', 'project']);
const SHA256_ID = /^sha256:[0-9a-f]{64}$/;

interface Reservation {
  workspaceId: string;
  runId?: string;
  usd: number;
}

const invalid = (message: string) => new GatewayError('invalid-request', message);

/**
 * The model gateway (ADR-0030): the only path out for model, image and video calls. It resolves the profile's model for the
 * tier, checks the key exists (never exposing it), loads images from the artifact store, refuses calls whose
 * worst case would break a spend cap, retries transient failures, stores request and response bodies by hash, and
 * appends every call to the hash-chained ledger.
 */
export class ModelGateway implements Gateway {
  private readonly forcedDemo: boolean;
  private readonly env: Env;
  private readonly ledger: Ledger;
  private readonly artifacts: ArtifactStore;
  private readonly caps: CapsSource;
  private readonly allProfiles: readonly ModelProfile[];
  private readonly prices: readonly PriceRow[];
  private readonly retry: RetryOptions;
  private readonly now: () => Date;
  private readonly defaultMaxOutput: number;
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();
  private readonly reservations = new Set<Reservation>();
  private readonly opts: GatewayOptions;
  private readonly exposure: ExposureRegister;
  /** See {@link GatewayOptions.billedLedgerWaitMs}. */
  readonly billedLedgerWaitMs: number;

  constructor(opts: GatewayOptions) {
    this.opts = opts;
    this.env = opts.env ?? process.env;
    if (opts.envFile) loadEnvFile(opts.envFile, this.env);
    this.forcedDemo = opts.demo ?? false;
    this.ledger = new Ledger({ path: opts.ledgerPath, ...(opts.now ? { now: opts.now } : {}) });
    this.artifacts = opts.artifacts;
    this.caps = opts.caps;
    this.allProfiles = opts.profiles ?? PROFILES;
    this.prices = opts.prices ?? PRICES;
    this.retry = { ...DEFAULT_RETRY, ...opts.retry };
    this.now = opts.now ?? (() => new Date());
    this.defaultMaxOutput = opts.defaultMaxOutputTokens ?? DEFAULT_MAX_OUTPUT;
    this.billedLedgerWaitMs = opts.billedLedgerWaitMs ?? DEFAULT_BILLED_LEDGER_WAIT_MS;
    this.exposure = new ExposureRegister(exposurePath(opts.ledgerPath));
    for (const [id, adapter] of Object.entries(opts.adapters ?? {})) this.adapters.set(id as ProviderId, adapter);
  }

  /**
   * True when every call goes to the mock (contracts v4): demo mode forced (`pnpm demo`, the Settings switch), or no
   * provider key in the environment. Read from the environment each time, like the keys themselves, so a key added
   * later ends demo mode without a restart. With some keys but not a profile's, calls are not mocked: they fail with
   * 'no-credentials', which Settings explains.
   */
  get demo(): boolean {
    if (this.forcedDemo) return true;
    return (Object.keys(KEY_VARS) as (keyof typeof KEY_VARS)[]).every((provider) => !isConfigured(this.env, provider));
  }

  providers(): ProviderStatus[] {
    return configuredProviders(this.env);
  }

  /** Profiles that can run with the keys present (only the demo profile in demo mode). */
  profiles(): ModelProfile[] {
    if (this.demo) return this.allProfiles.filter((p) => p.id === DEMO_PROFILE_ID);
    return this.profileStatus()
      .filter((s) => s.usable)
      .map((s) => s.profile);
  }

  /** Every profile with what it needs, for the settings screen. Provider names only, never keys. */
  profileStatus(): ProfileStatus[] {
    return profileStatus(this.allProfiles, this.env);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    validateSpend(req);
    if (!TIERS.has(req.tier)) throw invalid(`unknown tier "${String(req.tier)}"`);
    if (!Array.isArray(req.messages) || req.messages.length === 0) throw invalid('a completion needs at least one message');
    const maxOutputTokens = req.maxOutputTokens ?? this.defaultMaxOutput;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_OUTPUT_LIMIT) {
      throw invalid(`maxOutputTokens must be an integer from 1 to ${MAX_OUTPUT_LIMIT}`);
    }
    const prompt = req.prompt === undefined ? undefined : promptRef(req.prompt);
    this.refuseHeldKeys(requestTexts(req));
    const profile = this.profile(req.profileId);
    const ref = this.completionModel(req, profile);
    this.requireKey(ref.provider);
    const price = this.price(ref);
    const { messages, sizes } = await this.resolveMessages(req.messages);
    const estimate = maxCompletionCost(price, estimateInputTokens({ ...(req.system ? { system: req.system } : {}), messages, imageSizes: sizes }), maxOutputTokens);
    const reservation = await this.reserve(req, estimate);
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
      // Before the call: a family is exposed by being used as a gate, whether or not the call then succeeds (CR12).
      await this.exposure.record(ref, req.purpose, req.workspaceId, this.now());
      const adapter = this.adapter(ref.provider);
      const out = await withRetries(async () => {
        try {
          return await adapter.complete({
            model: ref.model,
            ...(req.system ? { system: req.system } : {}),
            messages,
            maxOutputTokens,
            responseFormat: req.responseFormat ?? 'text',
            context: { workspaceId: req.workspaceId, ...ctxIds(req), purpose: req.purpose, tier: req.tier, profileId: req.profileId },
          });
        } catch (e) {
          throw toGatewayError(e, ref.provider, redact);
        }
      }, this.retry);
      const costUsd = this.completionCost(ref, out);
      const entry = await this.record(
        {
          workspaceId: req.workspaceId,
          ...ctxIds(req),
          purpose: req.purpose,
          kind: 'completion',
          provider: ref.provider,
          requestedModel: ref.model,
          servedModel: out.servedModel,
          usage: { inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens },
          costUsd,
          latencyMs: Date.now() - started,
          ...(out.upstreamProvider ? { upstreamProvider: out.upstreamProvider } : {}),
          // Provenance (spec §3.3): the template behind the call, inside the hash chain like every other field.
          ...(prompt ? { prompt } : {}),
        },
        { profileId: req.profileId, tier: req.tier, provider: ref.provider, model: ref.model, wire: out.requestBody },
        { servedModel: out.servedModel, usage: out.usage, ...(out.refusal ? { refusal: out.refusal } : {}), wire: out.responseBody },
        redact,
      );
      if (out.refusal) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal}`));
      // The answer crosses into byway here: one holding a key is never handed on (ADR-0088). The call is already
      // ledgered with its evidence redacted, and it is not retried, because a retry would pay again.
      const echoed = findHeldKey(this.env, [out.text]);
      if (echoed) {
        throw heldKeyError('provider-error', redact(`${ref.provider} answered and billed this call (${req.purpose}), but its answer contained your ${echoed}, so byway did not use it. It is not retried, because a retry would pay again.`), echoed);
      }
      return {
        text: out.text,
        // A cut-off answer is still returned (and was billed); callers decide whether a partial parse is usable.
        stopReason: out.truncated ? 'max-tokens' : 'end',
        servedModel: entry.servedModel,
        provider: ref.provider,
        usage: { inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens },
        costUsd,
        ledgerEntryId: entry.id,
      };
    } finally {
      this.reservations.delete(reservation);
    }
  }

  async image(req: ImageRequest): Promise<ImageResult> {
    validateSpend(req);
    if (typeof req.prompt !== 'string' || !req.prompt.trim()) throw invalid('an image needs a prompt');
    if (!IMAGE_SIZES.has(req.size)) throw invalid(`unsupported image size "${String(req.size)}"`);
    this.refuseHeldKeys([req.prompt]);
    const profile = this.profile(req.profileId);
    const ref: ModelRef | undefined = this.demo ? { provider: 'mock', model: MOCK_MODELS.image } : profile.image;
    if (!ref) throw invalid(`profile "${profile.id}" has no image model`);
    this.requireKey(ref.provider);
    const price = this.price(ref);
    const reservation = await this.reserve(req, maxImageCost(price, req));
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
      const adapter = this.adapter(ref.provider);
      const generate = adapter.image?.bind(adapter);
      if (!generate) throw invalid(`${ref.provider} does not generate images`);
      const out = await withRetries(async () => {
        try {
          return await generate({ model: ref.model, prompt: req.prompt, size: req.size, context: { workspaceId: req.workspaceId, ...ctxIds(req), purpose: req.purpose, profileId: req.profileId } });
        } catch (e) {
          throw toGatewayError(e, ref.provider, redact);
        }
      }, this.retry);
      const costUsd = roundUsd(tokenCost(price, out.usage) + (price.perImageUsd ?? 0) * (out.usage.units ?? 1));
      // Billed from here: keeping the image may fail, but the call is ledgered first either way (ENG-3).
      const kept = out.refusal ? undefined : await keep(() => this.artifacts.put(out.bytes, out.mediaType));
      const stored = kept?.record;
      const entry = await this.record(
        {
          workspaceId: req.workspaceId,
          ...ctxIds(req),
          purpose: req.purpose,
          kind: 'image',
          provider: ref.provider,
          requestedModel: ref.model,
          servedModel: out.servedModel,
          usage: out.usage,
          costUsd,
          latencyMs: Date.now() - started,
        },
        { profileId: req.profileId, provider: ref.provider, model: ref.model, wire: out.requestBody },
        { servedModel: out.servedModel, usage: out.usage, ...(stored ? { artifactId: stored.id } : {}), ...(out.refusal ? { refusal: out.refusal } : {}), wire: out.responseBody },
        redact,
      );
      if (kept?.error !== undefined) throw billedFailure(redact, `${ref.provider} made the image and billed it, but it could not be stored`, kept.error);
      if (out.refusal || !stored) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal ?? 'returned no image'}`));
      return { artifactId: stored.id, mediaType: out.mediaType, servedModel: entry.servedModel, provider: ref.provider, costUsd, ledgerEntryId: entry.id };
    } finally {
      this.reservations.delete(reservation);
    }
  }

  /**
   * One relay link (ADR-0069): a clip from the start frame, stored at once with its last frame (the next link's
   * anchor). It fails with 'no-credentials' when the profile has no video model or its provider has no key. The
   * budget check uses the clip's seconds at the model's price plus the provider's helper calls at their bound. A clip
   * that was generated is ledgered even when keeping it or its last frame then fails: it was billed.
   */
  async video(req: VideoRequest): Promise<VideoResult> {
    validateSpend(req);
    if (typeof req.prompt !== 'string' || !req.prompt.trim()) throw invalid('a video needs a prompt');
    if (typeof req.durationSec !== 'number' || !Number.isFinite(req.durationSec) || req.durationSec <= 0 || req.durationSec > MAX_VIDEO_SECONDS) {
      throw invalid(`durationSec must be a number of seconds above 0 and at most ${MAX_VIDEO_SECONDS}`);
    }
    if (req.shot !== undefined && (!Number.isSafeInteger(req.shot) || req.shot < 1)) throw invalid(`shot must be a storyboard shot number from 1, got ${String(req.shot)}`);
    this.refuseHeldKeys([req.prompt]);
    const profile = this.profile(req.profileId);
    const ref: ModelRef | undefined = this.demo ? { provider: 'mock', model: MOCK_MODELS.video } : profile.video;
    if (!ref) throw new GatewayError('no-credentials', `profile "${profile.id}" has no video model`);
    this.requireKey(ref.provider);
    const price = this.price(ref);
    const adapter = this.adapter(ref.provider);
    const generate = adapter.video?.bind(adapter);
    if (!generate) throw invalid(`${ref.provider} does not generate video`);
    const extras = (adapter.videoExtras ?? []).map((x) => ({ ...x, price: this.price({ provider: ref.provider, model: x.model }) }));
    let startFrame: ProviderVideoRequest['startFrame'];
    if (req.startFrameArtifactId !== undefined) {
      if (!(await this.artifacts.has(req.startFrameArtifactId))) throw invalid(`start frame artifact ${req.startFrameArtifactId} is not in the store`);
      const { record, bytes } = await this.artifacts.get(req.startFrameArtifactId);
      startFrame = { artifactId: record.id, bytes, mediaType: record.mediaType };
    }
    const seconds = adapter.videoSeconds?.(ref.model, req.durationSec) ?? Math.ceil(req.durationSec);
    const reservation = await this.reserve(req, maxVideoCost(price, seconds, extras));
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
      const out = await generate({
        model: ref.model,
        prompt: req.prompt,
        durationSec: seconds,
        ...(req.shot !== undefined ? { shot: req.shot } : {}),
        ...(startFrame ? { startFrame } : {}),
        context: { workspaceId: req.workspaceId, ...ctxIds(req), purpose: req.purpose, profileId: req.profileId },
        attempt: (fn) =>
          withRetries(async () => {
            try {
              return await fn();
            } catch (e) {
              throw toGatewayError(e, ref.provider, redact);
            }
          }, this.retry),
      });
      const units = out.usage.units ?? seconds;
      const costUsd = roundUsd(maxVideoCost(price, units, extras));
      // Billed from here: keeping the clip or its frame may fail, but the clip is ledgered first either way (ENG-3).
      const madeClip = out.clip;
      const madeFrame = out.lastFrame;
      const keptClip = madeClip ? await keep(() => this.artifacts.put(madeClip.bytes, madeClip.mediaType)) : undefined;
      const keptFrame = madeFrame ? await keep(() => this.artifacts.put(madeFrame.bytes, madeFrame.mediaType)) : undefined;
      const clip = keptClip?.record;
      const lastFrame = keptFrame?.record;
      const failure = out.failure !== undefined ? toGatewayError(out.failure, ref.provider, redact) : undefined;
      const entry = await this.record(
        {
          workspaceId: req.workspaceId,
          ...ctxIds(req),
          purpose: req.purpose,
          kind: 'video',
          provider: ref.provider,
          requestedModel: ref.model,
          servedModel: out.servedModel,
          usage: { inputTokens: 0, outputTokens: 0, units },
          costUsd,
          latencyMs: Date.now() - started,
        },
        { profileId: req.profileId, provider: ref.provider, model: ref.model, durationSec: req.durationSec, seconds, ...(req.shot !== undefined ? { shot: req.shot } : {}), wire: out.requestBody },
        {
          servedModel: out.servedModel,
          usage: { units },
          ...(clip ? { artifactId: clip.id } : {}),
          ...(lastFrame ? { lastFrameArtifactId: lastFrame.id } : {}),
          ...(failure ? { failure: failure.message } : {}),
          wire: out.responseBody,
        },
        redact,
      );
      if (keptClip?.error !== undefined) throw billedFailure(redact, `${ref.provider} made the clip and billed it, but it could not be stored`, keptClip.error);
      if (keptFrame?.error !== undefined) {
        throw billedFailure(redact, `${ref.provider} made the clip and billed it, but its last frame could not be stored (the clip is kept as ${clip?.id ?? 'nothing'})`, keptFrame.error);
      }
      if (failure || !clip || !lastFrame) {
        const what = !clip ? 'it could not be downloaded' : `its last frame could not be extracted (the clip is kept as ${clip.id})`;
        // Not retryable: a retry would generate (and bill) another clip; the run decides what to do instead.
        throw new GatewayError(failure?.code ?? 'provider-error', redact(`${ref.provider} made the clip and billed it, but ${what}: ${failure?.message ?? 'no media arrived'}`));
      }
      // The contract names two clip types (MP4, and the demo's SVG placeholder) and three frame types. Anything else is
      // kept and ledgered above (it was billed) but not handed to a run that could not show or relay it.
      const mediaType = clip.mediaType as VideoResult['mediaType'];
      if (!CLIP_TYPES.has(mediaType)) {
        throw new GatewayError('provider-error', `${ref.provider} made the clip and billed it, but it is ${clip.mediaType}, not MP4 (the clip is kept as ${clip.id})`);
      }
      const lastFrameMediaType = lastFrame.mediaType as MediaType;
      if (!MEDIA_TYPES.has(lastFrameMediaType)) {
        throw new GatewayError('provider-error', `${ref.provider} returned a last frame of type ${lastFrame.mediaType}, not PNG, JPEG or WebP (the clip is kept as ${clip.id})`);
      }
      return { artifactId: clip.id, mediaType, lastFrameArtifactId: lastFrame.id, lastFrameMediaType, servedModel: entry.servedModel, provider: ref.provider, costUsd, ledgerEntryId: entry.id };
    } finally {
      this.reservations.delete(reservation);
    }
  }

  async spend(workspaceId: string): Promise<SpendSummary> {
    const byRun: Record<string, number> = {};
    let spent = 0;
    for (const e of await this.ledger.entries()) {
      if (e.workspaceId !== workspaceId) continue;
      spent += e.costUsd;
      if (e.runId) byRun[e.runId] = roundUsd((byRun[e.runId] ?? 0) + e.costUsd);
    }
    return { workspaceId, spentUsd: roundUsd(spent), capUsd: await this.caps.workspaceCapUsd(workspaceId), byRun };
  }

  verifyLedger(): Promise<string | null> {
    return this.ledger.verify();
  }

  private profile(id: string): ModelProfile {
    const profile = this.allProfiles.find((p) => p.id === id);
    if (!profile) throw new GatewayError('unknown-profile', `no model profile "${id}"`);
    return profile;
  }

  /**
   * Refuses a request whose text holds a provider key byway has, before anything is reserved, recorded or sent
   * (ADR-0088). Every caller goes through here, so a key pasted into someone's material never reaches a provider.
   * The request is refused, not rewritten: the person's text is never silently changed.
   */
  private refuseHeldKeys(texts: Iterable<string | undefined>): void {
    const name = findHeldKey(this.env, texts);
    if (name) throw heldKeyError('invalid-request', `This request contains your ${name}. byway never sends a key to a model; remove it from the material and try again.`, name);
  }

  private requireKey(provider: ProviderId): void {
    if (!isConfigured(this.env, provider)) throw new GatewayError('no-credentials', `no key is configured for ${provider}`);
  }

  /** Budgets cannot be enforced for a model without a price, so such a call is refused. */
  private price(ref: ModelRef): PriceRow {
    const price = priceFor(this.prices, ref.provider, ref.model, this.now());
    if (!price) throw invalid(`no price is recorded for ${ref.provider}/${ref.model}; add it to prices.ts before using it`);
    return price;
  }

  private adapter(provider: ProviderId): ProviderAdapter {
    const cached = this.adapters.get(provider);
    if (cached) return cached;
    const key = keyFor(this.env, provider) ?? '';
    const c = this.opts.clients ?? {};
    let adapter: ProviderAdapter;
    switch (provider) {
      case 'anthropic':
        adapter = anthropicAdapter({ client: c.anthropic ?? createAnthropicClient(key), refusalFallback: this.opts.anthropicRefusalFallback ?? true });
        break;
      case 'openai':
        adapter = openaiAdapter({ client: c.openai ?? createOpenAIClient(key) });
        break;
      case 'google':
        adapter = googleAdapter({ client: c.google ?? createGoogleClient(key) });
        break;
      case 'openrouter':
        adapter = openrouterAdapter({ client: c.openrouter ?? createOpenRouterClient(key), pins: OPENROUTER_PINS });
        break;
      case 'fal':
        adapter = falAdapter({ client: c.fal ?? createFalClient(key), ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}) });
        break;
      case 'mock':
        adapter = mockAdapter(this.opts.mockResponders ? { responders: this.opts.mockResponders } : {});
        break;
      default:
        throw invalid(`${provider} has no adapter in this version`);
    }
    this.adapters.set(provider, adapter);
    return adapter;
  }

  private async resolveMessages(input: CompletionRequest['messages']): Promise<{ messages: ResolvedMessage[]; sizes: Map<string, { width: number; height: number } | undefined> }> {
    const sizes = new Map<string, { width: number; height: number } | undefined>();
    const messages: ResolvedMessage[] = [];
    for (const m of input) {
      if (m.role !== 'user' && m.role !== 'assistant') throw invalid(`unknown message role "${String(m.role)}"`);
      if (!Array.isArray(m.content) || m.content.length === 0) throw invalid('every message needs content');
      const content: ResolvedMessage['content'] = [];
      for (const part of m.content) {
        if (part.type === 'text') {
          if (typeof part.text !== 'string') throw invalid('a text part needs text');
          content.push({ type: 'text', text: part.text });
        } else if (part.type === 'image') {
          if (!MEDIA_TYPES.has(part.mediaType)) throw invalid(`unsupported image type "${String(part.mediaType)}"`);
          if (!(await this.artifacts.has(part.artifactId))) throw invalid(`image artifact ${part.artifactId} is not in the store`);
          const { bytes } = await this.artifacts.get(part.artifactId);
          const image: ResolvedImage = { artifactId: part.artifactId, mediaType: part.mediaType, base64: Buffer.from(bytes).toString('base64') };
          sizes.set(part.artifactId, imageSize(bytes));
          content.push({ type: 'image', image });
        } else {
          throw invalid(`unknown content part "${String((part as { type?: unknown }).type)}"`);
        }
      }
      messages.push({ role: m.role, content });
    }
    return { messages, sizes };
  }

  /**
   * Check the caps and reserve the call's worst case. The check and the reservation happen in one synchronous step
   * after the last await, so concurrent calls in this process see each other's reservations. Calls from another
   * process are seen once they reach the ledger.
   */
  private async reserve(ctx: { workspaceId: string; runId?: string }, estimateUsd: number): Promise<Reservation> {
    const wsCap = await this.caps.workspaceCapUsd(ctx.workspaceId);
    const runCap = ctx.runId !== undefined && this.caps.runCapUsd ? await this.caps.runCapUsd(ctx.runId) : undefined;
    const entries = await this.ledger.entries();
    const sum = (keep: (x: { workspaceId: string; runId?: string }) => boolean) => {
      let spent = 0;
      for (const e of entries) if (keep(e)) spent += e.costUsd;
      let reserved = 0;
      for (const r of this.reservations) if (keep(r)) reserved += r.usd;
      return { spent: roundUsd(spent), reserved: roundUsd(reserved) };
    };
    const check = (scope: 'workspace' | 'run', capUsd: number, keep: (x: { workspaceId: string; runId?: string }) => boolean) => {
      const { spent, reserved } = sum(keep);
      const total = spent + reserved + estimateUsd;
      if (total > capUsd + 1e-9) {
        const budget: BudgetDetails = { scope, capUsd, spentUsd: spent, reservedUsd: reserved, estimateUsd: roundUsd(estimateUsd), shortfallUsd: roundUsd(Math.max(0, total - capUsd)) };
        const err = new GatewayError(
          'budget-exceeded',
          `the ${scope} budget of $${capUsd.toFixed(2)} would be exceeded: $${spent.toFixed(4)} spent, $${reserved.toFixed(4)} in flight, and this call may cost up to $${budget.estimateUsd.toFixed(4)}`,
        );
        err.budget = budget;
        throw err;
      }
    };
    check('workspace', wsCap, (x) => x.workspaceId === ctx.workspaceId);
    if (runCap !== undefined) check('run', runCap, (x) => x.runId === ctx.runId);
    const reservation: Reservation = { workspaceId: ctx.workspaceId, ...(ctx.runId !== undefined ? { runId: ctx.runId } : {}), usd: estimateUsd };
    this.reservations.add(reservation);
    return reservation;
  }

  /** Provider-reported cost first (OpenRouter), else per-model prices for fallbacks, else the served model's price. */
  private completionCost(ref: ModelRef, out: ProviderCompletion): number {
    if (out.reportedCostUsd !== undefined) return roundUsd(out.reportedCostUsd);
    const at = this.now();
    // A served model we have no price for is charged at the requested model's price, which we know exists.
    const priceOf = (model: string) => priceFor(this.prices, ref.provider, model, at) ?? this.price(ref);
    if (out.usageByModel) return roundUsd(out.usageByModel.reduce((usd, u) => usd + tokenCost(priceOf(u.model), u.usage as TokenBreakdown), 0));
    return tokenCost(priceOf(out.servedModel), out.usage);
  }

  /**
   * The model for a completion: the request's override (an other-family critic, contracts v5) or the profile's tier
   * model. In demo mode every call goes to the mock: a mock override (the demo profile's other-family stand-in) is
   * served as asked, so a demo run takes the same path a configured one does; anything else gets the mock tier model.
   */
  private completionModel(req: CompletionRequest, profile: ModelProfile): ModelRef {
    if (this.demo) return req.model?.provider === 'mock' ? req.model : { provider: 'mock', model: MOCK_MODELS[req.tier] };
    return req.model ?? profile.tiers[req.tier];
  }

  /**
   * Ledgers a call the provider has answered, and so billed, then stores its request and response bodies (redacted,
   * canonical JSON) under the hashes the entry names. The entry goes first (ENG-3): a local failure after a provider
   * answered must not lose the spend, and a plain error would make Temporal retry the activity and pay a second time.
   * So the ledger is given a long wait for its lock, and any failure from here on is a GatewayError that is not
   * retryable and says the call was billed.
   */
  private async record(draft: Omit<LedgerDraft, 'requestSha256' | 'responseSha256'>, request: unknown, response: unknown, redact: Redactor) {
    draft = scrubLabels(draft, redact);
    const requestText = redact(canonicalOrJson({ purpose: draft.purpose, ...(request as object) }));
    const responseText = redact(canonicalOrJson(response));
    const billed = `${draft.provider} answered and billed this call (${draft.purpose})`;
    let entry;
    try {
      entry = await this.ledger.append(
        { ...draft, requestSha256: `sha256:${sha256Hex(requestText)}`, responseSha256: `sha256:${sha256Hex(responseText)}` },
        { lockTimeoutMs: this.billedLedgerWaitMs },
      );
    } catch (e) {
      throw billedFailure(redact, `${billed}, but it could not be written to the ledger, so the spend caps do not count it`, e);
    }
    try {
      await this.artifacts.putText(requestText, 'application/json');
      await this.artifacts.putText(responseText, 'application/json');
    } catch (e) {
      throw billedFailure(redact, `${billed} and it is in the ledger (entry ${entry.id}), but its request and response could not be stored`, e);
    }
    return entry;
  }
}

/** The outcome of keeping media a provider made: its record, or the error (kept for after the call is ledgered). */
async function keep(put: () => Promise<ArtifactRecord>): Promise<{ record?: ArtifactRecord; error?: unknown }> {
  try {
    return { record: await put() };
  } catch (error) {
    return { error: error ?? new Error('unknown error') };
  }
}

/**
 * A failure after a provider was paid: never retryable, because retrying the call (here, or by Temporal re-running the
 * activity) would pay again for what was already bought.
 */
function billedFailure(redact: Redactor, what: string, cause: unknown): GatewayError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new GatewayError('provider-error', redact(`${what}: ${reason}. It is not retried, because a retry would pay again.`.slice(0, 2000)), false);
}

/**
 * Provider metadata is a label, not content: a key in the served model or the upstream host is scrubbed for the ledger
 * (and the result, which returns what the ledger recorded), never a reason to refuse a call that was paid for (ADR-0088).
 */
function scrubLabels<T extends { servedModel: string; upstreamProvider?: string }>(draft: T, redact: Redactor): T {
  return { ...draft, servedModel: redact(draft.servedModel), ...(draft.upstreamProvider !== undefined ? { upstreamProvider: redact(draft.upstreamProvider) } : {}) };
}

/** The text a completion request sends: its system text and every text part (malformed parts are refused later). */
function* requestTexts(req: CompletionRequest): Generator<string> {
  if (typeof req.system === 'string') yield req.system;
  for (const m of req.messages) {
    for (const part of Array.isArray(m?.content) ? m.content : []) if (part?.type === 'text' && typeof part.text === 'string') yield part.text;
  }
}

function validateSpend(req: { workspaceId?: unknown; purpose?: unknown; profileId?: unknown }): void {
  if (typeof req.workspaceId !== 'string' || !req.workspaceId) throw invalid('workspaceId is required');
  if (typeof req.purpose !== 'string' || !req.purpose) throw invalid('purpose is required (spec §3.3)');
  if (typeof req.profileId !== 'string' || !req.profileId) throw invalid('profileId is required');
}

/**
 * The prompt ref as the ledger records it (contracts v4 PromptRef, from RenderedPrompt): only its four fields, checked,
 * so a malformed ref fails the call before anything is spent instead of writing provenance nobody can check.
 */
function promptRef(value: unknown): PromptRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid('prompt must be a prompt ref { id, version, hash, fidelity }');
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id.trim()) throw invalid('prompt.id must be a template id');
  if (!Number.isSafeInteger(p.version) || (p.version as number) < 1) throw invalid('prompt.version must be a positive integer');
  if (typeof p.hash !== 'string' || !SHA256_ID.test(p.hash)) throw invalid('prompt.hash must be "sha256:<64 hex>"');
  if (!FIDELITIES.has(p.fidelity as PromptRef['fidelity'])) throw invalid('prompt.fidelity must be verbatim, paraphrase or project');
  return { id: p.id, version: p.version as number, hash: p.hash, fidelity: p.fidelity as PromptRef['fidelity'] };
}

function ctxIds(req: { runId?: string; stepId?: string }): { runId?: string; stepId?: string } {
  return { ...(req.runId !== undefined ? { runId: req.runId } : {}), ...(req.stepId !== undefined ? { stepId: req.stepId } : {}) };
}

/** Canonical JSON when the body allows it (it nearly always does); plain JSON otherwise, so storing never fails a call. */
function canonicalOrJson(body: unknown): string {
  const plainBody = JSON.parse(JSON.stringify(body ?? null)) as unknown;
  try {
    return canonicalize(plainBody);
  } catch {
    return JSON.stringify(plainBody);
  }
}

export function createGateway(opts: GatewayOptions): ModelGateway {
  return new ModelGateway(opts);
}
