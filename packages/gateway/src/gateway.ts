import { canonicalize, sha256Hex } from '@byway/canonical';
import {
  GatewayError,
  type ArtifactStore,
  type CompletionRequest,
  type CompletionResult,
  type Gateway,
  type ImageRequest,
  type ImageResult,
  type MediaType,
  type ModelProfile,
  type ModelRef,
  type ProviderId,
  type ProviderStatus,
  type SpendSummary,
} from '@byway/contracts';
import { configuredProviders, isConfigured, keyFor, loadEnvFile, type Env } from './env.ts';
import { toGatewayError } from './errors.ts';
import { estimateInputTokens, imageSize, maxCompletionCost, maxImageCost } from './estimate.ts';
import { Ledger, type LedgerDraft } from './ledger.ts';
import { PRICES, priceFor, roundUsd, tokenCost, type PriceRow, type TokenBreakdown } from './prices.ts';
import { DEMO_PROFILE_ID, OPENROUTER_PINS, PROFILES, profileStatus, type ProfileStatus } from './profiles.ts';
import { anthropicAdapter, createAnthropicClient, type AnthropicClientLike } from './providers/anthropic.ts';
import { createGoogleClient, googleAdapter, type GoogleClientLike } from './providers/google.ts';
import { mockAdapter } from './providers/mock.ts';
import { createOpenAIClient, openaiAdapter, type OpenAIClientLike } from './providers/openai.ts';
import { createOpenRouterClient, openrouterAdapter } from './providers/openrouter.ts';
import type { ProviderAdapter, ProviderCompletion, ResolvedImage, ResolvedMessage } from './providers/types.ts';
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
  clients?: { anthropic?: AnthropicClientLike; openai?: OpenAIClientLike; google?: GoogleClientLike; openrouter?: OpenAIClientLike };
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
}

/** Details a budget refusal carries, so the runner can offer "Raise the budget by $X?" (spec §3.4). */
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

export type BudgetError = GatewayError & { budget: BudgetDetails };

const DEFAULT_MAX_OUTPUT = 16_000;
const MAX_OUTPUT_LIMIT = 128_000;
const TIERS = new Set(['big', 'mid']);
const MEDIA_TYPES = new Set<MediaType>(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);
const MOCK_MODELS = { big: 'mock-big', mid: 'mock-mid', image: 'mock-image' } as const;

interface Reservation {
  workspaceId: string;
  runId?: string;
  usd: number;
}

const invalid = (message: string) => new GatewayError('invalid-request', message);

/**
 * The model gateway (ADR-0030): the only path out for model and image calls. It resolves the profile's model for the
 * tier, checks the key exists (never exposing it), loads images from the artifact store, refuses calls whose
 * worst case would break a spend cap, retries transient failures, stores request and response bodies by hash, and
 * appends every call to the hash-chained ledger.
 */
export class ModelGateway implements Gateway {
  readonly demo: boolean;
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

  constructor(opts: GatewayOptions) {
    this.opts = opts;
    this.env = opts.env ?? process.env;
    if (opts.envFile) loadEnvFile(opts.envFile, this.env);
    this.demo = opts.demo ?? false;
    this.ledger = new Ledger({ path: opts.ledgerPath, ...(opts.now ? { now: opts.now } : {}) });
    this.artifacts = opts.artifacts;
    this.caps = opts.caps;
    this.allProfiles = opts.profiles ?? PROFILES;
    this.prices = opts.prices ?? PRICES;
    this.retry = { ...DEFAULT_RETRY, ...opts.retry };
    this.now = opts.now ?? (() => new Date());
    this.defaultMaxOutput = opts.defaultMaxOutputTokens ?? DEFAULT_MAX_OUTPUT;
    for (const [id, adapter] of Object.entries(opts.adapters ?? {})) this.adapters.set(id as ProviderId, adapter);
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
    const profile = this.profile(req.profileId);
    const ref: ModelRef = this.demo ? { provider: 'mock', model: MOCK_MODELS[req.tier] } : (req.model ?? profile.tiers[req.tier]);
    this.requireKey(ref.provider);
    const price = this.price(ref);
    const { messages, sizes } = await this.resolveMessages(req.messages);
    const estimate = maxCompletionCost(price, estimateInputTokens({ ...(req.system ? { system: req.system } : {}), messages, imageSizes: sizes }), maxOutputTokens);
    const reservation = await this.reserve(req, estimate);
    const redact = makeRedactor(this.env);
    const started = Date.now();
    try {
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
        },
        { profileId: req.profileId, tier: req.tier, provider: ref.provider, model: ref.model, wire: out.requestBody },
        { servedModel: out.servedModel, usage: out.usage, ...(out.refusal ? { refusal: out.refusal } : {}), wire: out.responseBody },
        redact,
      );
      if (out.refusal) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal}`));
      return {
        text: out.text,
        servedModel: out.servedModel,
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
      const stored = out.refusal ? undefined : await this.artifacts.put(out.bytes, out.mediaType);
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
      if (out.refusal || !stored) throw new GatewayError('refused', redact(`${ref.provider} ${out.refusal ?? 'returned no image'}`));
      return { artifactId: stored.id, mediaType: out.mediaType, servedModel: out.servedModel, provider: ref.provider, costUsd, ledgerEntryId: entry.id };
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
        ) as BudgetError;
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

  /** Store the bodies (redacted, canonical JSON) and append the ledger entry that names them by hash. */
  private async record(draft: Omit<LedgerDraft, 'requestSha256' | 'responseSha256'>, request: unknown, response: unknown, redact: Redactor) {
    const store = async (body: unknown) => {
      const text = redact(canonicalOrJson(body));
      await this.artifacts.putText(text, 'application/json');
      return `sha256:${sha256Hex(text)}`;
    };
    const requestSha256 = await store({ purpose: draft.purpose, ...(request as object) });
    const responseSha256 = await store(response);
    return this.ledger.append({ ...draft, requestSha256, responseSha256 });
  }
}

function validateSpend(req: { workspaceId?: unknown; purpose?: unknown; profileId?: unknown }): void {
  if (typeof req.workspaceId !== 'string' || !req.workspaceId) throw invalid('workspaceId is required');
  if (typeof req.purpose !== 'string' || !req.purpose) throw invalid('purpose is required (spec §3.3)');
  if (typeof req.profileId !== 'string' || !req.profileId) throw invalid('profileId is required');
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
