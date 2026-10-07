import { z } from 'zod';
import { BLOCK_CODES, GLUE_CODES, PORT_TYPES, type BlockCode, type Channel, type GlueCode, type PortType, type RecipeKind } from '@byway/protocol';

export const RECIPE_SCHEMA_ID = 'byway.recipe/1';

export const ROLES = [
  'build', 'fix', 'critic', 'judge', 'seed', 'vision', 'asset', 'relay',
  'cut', 'tells-sweep', 'tells-compare', 'voice', 'check', 'render', 'select',
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
export type Node = Step | Seq | Replicate | Each | Pick | Loop | Route | Optional;

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

const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonSchema), z.record(z.string(), JsonSchema)]),
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
  proxyFor: z.literal('human').optional(),
  knobs: z.record(z.string(), JsonSchema).optional(),
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

export const NodeSchema: z.ZodType<Node> = z.discriminatedUnion('op', [
  StepSchema,
  SeqSchema,
  ReplicateSchema,
  EachSchema,
  PickSchema,
  LoopSchema,
  RouteSchema,
  OptionalSchema,
]) as z.ZodType<Node>;

export const RecipeSchema: z.ZodType<Recipe> = z.strictObject({
  schema: z.literal(RECIPE_SCHEMA_ID),
  id: Id,
  title: z.string().min(1),
  kind: z.enum(['protocol-config', 'variant', 'ablation', 'baseline', 'composed', 'experimental']),
  family: z.string().min(1),
  channel: z.enum(['protocol', 'research-frozen', 'product', 'workspace']),
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
  stages: z.array(z.strictObject({ stage: z.enum(['D1', 'D2', 'D3']), body: NodeRef })).min(1),
  sitsOut: z.array(z.strictObject({ block: z.enum(BLOCK_CODES), reason: z.string() })),
  exceptions: z.array(z.string()),
  bank: z.boolean(),
  hash: HashString.optional(),
}) as z.ZodType<Recipe>;

/** Parse untrusted input into a Recipe. Throws ZodError with paths on invalid input. */
export function parseRecipe(input: unknown): Recipe {
  return RecipeSchema.parse(input);
}
