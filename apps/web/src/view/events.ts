/**
 * The event payloads the web app reads. RunEvent.data is untyped in the contracts, so every read goes through
 * these tolerant schemas: a field that is missing or malformed is dropped, never thrown on, and the timeline
 * still renders. The shapes here are what the runner is expected to emit (reported as a contract gap).
 */
import { z } from 'zod';

const str = z.string().min(1).optional().catch(undefined);
const num = z.number().finite().optional().catch(undefined);

export const StepStartedData = z.object({
  label: str,
  /** 'D1'–'D3' or 'Explore'/'Refine'/'Finish'. */
  stage: str,
  block: str,
  glue: str,
  role: str,
  who: z.enum(['you', 'ai', 'tool']).optional().catch(undefined),
  actor: z.enum(['model', 'human', 'policy', 'tool']).optional().catch(undefined),
});

export const StepFinishedData = z.object({
  costUsd: num,
  skipped: z.boolean().optional().catch(undefined),
  note: str,
});

export const StepFailedData = z.object({ error: str });

export const ArtifactData = z.object({
  artifactId: z.string().regex(/^sha256:[0-9a-f]+$/).optional().catch(undefined),
  mediaType: str,
  label: str,
  shot: num,
});

export const LoopIterationData = z.object({ iteration: num, max: num });

export const CheckpointEventData = z.object({ checkpointId: str, kind: str });

/** run-started and cost events may carry the run's budget (RunRecord has no budget field yet). */
export const BudgetData = z.object({ budgetUsd: num, totalUsd: num });

export const RunEndData = z.object({ outputArtifactId: str, error: str, reason: str });

/** Parses an event payload; a non-object payload reads as empty. */
export function read<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const parsed = schema.safeParse(typeof data === 'object' && data !== null ? data : {});
  return parsed.success ? parsed.data : schema.parse({});
}
