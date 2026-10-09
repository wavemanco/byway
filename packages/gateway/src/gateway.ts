import { canonicalize, sha256Hex } from '@byway/canonical';
import {
  GatewayError,
  MAX_PLAUSIBLE_CALL_USD,
  type ArtifactRecord,
  type ArtifactStore,
  type BrokenLine,
  type BudgetDetails,
  type LedgerAudit,
  type RecordedFault,
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
  type SettledCall,
  type SpendBook,
  type SpendContext,
  type SpendRecords,
  type SpendSummary,
  type VideoRequest,
  type VideoResult,
} from '@byway/contracts';
import { configuredProviders, isConfigured, KEY_VARS, keyFor, loadEnvFile, type Env } from './env.ts';
import { toGatewayError, type ClassifiedError } from './errors.ts';
import { estimateInputTokens, imageSize, maxCompletionCost, maxImageCost, maxVideoCost, textTokens } from './estimate.ts';
import { ExposureRegister, exposurePath } from './exposure.ts';
import { findHeldKey, heldKeyError } from './held-key.ts';
import { Ledger, setAsideTails, type LedgerDraft } from './ledger.ts';
import { PaidCalls, type PaidCall } from './paid.ts';
import { PRICES, priceFor, roundUsd, servedPrice, tokenCost, type PriceRow, type TokenBreakdown } from './prices.ts';
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
import { BILLABLE_CALL, BILLABLE_JOB, DEFAULT_RETRY, FREE_READ, withRetries, type RetryHooks, type RetryOptions } from './retry.ts';

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
  /**
   * The spend book (contracts v6; ADR-0095), the authority spend caps are checked against. Production roots pass the
   * store's (`store.spendBook`), which every process on the data directory shares; tests may pass one in memory
   * (memorySpendBook). Required, so no root can fall back to reservations one process cannot see beyond itself.
   */
  spendBook: SpendBook;
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
  /**
   * Anthropic server-side refusal fallback (default on). Admission reserves one attempt on the requested model, so a
   * refusal Anthropic routes to another model (or a sticky-routed call) can settle above its reservation (F04). Whether
   * to turn it off waits on the owner's decision (D1 in docs/backlog.md; ADR-0091 leaves it as it is).
   */
  anthropicRefusalFallback?: boolean;
  /**
   * How long a settled call waits for the ledger's cross-process lock to write its entry to the audit file before it
   * returns and leaves the entry to the gateway's timer. Default two seconds: the spend book already counts the call,
   * so a busy ledger delays the audit record, never the call or the caps (ADR-0095).
   */
  drainWaitMs?: number;
  /** How long a call in progress stays live in the spend book without renewal (default 60 s), and how often it is renewed (default 15 s). */
  leaseMs?: number;
  renewEveryMs?: number;
}

/** The contract's budget details, re-exported under the name this package has always used. */
export type { BudgetDetails };

/** A 'budget-exceeded' GatewayError, whose `budget` (optional on GatewayError) is always set. */
export type BudgetError = GatewayError & { budget: BudgetDetails };

const DEFAULT_MAX_OUTPUT = 16_000;
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

const invalid = (message: string) => new GatewayError('invalid-request', message);

/**
 * The model gateway (ADR-0030): the only path out for model, image and video calls. It resolves the profile's model for the
 * tier, checks the key exists (never exposing it), loads images from the artifact store, admits each call in the spend
 * book, which refuses one whose estimated cost would break a spend cap (estimate.ts: planning estimates, not bounds;
 * ADR-0095), retries transient failures, settles the true cost in the book, writes it to the hash-chained ledger, and
 * stores request and response bodies by hash.
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
  private readonly opts: GatewayOptions;
  private readonly exposure: ExposureRegister;
  private readonly book: SpendBook;
  private readonly paid: PaidCalls;

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
    if (!opts.spendBook) throw new Error('the gateway needs a spend book (GatewayOptions.spendBook): the store’s, or memorySpendBook() in a test');
    this.book = opts.spendBook;
    this.paid = new PaidCalls({
      book: this.book,
      ledger: this.ledger,
      ...(opts.leaseMs !== undefined ? { leaseMs: opts.leaseMs } : {}),
      ...(opts.renewEveryMs !== undefined ? { renewEveryMs: opts.renewEveryMs } : {}),
      ...(opts.drainWaitMs !== undefined ? { drainWaitMs: opts.drainWaitMs } : {}),
    });
    this.exposure = new ExposureRegister(exposurePath(opts.ledgerPath));
    for (const [id, adapter] of Object.entries(opts.adapters ?? {})) this.adapters.set(id as ProviderId, adapter);
  }

  /**
   * True when every call goes to the mock (contracts v4): demo mode forced (`pnpm demo`, the Settings switch), or no
   * provider key in the environment. Read from the environment each time, like the keys themselves, so a key added
   * later ends demo mode without a restart. With some keys but not a profile's, calls are not mocked: they fail with
   * 'no-credentials', which Settings explains.
   */
  /** See {@link GatewayOptions.drainWaitMs}. */
  get drainWaitMs(): number {
    return this.paid.drainWaitMs;
  }

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
    const inputTokens = estimateInputTokens({ ...(req.system ? { system: req.system } : {}), messages, imageSizes: sizes });
    const estimate = maxCompletionCost(price, inputTokens, maxOutputTokens);
    const op = await this.admit(req, 'completion', ref, estimate);
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
      // Before the call: a family is exposed by being used as a gate, whether or not the call then succeeds (CR12).
      await this.exposure.record(ref, req.purpose, req.workspaceId, this.now());
      const adapter = this.adapter(ref.provider);
      const reported = await withRetries(
        async () => {
          await op.markSent();
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
            const err = toGatewayError(e, ref.provider, redact);
            op.failed(err);
            throw err;
          }
        },
        this.retry,
        BILLABLE_CALL,
        this.retainBeforeResend(op, req.workspaceId, estimate),
      );
      const { completion: out, replaced } = finiteCompletion(reported, { inputTokens, outputTokens: maxOutputTokens });
      const { costUsd, assumed } = this.completionCost(ref, out);
      const entry = await this.record(
        op,
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
          ...(assumed || replaced ? { priceBasis: 'assumed' as const } : {}),
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
        costUsd: entry.costUsd,
        ledgerEntryId: entry.id,
      };
    } finally {
      await op.end();
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
    const adapter = this.adapter(ref.provider);
    const generate = adapter.image?.bind(adapter);
    if (!generate) throw invalid(`${ref.provider} does not generate images`);
    const estimate = maxImageCost(price, req);
    const op = await this.admit(req, 'image', ref, estimate);
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
      const reported = await withRetries(
        async () => {
          await op.markSent();
          try {
            return await generate({ model: ref.model, prompt: req.prompt, size: req.size, context: { workspaceId: req.workspaceId, ...ctxIds(req), purpose: req.purpose, profileId: req.profileId } });
          } catch (e) {
            const err = toGatewayError(e, ref.provider, redact);
            op.failed(err);
            throw err;
          }
        },
        this.retry,
        BILLABLE_CALL,
        this.retainBeforeResend(op, req.workspaceId, estimate),
      );
      const usage = finiteUsage(reported.usage, { inputTokens: textTokens(req.prompt), outputTokens: price.estimatedOutputTokensPerImage ?? 0, units: 1 });
      const out = { ...reported, usage: usage.usage };
      // Settled at the served model's row where it has one (F04): see servedPrice.
      const settled = servedPrice(this.prices, ref.provider, out.servedModel, price, this.now());
      const costUsd = roundUsd(tokenCost(settled.row, out.usage) + (settled.row.perImageUsd ?? 0) * (out.usage.units ?? 1));
      // Billed from here: keeping the image may fail, but the call is ledgered first either way (ENG-3).
      const kept = out.refusal ? undefined : await keep(() => this.artifacts.put(out.bytes, out.mediaType));
      const stored = kept?.record;
      const entry = await this.record(
        op,
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
          ...(settled.assumed || usage.replaced ? { priceBasis: 'assumed' as const } : {}),
        },
        { profileId: req.profileId, provider: ref.provider, model: ref.model, wire: out.requestBody },
        { servedModel: out.servedModel, usage: out.usage, ...(stored ? { artifactId: stored.id } : {}), ...(out.refusal ? { refusal: out.refusal } : {}), wire: out.responseBody },
        redact,
      );
      if (kept?.error !== undefined) throw billedFailure(redact, `${ref.provider} made the image and billed it, but it could not be stored`, kept.error);
      if (out.refusal || !stored) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal ?? 'returned no image'}`));
      return { artifactId: stored.id, mediaType: out.mediaType, servedModel: entry.servedModel, provider: ref.provider, costUsd: entry.costUsd, ledgerEntryId: entry.id };
    } finally {
      await op.end();
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
    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
      const mapped = <T>(fn: () => Promise<T>) => async () => {
        try {
          return await fn();
        } catch (e) {
          throw toGatewayError(e, ref.provider, redact);
        }
      };
      let out: Awaited<ReturnType<typeof generate>>;
      try {
        out = await generate({
          model: ref.model,
          prompt: req.prompt,
          durationSec: seconds,
          ...(req.shot !== undefined ? { shot: req.shot } : {}),
          ...(startFrame ? { startFrame } : {}),
          context: { workspaceId: req.workspaceId, ...ctxIds(req), purpose: req.purpose, profileId: req.profileId },
          attempt: (fn) => withRetries(mapped(fn), this.retry, FREE_READ),
          submit: async (fn, what) => {
            // The submission is the call's first billable request: the spend book marks the call sent before it.
            await op.markSent();
            try {
              return await withRetries(mapped(fn), this.retry, BILLABLE_JOB);
            } catch (e) {
              if ((e as ClassifiedError).billing !== 'maybe') throw e;
              // Not sent again (ADR-0091): a second submission is a second job, billed again.
              const err: ClassifiedError = new GatewayError(
                'provider-error',
                redact(`${ref.provider} may have accepted ${what} (${(e as Error).message}). byway did not send it again, because a second submission could make and bill another. Check your ${ref.provider} dashboard before trying this step again.`.slice(0, 2000)),
                false,
              );
              err.billing = 'maybe';
              throw err;
            }
          },
          accepted: (role, requestId) => op.accepted(role, requestId),
        });
      } catch (e) {
        // A job fal may have accepted (a lost answer, a status that could not be read) may be billed: the call ends
        // counted at its estimate against the workspace, as may have been billed (ADR-0095).
        op.failed(e);
        throw e;
      }
      // fal bills the seconds asked for; a provider that reports none is billed for those, one that reports an unreadable count is assumed to have been.
      const units = out.usage.units === undefined ? { value: seconds, replaced: false } : finiteNumber(out.usage.units, seconds);
      const costUsd = roundUsd(maxVideoCost(price, units.value, extras));
      // Billed from here: keeping the clip or its frame may fail, but the clip is ledgered first either way (ENG-3).
      const madeClip = out.clip;
      const madeFrame = out.lastFrame;
      const keptClip = madeClip ? await keep(() => this.artifacts.put(madeClip.bytes, madeClip.mediaType)) : undefined;
      const keptFrame = madeFrame ? await keep(() => this.artifacts.put(madeFrame.bytes, madeFrame.mediaType)) : undefined;
      const clip = keptClip?.record;
      const lastFrame = keptFrame?.record;
      const failure = out.failure !== undefined ? toGatewayError(out.failure, ref.provider, redact) : undefined;
      const entry = await this.record(
        op,
        {
          workspaceId: req.workspaceId,
          ...ctxIds(req),
          purpose: req.purpose,
          kind: 'video',
          provider: ref.provider,
          requestedModel: ref.model,
          servedModel: out.servedModel,
          usage: { inputTokens: 0, outputTokens: 0, units: units.value },
          costUsd,
          latencyMs: Date.now() - started,
          ...(units.replaced ? { priceBasis: 'assumed' as const } : {}),
        },
        { profileId: req.profileId, provider: ref.provider, model: ref.model, durationSec: req.durationSec, seconds, ...(req.shot !== undefined ? { shot: req.shot } : {}), wire: out.requestBody },
        {
          servedModel: out.servedModel,
          usage: { units: units.value },
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
        const what = !clip ? 'no usable clip could be downloaded' : `its last frame could not be extracted (the clip is kept as ${clip.id})`;
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
      return { artifactId: clip.id, mediaType, lastFrameArtifactId: lastFrame.id, lastFrameMediaType, servedModel: entry.servedModel, provider: ref.provider, costUsd: entry.costUsd, ledgerEntryId: entry.id };
    } finally {
      await op.end();
    }
  }

  /**
   * Spend from the spend book (ADR-0095), after reading in any ledger line it has not seen (entries from before the book,
   * an older worker's). Settled cost and cost by run are what the audit file records; calls under way and calls that
   * may have been billed are reported beside them.
   */
  async spend(workspaceId: string): Promise<SpendSummary> {
    await this.paid.absorb();
    const book = await this.book.spend(workspaceId);
    return {
      workspaceId,
      spentUsd: book.spentUsd,
      capUsd: await this.caps.workspaceCapUsd(workspaceId),
      byRun: book.byRun,
      inFlightUsd: book.inFlightUsd,
      uncertainUsd: book.uncertainUsd,
      ...(book.assumedPricing ? { assumedPricing: book.assumedPricing } : {}),
    };
  }

  verifyLedger(): Promise<string | null> {
    return this.ledger.verify();
  }

  async spendRecords(workspaceId: string): Promise<SpendRecords> {
    await this.paid.absorb();
    const records = await this.book.records(workspaceId);
    return { ...records, setAside: await setAsideTails(this.ledger.path) };
  }

  /**
   * The audit file checked on demand (Settings, the start-up report): its hash chain, and every call the spend book holds
   * as written to it found there at the same cost. A missing one is what a restore of an older or missing ledger.jsonl
   * leaves (the caps still count it: the book is the authority), or an OS crash that lost a line after it was marked.
   * Like a spend read, it first reads ledger lines the book has not seen into it, so it can say what the book did with
   * a line that is not an entry (brokenLine) and how many faults are open; otherwise it only reads.
   */
  async auditLedger(): Promise<LedgerAudit> {
    await this.paid.absorb();
    const brokenAt = await this.ledger.verify();
    const written = new Map<string, number>();
    for (const e of await this.ledger.entries()) if (typeof e.id === 'string') written.set(e.id, e.costUsd);
    const missing = (await this.book.ledgeredCalls()).filter((c) => {
      const cost = written.get(c.entryId);
      return cost === undefined || Math.abs(cost - c.costUsd) > 1e-9;
    });
    const pending = (await this.book.unledgered(10_000)).length;
    const faults = await this.book.faults();
    const brokenLine = await this.brokenLine(brokenAt, faults);
    return {
      brokenAt,
      missing,
      pending,
      setAside: await setAsideTails(this.ledger.path),
      openFaults: faults.filter((f) => !f.acknowledged).length,
      ...(brokenLine ? { brokenLine } : {}),
    };
  }

  /** What the spend book did with the line verify() names as `line:<n>` (see BrokenLine), from its faults and cursor. */
  private async brokenLine(brokenAt: string | null, faults: readonly RecordedFault[]): Promise<BrokenLine | undefined> {
    const m = /^line:(\d+)$/.exec(brokenAt ?? '');
    if (!m) return undefined;
    const line = Number(m[1]);
    const at = await this.ledger.lineAt(line);
    if (!at) return undefined;
    if (!at.complete) return { line, book: 'torn' };
    if (at.blank) return { line, book: 'blank' };
    const fault = faults.find((f) => f.offset === at.offset && f.sha256 === at.sha256);
    if (fault) return { line, book: fault.acknowledged ? 'acknowledged' : 'fault' };
    return { line, book: at.offset < (await this.book.cursor()).offset ? 'read-before' : 'unread' };
  }

  /**
   * A clean stop (PaidCalls.close): stops lease renewal and the outbox timer, hands this gateway's calls in progress back
   * to the spend book at once, and makes one last bounded write of the outbox; no paid call starts afterwards. Call
   * before closing the store.
   */
  close(): Promise<void> {
    return this.paid.close();
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
        adapter = falAdapter({ client: c.fal ?? createFalClient(key, this.opts.fetch), ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}) });
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
   * Admits a call in the spend book at its planning estimate (estimate.ts). The estimate is not a bound: a call can
   * settle above it, and settlement records the true cost, against which later calls are refused (ADR-0091). The book
   * holds every process's calls in flight, so the web process and the worker see each other's (ADR-0095). The caps are
   * read on every call, so a raised budget applies at once.
   */
  private async admit(req: SpendContext, kind: SettledCall['kind'], ref: ModelRef, estimateUsd: number): Promise<PaidCall> {
    const reserveUsd = roundUsd(estimateUsd);
    // No call can cost more than MAX_PLAUSIBLE_CALL_USD (ADR-0095), so a call estimated above it is a mistake, refused
    // before anything is reserved. It also means a call settled at its estimate (record) is always one the book can read.
    if (!(reserveUsd <= MAX_PLAUSIBLE_CALL_USD)) {
      throw invalid(`this call is estimated at $${reserveUsd.toFixed(2)}, more than byway allows for one call ($${MAX_PLAUSIBLE_CALL_USD.toFixed(2)})`);
    }
    return this.paid.admit(
      { workspaceId: req.workspaceId, ...ctxIds(req), purpose: req.purpose, kind, provider: ref.provider, model: ref.model, reserveUsd, paid: reserveUsd > 0 },
      async () => {
        const workspaceUsd = await this.caps.workspaceCapUsd(req.workspaceId);
        const runUsd = req.runId !== undefined && this.caps.runCapUsd ? await this.caps.runCapUsd(req.runId) : undefined;
        return { workspaceUsd, ...(runUsd !== undefined ? { runUsd } : {}) };
      },
    );
  }

  /**
   * Before a completion or an image is sent again after an attempt that may have been billed: that attempt's estimate
   * is retained against the workspace cap (not the run's), or, when it does not fit, the call stops with
   * 'budget-exceeded' at workspace scope instead of risking a second charge (ADR-0095).
   */
  private retainBeforeResend(op: PaidCall, workspaceId: string, estimateUsd: number): RetryHooks {
    return { beforeMaybeResend: async () => op.retain(roundUsd(estimateUsd), await this.caps.workspaceCapUsd(workspaceId)) };
  }

  /**
   * Provider-reported cost first (OpenRouter), else each model that served the call (every billed attempt of a refusal
   * fallback) at its own price (servedPrice). `assumed` is true when any of them had no price row and was settled at the
   * requested model's rates; the ledger records that (priceBasis), so the guess is visible, never silent (F04).
   */
  private completionCost(ref: ModelRef, out: ProviderCompletion): { costUsd: number; assumed: boolean } {
    if (out.reportedCostUsd !== undefined) return { costUsd: roundUsd(out.reportedCostUsd), assumed: false };
    const at = this.now();
    const requested = this.price(ref);
    let assumed = false;
    const priceOf = (model: string) => {
      const settled = servedPrice(this.prices, ref.provider, model, requested, at);
      assumed ||= settled.assumed;
      return settled.row;
    };
    const costUsd = out.usageByModel
      ? roundUsd(out.usageByModel.reduce((usd, u) => usd + tokenCost(priceOf(u.model), u.usage as TokenBreakdown), 0))
      : tokenCost(priceOf(out.servedModel), out.usage);
    return { costUsd, assumed };
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
   * Settles a call the provider has answered, and so billed, in the spend book, writes it to the audit file (waiting
   * briefly for the ledger's lock; the timer writes what it could not), then stores its request and response bodies
   * (redacted, canonical JSON) under the hashes the entry names. The settlement goes first (ENG-3): a local failure after
   * a provider answered must not lose the spend, and a plain error would make Temporal retry the activity and pay a
   * second time. So any failure from here on is a GatewayError that is not retryable and says the call was billed.
   */
  private async record(op: PaidCall, draft: Omit<LedgerDraft, 'requestSha256' | 'responseSha256' | 'operationId'>, request: unknown, response: unknown, redact: Redactor): Promise<{ id: string; servedModel: string; costUsd: number }> {
    // No call can cost more than MAX_PLAUSIBLE_CALL_USD (ADR-0095 decision 7): reported figures that price one above it
    // cannot be believed, so the call is settled at its planning estimate (which admission held to the ceiling), flagged
    // assumed, as when a figure is not a number at all. The usage the provider reported stays in the entry as reported.
    if (!(draft.costUsd >= 0 && draft.costUsd <= MAX_PLAUSIBLE_CALL_USD)) draft = { ...draft, costUsd: op.reserveUsd, priceBasis: 'assumed' };
    // Labels are first made hashable (providerLabel, F19), then scrubbed of held keys (scrubLabels, ADR-0088): the
    // redactor works on well-formed strings, and one value then flows to both the ledger and the caller.
    draft = scrubLabels(
      {
        ...draft,
        servedModel: providerLabel(draft.servedModel),
        ...(draft.upstreamProvider !== undefined ? { upstreamProvider: providerLabel(draft.upstreamProvider) } : {}),
      },
      redact,
    );
    const requestText = redact(canonicalOrJson({ purpose: draft.purpose, ...(request as object) }));
    const responseText = redact(canonicalOrJson(response));
    const billed = `${draft.provider} answered and billed this call (${draft.purpose})`;
    const entry: SettledCall = { ...draft, requestSha256: `sha256:${sha256Hex(requestText)}`, responseSha256: `sha256:${sha256Hex(responseText)}` };
    let id: string;
    try {
      id = await op.settle({ at: this.now().toISOString(), entry });
    } catch (e) {
      throw billedFailure(redact, `${billed}, but byway could not record its cost in its spending records, so it is counted at its estimate as "may have been billed" (Settings)`, e);
    }
    await op.end();
    try {
      await this.artifacts.putText(requestText, 'application/json');
      await this.artifacts.putText(responseText, 'application/json');
    } catch (e) {
      throw billedFailure(redact, `${billed} and its cost is recorded (entry ${id}), but its request and response could not be stored`, e);
    }
    return { id, servedModel: entry.servedModel, costUsd: entry.costUsd };
  }
}

/**
 * A provider-reported label (the served model, the upstream host) as the hash-chained ledger records it. Provider JSON
 * can carry a lone surrogate through a \u escape, which has no canonical form, yet a call the provider answered was
 * billed and must be ledgered (ENG-3, F19). So a lone surrogate is written as U+FFFD; the exact reply stays in the
 * stored response under responseSha256. A label that is not a string at all (adapters copy it unchecked) is written as
 * its JSON text, which escapes lone surrogates, for the same reason; an absent one stays absent, as before. Results
 * returned to callers carry the same value the ledger recorded (ADR-0088), so caller and ledger never disagree.
 */
function providerLabel(label: string): string {
  const value: unknown = label;
  if (typeof value === 'string') return value.toWellFormed();
  return value === undefined ? label : (JSON.stringify(value) ?? typeof value);
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

/**
 * A provider-reported count or cost as the ledger can record it (ADR-0083's hand-off, ADR-0095): one that is not a
 * finite, non-negative number (a JSON `1e400` parses as Infinity) has no canonical form, so the entry for a call that
 * was billed could not be written. Such a figure is replaced by the call's planning figure, and the entry says its
 * price is assumed (priceBasis), so the guess is visible rather than silent.
 */
function finiteNumber(value: unknown, fallback: number): { value: number; replaced: boolean } {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { value, replaced: false } : { value: fallback, replaced: true };
}

/**
 * Usage with every reported count finite (finiteNumber): input and output fall back to the call's planning figures,
 * units (when reported) to the request's, and a cache count that cannot be read is dropped (its tokens are then priced
 * as plain input).
 */
function finiteUsage<U extends TokenBreakdown>(usage: U | undefined, fallback: { inputTokens: number; outputTokens: number; units?: number }): { usage: U; replaced: boolean } {
  const input = finiteNumber(usage?.inputTokens, fallback.inputTokens);
  const output = finiteNumber(usage?.outputTokens, fallback.outputTokens);
  let replaced = input.replaced || output.replaced;
  const out: TokenBreakdown = { ...usage, inputTokens: input.value, outputTokens: output.value };
  for (const k of ['cacheReadTokens', 'cacheWriteTokens'] as const) {
    if (out[k] === undefined || !finiteNumber(out[k], 0).replaced) continue;
    delete out[k];
    replaced = true;
  }
  if (out.units !== undefined) {
    const units = finiteNumber(out.units, fallback.units ?? 0);
    replaced ||= units.replaced;
    out.units = units.value;
  }
  return { usage: out as U, replaced };
}

/** A completion with its usage, per-model usage and reported cost made finite; a cost that cannot be read is dropped. */
function finiteCompletion(out: ProviderCompletion, fallback: { inputTokens: number; outputTokens: number }): { completion: ProviderCompletion; replaced: boolean } {
  const usage = finiteUsage(out.usage, fallback);
  let replaced = usage.replaced;
  const completion: ProviderCompletion = { ...out, usage: usage.usage };
  if (out.usageByModel) {
    completion.usageByModel = out.usageByModel.map((u) => {
      const one = finiteUsage(u.usage, fallback);
      replaced ||= one.replaced;
      return { ...u, usage: one.usage };
    });
  }
  if (out.reportedCostUsd !== undefined && finiteNumber(out.reportedCostUsd, 0).replaced) {
    delete completion.reportedCostUsd;
    replaced = true;
  }
  return { completion, replaced };
}

export function createGateway(opts: GatewayOptions): ModelGateway {
  return new ModelGateway(opts);
}
