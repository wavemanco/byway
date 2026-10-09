import { z } from 'zod';
import { CanonicalizationError } from '@byway/canonical';
import { BLOCK_CODES, GLUE_CODES, MEDIA, PORT_TYPES, type BlockCode, type Channel, type GlueCode, type Medium, type PortType, type RecipeKind } from '@byway/protocol';
// hash.ts imports only the Recipe type from this file, so this is no runtime import cycle.
import { recipeHash } from './hash.ts';

export const RECIPE_SCHEMA_ID = 'byway.recipe/1';

export const ROLES = [
  'build', 'fix', 'critic', 'judge', 'seed', 'vision', 'asset', 'relay',
  'cut', 'tells-sweep', 'tells-compare', 'voice', 'check', 'render', 'select',
  // Glue steps of 03 C2, not blocks: `dedupe` keeps one representative per cluster of near-duplicate options;
  // `overlap` flags options that an unseeded (vanilla) run also produces, the article's own diagnostic used as a filter.
  'dedupe', 'overlap',
] as const;
export type Role = (typeof ROLES)[number];

export const ACTORS = ['model', 'human', 'policy', 'tool'] as const;
export type Actor = (typeof ACTORS)[number];

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Step {
  op: 'step';
  id: string;
  role: Role;
  block?: BlockCode;
  glue?: GlueCode;
  actor: Actor;
  tier?: 'big' | 'mid';
  isolated?: boolean;
  frozenPrompt?: boolean;
  /** Prompt template id, e.g. "article.B1" or "project.A6". Template text is registered separately. */
  prompt?: string;
  consumes: PortType[];
  produces: PortType[];
  /** True if the step changes the artifact. */
  writes?: boolean;
  /**
   * A machine write that leaves human copy verbatim. Port rule 6 forbids writing *over* voice; a configuration that
   * locks voice early and keeps building around it (03 C5: the VO script is locked in D1, the media chain runs after)
   * marks those writes. The runner must enforce it by comparing the human copy before and after the step.
   */
  keepsVoice?: boolean;
  /** Set when an AI or a policy stands in for a human step. */
  proxyFor?: 'human';
  knobs?: Record<string, Json>;
  variant?: string;
}
export interface Seq { op: 'seq'; id?: string; steps: Node[] }
export interface Replicate { op: 'replicate'; id: string; n: number; body: Node }
export interface Each { op: 'each'; id: string; body: Node }
export interface Pick { op: 'pick'; id: string; mode: 'H' | 'C' | 'R'; k: number; actor: Actor; judge?: Step }
export interface Gate {
  /** 'critic-score' | 'critic-rank' | 'human'. Kept as a string so the validator can name forbidden metrics (PR8). */
  metric: string;
  threshold?: number;
  hidden: boolean;
  holder: 'worker' | 'harness' | 'human';
  probe: number;
  max: number;
  plateau?: { minGain: number; window: number };
  onCap: 'human' | 'policy-best-snapshot';
  onNoConverge: 'recalibrate-human' | 'continue';
}
export interface Loop { op: 'loop'; id: string; body: Node; gate: Gate }
export interface Route { op: 'route'; id: string; on: string; branches: { name: string; body: Node }[] }
export interface Optional { op: 'optional'; id: string; trigger: string; body: Node }
/**
 * Parallel audit `{{ A ‖ B }}` (02 §2, ⟨A⟩): every lens reads the same input and returns annotations only
 * (`critique`, `score`). Nothing a lens makes is merged or edited into the work, and no lens writes.
 */
export interface Audit { op: 'audit'; id: string; lenses: { name: string; body: Node }[] }
/** The pass condition of a one-shot gate: a loop gate's condition without probe, cap or plateau. */
export interface PassCondition {
  /** 'critic-score' | 'critic-rank'. A string, as in Gate, so the validator can name forbidden metrics (PR8). */
  metric: string;
  threshold?: number;
  hidden: boolean;
  holder: 'worker' | 'harness' | 'human';
}
/**
 * One-shot gate `gate[cond] else ↺ Dk` (02 §2, ⟨A⟩): a pass/fail check with no fix step. On a fail the run re-runs
 * stage `retry.stage` automatically with the same brief, at most `retry.times` times, and then a human decides.
 * A retry starts that stage again from its own entry state, so it adds no back-edge for the flow rules.
 */
export interface OneShotGate {
  op: 'gate';
  id: string;
  body: Node;
  pass: PassCondition;
  retry?: { stage: Stage['stage']; times: number };
  onFail: 'human';
}
/**
 * Relay chain `A ~> B` (02 §2): each link starts from the previous link's exact end state (`anchor`). The run decides
 * how many links there are (one per storyboard shot, say), up to `maxLinks`. Links run strictly in sequence (01 RELAY).
 */
export interface RelayChain { op: 'relay'; id: string; maxLinks: number; body: Node }
export type Node = Step | Seq | Replicate | Each | Pick | Loop | Route | Optional | Audit | OneShotGate | RelayChain;

export interface Stage { stage: 'D1' | 'D2' | 'D3'; body: Node }
export interface Derivation { transform: string; version: number; target?: string; map?: string }
export interface Recipe {
  schema: typeof RECIPE_SCHEMA_ID;
  id: string;
  title: string;
  kind: RecipeKind;
  /** Configuration family, e.g. "C1"; "baseline" for baselines. Exceptions can be limited to a family. */
  family: string;
  channel: Channel;
  /** What the configuration produces (artifact format, how judges see it). */
  medium?: Medium;
  parent?: { hash: string; derivation: Derivation };
  inputs: PortType[];
  stages: Stage[];
  sitsOut: { block: BlockCode; reason: string }[];
  exceptions: string[];
  /** Failed prompts go to BANK (default rule 10). */
  bank: boolean;
  hash?: string;
}

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase letters, digits and hyphens');
const Port = z.enum(PORT_TYPES);
const HashString = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** Keys that JavaScript treats specially; content under them could escape hashing and rule checks. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const JsonKey = z.string().refine((k) => !FORBIDDEN_KEYS.has(k), { message: 'reserved key name' });

const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonSchema), z.record(JsonKey, JsonSchema)]),
);

const NodeRef: z.ZodType<Node> = z.lazy(() => NodeSchema);

export const StepSchema = z.strictObject({
  op: z.literal('step'),
  id: Id,
  role: z.enum(ROLES),
  block: z.enum(BLOCK_CODES).optional(),
  glue: z.enum(GLUE_CODES).optional(),
  actor: z.enum(ACTORS),
  tier: z.enum(['big', 'mid']).optional(),
  isolated: z.boolean().optional(),
  frozenPrompt: z.boolean().optional(),
  prompt: z.string().min(1).optional(),
  consumes: z.array(Port),
  produces: z.array(Port),
  writes: z.boolean().optional(),
  keepsVoice: z.boolean().optional(),
  proxyFor: z.literal('human').optional(),
  knobs: z.record(JsonKey, JsonSchema).optional(),
  variant: z.string().min(1).optional(),
});

const SeqSchema = z.strictObject({ op: z.literal('seq'), id: Id.optional(), steps: z.array(NodeRef).min(1) });
const ReplicateSchema = z.strictObject({ op: z.literal('replicate'), id: Id, n: z.number().int(), body: NodeRef });
const EachSchema = z.strictObject({ op: z.literal('each'), id: Id, body: NodeRef });
const PickSchema = z.strictObject({
  op: z.literal('pick'),
  id: Id,
  mode: z.enum(['H', 'C', 'R']),
  k: z.number().int(),
  actor: z.enum(ACTORS),
  judge: StepSchema.optional(),
});
const GateSchema = z.strictObject({
  metric: z.string().min(1),
  threshold: z.number().optional(),
  hidden: z.boolean(),
  holder: z.enum(['worker', 'harness', 'human']),
  probe: z.number().int(),
  max: z.number().int(),
  plateau: z.strictObject({ minGain: z.number(), window: z.number().int() }).optional(),
  onCap: z.enum(['human', 'policy-best-snapshot']),
  onNoConverge: z.enum(['recalibrate-human', 'continue']),
});
const LoopSchema = z.strictObject({ op: z.literal('loop'), id: Id, body: NodeRef, gate: GateSchema });
const RouteSchema = z.strictObject({
  op: z.literal('route'),
  id: Id,
  on: z.string().min(1),
  branches: z.array(z.strictObject({ name: z.string().min(1), body: NodeRef })).min(1),
});
const OptionalSchema = z.strictObject({ op: z.literal('optional'), id: Id, trigger: z.string().min(1), body: NodeRef });
const StageName = z.enum(['D1', 'D2', 'D3']);
const AuditSchema = z.strictObject({
  op: z.literal('audit'),
  id: Id,
  lenses: z.array(z.strictObject({ name: z.string().min(1), body: NodeRef })).min(1),
});
const OneShotGateSchema = z.strictObject({
  op: z.literal('gate'),
  id: Id,
  body: NodeRef,
  pass: z.strictObject({
    metric: z.string().min(1),
    threshold: z.number().optional(),
    hidden: z.boolean(),
    holder: z.enum(['worker', 'harness', 'human']),
  }),
  retry: z.strictObject({ stage: StageName, times: z.number().int() }).optional(),
  onFail: z.literal('human'),
});
const RelayChainSchema = z.strictObject({ op: z.literal('relay'), id: Id, maxLinks: z.number().int(), body: NodeRef });

export const NodeSchema: z.ZodType<Node> = z.discriminatedUnion('op', [
  StepSchema,
  SeqSchema,
  ReplicateSchema,
  EachSchema,
  PickSchema,
  LoopSchema,
  RouteSchema,
  OptionalSchema,
  AuditSchema,
  OneShotGateSchema,
  RelayChainSchema,
]) as z.ZodType<Node>;

/**
 * The shape of a recipe only: it neither reserves key names nor guarantees that what it accepts can be hashed. Parse
 * untrusted input with {@link parseRecipe}.
 */
export const RecipeSchema: z.ZodType<Recipe> = z.strictObject({
  schema: z.literal(RECIPE_SCHEMA_ID),
  id: Id,
  title: z.string().min(1),
  kind: z.enum(['protocol-config', 'variant', 'ablation', 'baseline', 'composed', 'experimental']),
  family: z.string().min(1),
  channel: z.enum(['protocol', 'research-frozen', 'product', 'workspace']),
  medium: z.enum(MEDIA).optional(),
  parent: z
    .strictObject({
      hash: HashString,
      derivation: z.strictObject({
        transform: z.string().min(1),
        version: z.number().int().positive(),
        target: z.string().min(1).optional(),
        map: z.string().min(1).optional(),
      }),
    })
    .optional(),
  inputs: z.array(Port),
  stages: z.array(z.strictObject({ stage: StageName, body: NodeRef })).min(1),
  sitsOut: z.array(z.strictObject({ block: z.enum(BLOCK_CODES), reason: z.string() })),
  exceptions: z.array(z.string()),
  bank: z.boolean(),
  hash: HashString.optional(),
}) as z.ZodType<Recipe>;

/** Paths of own properties with reserved names anywhere in raw input (zod silently drops `__proto__`). */
function reservedKeyPaths(value: unknown, path: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(value)) return value.flatMap((v, i) => reservedKeyPaths(v, [...path, i]));
  if (value === null || typeof value !== 'object') return [];
  return Object.keys(value).flatMap((k) => [
    ...(FORBIDDEN_KEYS.has(k) ? [[...path, k]] : []),
    ...reservedKeyPaths((value as Record<string, unknown>)[k], [...path, k]),
  ]);
}

/**
 * Parse untrusted input into a Recipe. Throws ZodError with paths on invalid input.
 *
 * Every Recipe returned can be hashed: recipeHash never throws on it. The hasher itself decides, so this rule cannot
 * drift from it (F19, ADR-0083). Text holding a lone surrogate, which arrives as a JSON backslash-u escape in a model's
 * answer or a file, is refused here as one issue at the recipe's root that names the canonical path in its message (the
 * canonicalizer quotes a bad property name escaped, so the message is well-formed). Callers then handle it on their
 * existing ZodError path instead of meeting a CanonicalizationError later.
 */
export function parseRecipe(input: unknown): Recipe {
  const reserved = reservedKeyPaths(input);
  if (reserved.length) {
    throw new z.ZodError(reserved.map((path) => ({ code: 'custom' as const, path, message: 'reserved key name', input: undefined })));
  }
  const recipe = RecipeSchema.parse(input);
  try {
    recipeHash(recipe);
  } catch (e) {
    // Anything else (a stack overflow on pathological nesting, say) is not a hashability rule and is rethrown as is.
    if (!(e instanceof CanonicalizationError)) throw e;
    throw new z.ZodError([{ code: 'custom', path: [], message: `the recipe cannot be hashed: ${e.message}`, input: undefined }]);
  }
  return recipe;
}
