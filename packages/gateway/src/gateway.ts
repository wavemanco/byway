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
  type DeclinedAttempt,
  type DeclineRecord,
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
import { cleanReason, declineAdvice, declineStory, notMadeProblem, stoppedBeforeRetry } from './declines.ts';
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
  // No option asks a provider for a fallback model (ADR-0102, the owner's decision D1): the model a profile names is the
  // only one that may answer, for the product and the study engine alike, and a decline is asked once more on it.
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
 * stores request and response bodies by hash. The model it calls is the one the profile names, and only that one: no
 * provider is asked for a fallback model, and a call the model declines is asked once more on it, then ends plainly
 * (askOnceMore; ADR-0102).
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
    const prep: CompletionPrep = { ref, messages, inputTokens, maxOutputTokens, estimate, ...(prompt ? { prompt } : {}) };
    // A decline an earlier attempt of the step kept (ADR-0102): the retry alone, never the declined call again.
    const earlier = req.operation?.declinedEarlier;
    const first = earlier ? declinedFrom(earlier) : await this.completeOnce(await this.admit(req, 'completion', ref, estimate), req, prep);
    if ('answer' in first) return first.answer;
    // The model declined (ADR-0102): one retry on the same model, as a call of its own, then a plain failure.
    return this.askOnceMore(req, 'completion', ref, estimate, first, (call, op) => this.completeOnce(op, call, prep, first.entryId));
  }

  /**
   * One attempt at a completion, admitted as `op`: sent (with transport retries), settled, ledgered (as a retry of
   * `retryOf` when it is one), and returned as its answer, or as a decline (ADR-0102) for the caller to decide about.
   */
  private async completeOnce(op: PaidCall, req: CompletionRequest, prep: CompletionPrep, retryOf?: string): Promise<Attempt<CompletionResult>> {
    const { ref, messages, inputTokens, maxOutputTokens, estimate, prompt } = prep;
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
      const declined = out.declined ? declineMark(out.declined, redact) : undefined;
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
          // The ledger shows the decline and the retry (ADR-0102), inside the hash chain.
          ...(declined ? { declined } : {}),
          ...(retryOf !== undefined ? { retryOf } : {}),
        },
        { profileId: req.profileId, tier: req.tier, provider: ref.provider, model: ref.model, wire: out.requestBody },
        { servedModel: out.servedModel, usage: out.usage, ...(out.refusal ? { refusal: out.refusal } : {}), wire: out.responseBody },
        redact,
      );
      if (declined) return { declined, entryId: entry.id, costUsd: entry.costUsd, ...retainedOf(op) };
      // From here the call is settled and ledgered: a failure says so, with its entry and cost (GatewayError.settled).
      const ledgered = { ledgerEntryId: entry.id, costUsd: entry.costUsd };
      if (out.refusal) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal}`), false, { settled: ledgered });
      // The answer crosses into byway here: one holding a key is never handed on (ADR-0088). The call is already
      // ledgered with its evidence redacted, and it is not retried, because a retry would pay again.
      const echoed = findHeldKey(this.env, [out.text]);
      if (echoed) {
        throw Object.assign(heldKeyError('provider-error', redact(`${ref.provider} answered and billed this call (${req.purpose}), but its answer contained your ${echoed}, so byway did not use it. It is not retried, because a retry would pay again.`), echoed), { billed: true, settled: ledgered });
      }
      return {
        answer: {
          text: out.text,
          // A cut-off answer is still returned (and was billed); callers decide whether a partial parse is usable.
          stopReason: out.truncated ? 'max-tokens' : 'end',
          servedModel: entry.servedModel,
          provider: ref.provider,
          usage: { inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens },
          costUsd: entry.costUsd,
          ledgerEntryId: entry.id,
        },
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
    const prep: ImagePrep = { ref, price, generate, estimate };
    const earlier = req.operation?.declinedEarlier;
    const first = earlier ? declinedFrom(earlier) : await this.imageOnce(await this.admit(req, 'image', ref, estimate), req, prep);
    if ('answer' in first) return first.answer;
    // The image model declined (ADR-0102): one retry on the same model, as a call of its own, then a plain failure.
    return this.askOnceMore(req, 'image', ref, estimate, first, (call, op) => this.imageOnce(op, call, prep, first.entryId));
  }

  /** One attempt at an image, admitted as `op`, as {@link completeOnce} for a completion. */
  private async imageOnce(op: PaidCall, req: ImageRequest, prep: ImagePrep, retryOf?: string): Promise<Attempt<ImageResult>> {
    const { ref, price, generate, estimate } = prep;
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
      const kept = out.refusal || out.declined ? undefined : await keep(() => this.artifacts.put(out.bytes, out.mediaType));
      const stored = kept?.record;
      const declined = out.declined ? declineMark(out.declined, redact) : undefined;
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
          ...(declined ? { declined } : {}),
          ...(retryOf !== undefined ? { retryOf } : {}),
        },
        { profileId: req.profileId, provider: ref.provider, model: ref.model, wire: out.requestBody },
        { servedModel: out.servedModel, usage: out.usage, ...(stored ? { artifactId: stored.id } : {}), ...(out.refusal ? { refusal: out.refusal } : {}), wire: out.responseBody },
        redact,
      );
      // From here the call is settled and ledgered: a failure says so, with its entry and cost (GatewayError.settled).
      const ledgered = { ledgerEntryId: entry.id, costUsd: entry.costUsd };
      if (kept?.error !== undefined) throw billedFailure(redact, `${ref.provider} made the image and billed it, but it could not be stored`, kept.error, ledgered);
      if (declined) return { declined, entryId: entry.id, costUsd: entry.costUsd, ...retainedOf(op) };
      // An answer with no usable image that is not a decline: refused, not asked again here (ENG-5); the asset step decides.
      if (out.refusal || !stored) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal ?? 'returned no image'}`), false, { settled: ledgered });
      return { answer: { artifactId: stored.id, mediaType: out.mediaType, servedModel: entry.servedModel, provider: ref.provider, costUsd: entry.costUsd, ledgerEntryId: entry.id } };
    } finally {
      await op.end();
    }
  }

  /**
   * The one refusal rule (ADR-0102, the owner's decision D1): a call the model declined is asked once more, on the same
   * model with the same request, and then the call ends. The retry is a paid call of its own: admitted in the spend book
   * against both caps at the call's estimate (its admission can refuse it), sent with the gateway's transport retries,
   * settled and ledgered with `retryOf` naming the declined call's entry. A step's retry is keyed
   * `<key>/after-decline/<declined entry id>` (ADR-0099): an identity of its own, with the same `until` and `cancel`, and
   * a rebuy only when the caller asked for the retry alone (`declinedEarlier`) as a rebuy.
   *
   * The decline is kept by a caller that keeps outcomes (SpendContext.operation): handed over (`keepDecline`) before the
   * retry is admitted, or kept by an earlier attempt (`declinedEarlier`, when the declined call is not made again). With
   * it kept, an attempt that ends before the retry is made (its step was stopped, byway is stopping, another attempt holds
   * the retry) is not an outcome: that failure is thrown as it is, and the step's next attempt asks for the retry alone.
   * Without it kept (the advisor's calls, or a hook that failed), the same is a final 'not-made'.
   *
   * The outcome: the retry's answer, with `declined` set and the declined attempt's cost added to `costUsd`; or a
   * 'refused' GatewayError, never retryable, whose message says what happened (who declined, the reason given), what
   * became of the retry, what each attempt was billed (a retry billed without a usable answer included), what byway
   * counts for either as "may have been billed" (a send retained before it was sent again, a retry that ended unsettled),
   * and what to do; for a retry billed that byway could not keep (`billed`), that failure's own words instead of the
   * advice. The answer's `declined` names the same amounts. A budget with no room for the retry, or paid calls paused,
   * ends the call here, and no budget question is asked (ADR-0102 Decision 2). The runner's memo keeps the outcome, so a
   * step that runs again gets it back and asks nothing: the runner's image step leaves a declined image alone (unless the
   * failure is billed, which stops it), and Temporal does not retry the failure.
   */
  private async askOnceMore<Q extends SpendContext, R extends { costUsd: number; ledgerEntryId: string }>(
    req: Q,
    kind: 'completion' | 'image',
    ref: ModelRef,
    estimate: number,
    first: Declined,
    again: (call: Q, op: PaidCall) => Promise<Attempt<R>>,
  ): Promise<R & { declined: DeclineRecord }> {
    const redact = makeRedactor(this.env);
    const base = {
      provider: ref.provider,
      model: ref.model,
      purpose: req.purpose,
      kind,
      ...(first.declined.reason !== undefined ? { reason: first.declined.reason } : {}),
      ledgerEntryId: first.entryId,
      costUsd: first.costUsd,
      ...(first.uncertainUsd !== undefined ? { uncertainUsd: first.uncertainUsd } : {}),
    };
    // A retry billed that byway could not keep (its media, its request and response, or its cost could not be stored or
    // recorded), or would not use (its answer held one of the person's keys, ADR-0088), is told in that failure's own words ("It is not retried, because a retry would pay again."), not with the
    // advice for a decline: the second ask was answered, and the fault is byway's. It stays billed, so a caller with tries
    // of its own stops, as for any billed failure (ADR-0090, ADR-0099).
    const fail = (record: DeclineRecord, opts: { budget?: BudgetDetails; billed?: boolean } = {}) =>
      new GatewayError('refused', redact(opts.billed ? declineStory(record) : `${declineStory(record)} ${declineAdvice(opts.budget)}`), false, { declined: record, ...(opts.billed ? { billed: true } : {}) });
    const caller = req.operation;
    const earlier = caller?.declinedEarlier !== undefined;
    const kept = earlier || (await keepDecline(caller, first));
    // The retry was not made, for a reason that passes: with the decline kept it is no outcome (see above).
    const notYet = (err: GatewayError, problem: string) => (kept ? err : fail({ ...base, retry: 'not-made', problem }));
    if (caller?.cancel?.aborted) throw notYet(new GatewayError('byway-failure', stoppedBeforeRetry(base), false, { billed: false }), 'the step was stopped');
    const { operation: _ignored, ...rest } = req;
    const retryOp = caller
      ? { key: `${caller.key}/after-decline/${first.entryId}`, until: caller.until, ...(caller.cancel ? { cancel: caller.cancel } : {}), ...(earlier && caller.rebuy === true ? { rebuy: true } : {}) }
      : undefined;
    const call = (retryOp ? { ...rest, operation: retryOp } : rest) as Q;
    let op: PaidCall;
    try {
      op = await this.admit(call, kind, ref, estimate);
    } catch (e) {
      const err = e instanceof GatewayError ? e : toGatewayError(e, ref.provider, redact);
      if (passing(err)) throw notYet(err, notMadeProblem(err) ?? err.message);
      throw fail({ ...base, retry: 'not-made', problem: notMadeProblem(err) ?? err.message }, err.budget ? { budget: err.budget } : {});
    }
    let second: Attempt<R>;
    try {
      second = await again(call, op);
    } catch (e) {
      const err = e instanceof GatewayError ? e : toGatewayError(e, ref.provider, redact);
      // byway could not mark it sent, so it did not send it: not made, like a refusal at admission.
      if (passing(err)) throw notYet(err, notMadeProblem(err) ?? err.message);
      // Settled and ledgered, then unusable: billed, and counted. Unsettled after a send that may have arrived: counted
      // at its estimate until cleared in Settings (ADR-0095), which the message says (retryUncertainUsd, below).
      const billed = err.settled ? { retryLedgerEntryId: err.settled.ledgerEntryId, retryCostUsd: err.settled.costUsd } : {};
      throw fail({ ...base, retry: 'failed', problem: err.message, ...billed, ...retryMaybe(op) }, { billed: err.billed === true });
    }
    // In every outcome the retry was sent in, what the book counts for it as "may have been billed" is named: a send
    // retained before it was sent again, and (above) its estimate when it ended unsettled (PaidCall.uncertainUsd).
    if (!('answer' in second)) throw fail({ ...base, retry: 'declined', retryLedgerEntryId: second.entryId, retryCostUsd: second.costUsd, ...retryMaybe(op) });
    const declined: DeclineRecord = { ...base, retry: 'answered', retryLedgerEntryId: second.answer.ledgerEntryId, retryCostUsd: second.answer.costUsd, ...retryMaybe(op) };
    return { ...second.answer, costUsd: roundUsd(first.costUsd + second.answer.costUsd), declined };
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
          // An earlier attempt's jobs the provider accepted (stage 3): polled by their ids, never submitted again.
          ...(op.resumed ? { resume: op.resumed } : {}),
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
        throw new GatewayError(failure?.code ?? 'provider-error', redact(`${ref.provider} made the clip and billed it, but ${what}: ${failure?.message ?? 'no media arrived'}`), false, { billed: true });
      }
      // The contract names two clip types (MP4, and the demo's SVG placeholder) and three frame types. Anything else is
      // kept and ledgered above (it was billed) but not handed to a run that could not show or relay it.
      const mediaType = clip.mediaType as VideoResult['mediaType'];
      if (!CLIP_TYPES.has(mediaType)) {
        throw new GatewayError('provider-error', `${ref.provider} made the clip and billed it, but it is ${clip.mediaType}, not MP4 (the clip is kept as ${clip.id})`, false, { billed: true });
      }
      const lastFrameMediaType = lastFrame.mediaType as MediaType;
      if (!MEDIA_TYPES.has(lastFrameMediaType)) {
        throw new GatewayError('provider-error', `${ref.provider} made the clip and billed it, but returned a last frame of type ${lastFrame.mediaType}, not PNG, JPEG or WebP (the clip is kept as ${clip.id})`, false, { billed: true });
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
        adapter = anthropicAdapter({ client: c.anthropic ?? createAnthropicClient(key) });
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
    // A step's call carries its key and its caller's signals (stage 3, ADR-0099): another attempt holding the key is
    // waited for, and a gone holder's call is taken over (PaidCalls).
    const op = req.operation;
    return this.paid.admit(
      {
        workspaceId: req.workspaceId,
        ...ctxIds(req),
        purpose: req.purpose,
        kind,
        provider: ref.provider,
        model: ref.model,
        reserveUsd,
        paid: reserveUsd > 0,
        ...(op ? { operationKey: op.key, ...(op.rebuy === true ? { rebuy: true } : {}) } : {}),
      },
      async () => {
        const workspaceUsd = await this.caps.workspaceCapUsd(req.workspaceId);
        const runUsd = req.runId !== undefined && this.caps.runCapUsd ? await this.caps.runCapUsd(req.runId) : undefined;
        return { workspaceUsd, ...(runUsd !== undefined ? { runUsd } : {}) };
      },
      op ? { until: op.until, ...(op.cancel ? { cancel: op.cancel } : {}) } : undefined,
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
   * Provider-reported cost first (OpenRouter), else each model that served the call (every billed attempt the answer
   * lists, which with no fallback asked for is one) at its own price (servedPrice). `assumed` is true when any of them
   * had no price row and was settled at the requested model's rates; the ledger records that (priceBasis), so the guess
   * is visible, never silent (F04).
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
    // An answer that names no served model (adapters copy the field unchecked: it can be missing, null or empty) was
    // still billed. It is recorded as the requested model and flagged assumed (ADR-0095 decision 7); it was priced as
    // the requested model too (servedPrice falls back to its row when a label names none), unless the provider reported
    // its cost. A label that is there but is not text is recorded as its JSON text (providerLabel), as before.
    const served: unknown = draft.servedModel;
    if (served === undefined || served === null || served === '') draft = { ...draft, servedModel: draft.requestedModel, priceBasis: 'assumed' };
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
      throw billedFailure(redact, `${billed} and its cost is recorded (entry ${id}), but its request and response could not be stored`, e, { ledgerEntryId: id, costUsd: entry.costUsd });
    }
    return { id, servedModel: entry.servedModel, costUsd: entry.costUsd };
  }
}

/**
 * A provider-reported label (the served model, the upstream host) as the hash-chained ledger records it. Provider JSON
 * can carry a lone surrogate through a \u escape, which has no canonical form, yet a call the provider answered was
 * billed and must be ledgered (ENG-3, F19). So a lone surrogate is written as U+FFFD; the exact reply stays in the
 * stored response under responseSha256. A label that is not a string at all (adapters copy it unchecked) is written as
 * its JSON text, which escapes lone surrogates, for the same reason. An absent upstream host stays absent; a served
 * model that is absent, null or empty never reaches here (record writes the requested model, flagged assumed). Results
 * returned to callers carry the same value the ledger recorded (ADR-0088), so caller and ledger never disagree.
 */
function providerLabel(label: string): string {
  const value: unknown = label;
  if (typeof value === 'string') return value.toWellFormed();
  return value === undefined ? label : (JSON.stringify(value) ?? typeof value);
}

/** What a completion's attempts share: worked out once, before the first is admitted. */
interface CompletionPrep {
  ref: ModelRef;
  messages: ResolvedMessage[];
  inputTokens: number;
  maxOutputTokens: number;
  estimate: number;
  prompt?: PromptRef;
}

/** What an image's attempts share. */
interface ImagePrep {
  ref: ModelRef;
  price: PriceRow;
  generate: NonNullable<ProviderAdapter['image']>;
  estimate: number;
}

/**
 * A call the provider declined (ADR-0102): the reason it stated, as the ledger recorded it, its entry and cost, and what
 * the book retained for a send of it that may have been billed before it was sent again (DeclineRecord.uncertainUsd).
 */
interface Declined {
  declined: { reason?: string };
  entryId: string;
  costUsd: number;
  uncertainUsd?: number;
}

/** What the book retained for a settled call's sends that may have been billed, as a Declined names it (none: absent). */
const retainedOf = (op: PaidCall): { uncertainUsd?: number } => (op.retainedUsd > 0 ? { uncertainUsd: op.retainedUsd } : {});

/** What the book counts for an ended retry as "may have been billed" (PaidCall.uncertainUsd), as its record names it. */
const retryMaybe = (op: PaidCall): { retryUncertainUsd?: number } => (op.uncertainUsd > 0 ? { retryUncertainUsd: op.uncertainUsd } : {});

/** One attempt's outcome: its answer, or a decline for askOnceMore. Every other outcome is thrown. */
type Attempt<R> = { answer: R } | Declined;

/** A decline an earlier attempt kept (SpendContext.operation.declinedEarlier), as askOnceMore takes it. */
function declinedFrom(d: DeclinedAttempt): Declined {
  return { declined: d.reason !== undefined ? { reason: d.reason } : {}, entryId: d.ledgerEntryId, costUsd: d.costUsd, ...(d.uncertainUsd !== undefined && d.uncertainUsd > 0 ? { uncertainUsd: d.uncertainUsd } : {}) };
}

/**
 * Hands a decline to a caller that keeps it (SpendContext.operation.keepDecline), before the retry is admitted. True once
 * kept. A hook that throws keeps nothing: the retry goes on, and the call ends as for a caller that keeps nothing.
 */
async function keepDecline(caller: SpendContext['operation'], first: Declined): Promise<boolean> {
  if (!caller?.keepDecline) return false;
  try {
    await caller.keepDecline({
      ledgerEntryId: first.entryId,
      costUsd: first.costUsd,
      ...(first.declined.reason !== undefined ? { reason: first.declined.reason } : {}),
      ...(first.uncertainUsd !== undefined ? { uncertainUsd: first.uncertainUsd } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * A retry that was not made for a reason that passes: another attempt holds it ('in-flight'), or byway did not start it
 * (it is stopping, or could not record it as sent: 'byway-failure', not billed). Not a budget or a paused book.
 */
const passing = (err: GatewayError): boolean => err.code === 'in-flight' || (err.code === 'byway-failure' && err.billed === false);

/** A decline as the ledger records it: the stated reason, cleaned (declines.ts), or no reason. */
function declineMark(declined: { reason?: unknown }, redact: Redactor): { reason?: string } {
  const reason = cleanReason(declined.reason, redact);
  return reason !== undefined ? { reason } : {};
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
 * activity) would pay again for what was already bought. It is byway's own failure, not the provider's (the provider
 * answered), and says it was billed (ADR-0099), so no caller presents it as the provider not answering, and a caller with
 * tries of its own (an ASSET step's tries per image, ADR-0090) stops too.
 */
function billedFailure(redact: Redactor, what: string, cause: unknown, settled?: { ledgerEntryId: string; costUsd: number }): GatewayError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new GatewayError('byway-failure', redact(`${what}: ${reason}. It is not retried, because a retry would pay again.`.slice(0, 2000)), false, { billed: true, ...(settled ? { settled } : {}) });
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

function validateSpend(req: { workspaceId?: unknown; runId?: unknown; stepId?: unknown; purpose?: unknown; profileId?: unknown; operation?: unknown }): void {
  if (typeof req.workspaceId !== 'string' || !req.workspaceId) throw invalid('workspaceId is required');
  // A ledger line naming run or step "" is one the spend book refuses to count (ledgerEntryProblem), so such a call is
  // refused before anything is reserved or sent, never billed and then left out of the caps.
  for (const field of ['runId', 'stepId'] as const) {
    if (req[field] !== undefined && (typeof req[field] !== 'string' || !req[field])) throw invalid(`${field}, when given, must be a non-empty string`);
  }
  if (typeof req.purpose !== 'string' || !req.purpose) throw invalid('purpose is required (spec §3.3)');
  if (typeof req.profileId !== 'string' || !req.profileId) throw invalid('profileId is required');
  if (req.operation !== undefined) validateOperation(req.operation);
}

/**
 * SpendContext.operation, checked before anything is reserved: a key, signals that can say when the caller ends, and the
 * caller's side of a decline it keeps (ADR-0102).
 */
function validateOperation(value: unknown): void {
  const op = value as { key?: unknown; until?: unknown; cancel?: unknown; rebuy?: unknown; keepDecline?: unknown; declinedEarlier?: unknown } | null;
  if (typeof op !== 'object' || op === null) throw invalid('operation must be { key, until, cancel?, rebuy?, keepDecline?, declinedEarlier? }');
  if (op.rebuy !== undefined && typeof op.rebuy !== 'boolean') throw invalid('operation.rebuy, when given, must be true or false');
  if (typeof op.key !== 'string' || !op.key) throw invalid('operation.key must be a non-empty string');
  if (!(op.until instanceof AbortSignal)) throw invalid('operation.until must be an AbortSignal');
  if (op.cancel !== undefined && !(op.cancel instanceof AbortSignal)) throw invalid('operation.cancel, when given, must be an AbortSignal');
  if (op.keepDecline !== undefined && typeof op.keepDecline !== 'function') throw invalid('operation.keepDecline, when given, must be a function');
  if (op.declinedEarlier !== undefined) {
    const d = op.declinedEarlier as { ledgerEntryId?: unknown; costUsd?: unknown; reason?: unknown; uncertainUsd?: unknown } | null;
    const ok =
      typeof d === 'object' &&
      d !== null &&
      typeof d.ledgerEntryId === 'string' &&
      d.ledgerEntryId !== '' &&
      typeof d.costUsd === 'number' &&
      Number.isFinite(d.costUsd) &&
      d.costUsd >= 0 &&
      (d.reason === undefined || typeof d.reason === 'string') &&
      (d.uncertainUsd === undefined || (typeof d.uncertainUsd === 'number' && Number.isFinite(d.uncertainUsd) && d.uncertainUsd >= 0));
    if (!ok) throw invalid('operation.declinedEarlier, when given, must be { ledgerEntryId, costUsd, reason?, uncertainUsd? } as the gateway handed it to keepDecline');
  }
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
