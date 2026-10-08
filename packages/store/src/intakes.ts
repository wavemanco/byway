/**
 * Intakes (IntakeRecord): what the user brought before a run. The problem and the chooser answers are small and fully
 * checked. The recommendation and the composed recipe are the advisor's structures; the store checks only the fields
 * that identify them (the recipe they name) and keeps the rest as given, so the advisor can grow them without a
 * store change. The same checks run on read: a row damaged on disk fails with code 'corrupt' instead of reaching the
 * app as a half-valid record.
 */
import type { SQLOutputValue } from 'node:sqlite';
import { z } from 'zod';
import type { ChooserAnswer, ComposeResult, IntakeRecord, ProblemBrief, Recommendation } from '@byway/contracts';
import { StoreError } from './errors.ts';

type Row = Record<string, SQLOutputValue>;

const Text = z.string();
const NonBlank = z.string().refine((s) => s.trim() !== '', { message: 'must be a non-empty string' });

const ProblemSchema = z.object({
  text: NonBlank,
  deliverable: Text.optional(),
  audience: Text.optional(),
  constraints: z.array(Text).optional(),
  attachments: z.array(z.object({ name: Text, text: Text })).optional(),
});

const AnswersSchema = z.array(
  z.object({
    questionId: NonBlank,
    answer: z.boolean(),
    confidence: z.number().min(0).max(1),
    rationale: Text,
    setBy: z.enum(['intake', 'user']),
  }),
);

/** The advisor owns the rest of the shape; the store keeps every key it is given. */
const RecommendationSchema = z.looseObject({ recipeId: NonBlank, recipeHash: NonBlank });
const ComposedSchema = z.looseObject({ recipe: z.looseObject({ id: NonBlank }), ok: z.boolean() });

const FIELDS = {
  problem: ProblemSchema,
  answers: AnswersSchema,
  recommendation: RecommendationSchema,
  composed: ComposedSchema,
} as const;

export type IntakeField = keyof typeof FIELDS;
export const INTAKE_PATCH_KEYS = ['problem', 'answers', 'recommendation', 'composed'] as const satisfies readonly IntakeField[];

function describe(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(value)'} ${i.message}`).join('; ');
}

/**
 * The JSON text to store for one intake field, after checking it. Keys zod does not know are dropped from the problem
 * and the answers (their shape is fixed by the contract) and kept in the advisor's structures.
 */
export function intakeFieldJson(field: IntakeField, value: unknown): string {
  const parsed = FIELDS[field].safeParse(value);
  if (!parsed.success) throw new StoreError('invalid', `intake ${field}: ${describe(parsed.error)}`);
  return JSON.stringify(parsed.data);
}

function readField<T>(intakeId: string, field: IntakeField, text: SQLOutputValue | undefined): T | undefined {
  if (text === null || text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(String(text));
  } catch (e) {
    throw new StoreError('corrupt', `intake ${JSON.stringify(intakeId)}: the stored ${field} is not JSON`, { cause: e });
  }
  const parsed = FIELDS[field].safeParse(value);
  if (!parsed.success) throw new StoreError('corrupt', `intake ${JSON.stringify(intakeId)}: the stored ${field} no longer matches the contract (${describe(parsed.error)})`);
  return parsed.data as T;
}

export function toIntake(r: Row): IntakeRecord {
  const id = String(r.id);
  const problem = readField<ProblemBrief>(id, 'problem', r.problem);
  if (!problem) throw new StoreError('corrupt', `intake ${JSON.stringify(id)} has no problem`);
  const answers = readField<ChooserAnswer[]>(id, 'answers', r.answers);
  const recommendation = readField<Recommendation>(id, 'recommendation', r.recommendation);
  const composed = readField<ComposeResult>(id, 'composed', r.composed);
  return {
    id,
    workspaceId: String(r.workspace_id),
    problem,
    ...(answers ? { answers } : {}),
    ...(recommendation ? { recommendation } : {}),
    ...(composed ? { composed } : {}),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
