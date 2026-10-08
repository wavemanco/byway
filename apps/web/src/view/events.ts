/**
 * Reading event payloads. The contracts fix each event type's data (RunEventPayloads), but events cross a process
 * boundary (the runner's worker, the store, the browser) and old runs outlive code changes, so every read still
 * goes through these tolerant schemas: a field that is missing or malformed is dropped, never thrown on, and the
 * timeline still renders.
 */
import { z } from 'zod';

const str = z.string().min(1).optional().catch(undefined);
const num = z.number().finite().optional().catch(undefined);

/** 'step-started': label, stage (D1–D3), role, actor, block?, glue?. */
export const StepStartedData = z.object({
  label: str,
  stage: str,
  role: str,
  actor: z.enum(['model', 'human', 'policy', 'tool']).optional().catch(undefined),
  block: str,
  glue: str,
});

/** 'step-finished': costUsd, skipped?, note?, outputArtifactIds?. */
export const StepFinishedData = z.object({
  costUsd: num,
  skipped: z.boolean().optional().catch(undefined),
  note: str,
});

/** 'step-failed': error, retryable. */
export const StepFailedData = z.object({ error: str, retryable: z.boolean().optional().catch(undefined) });

/** 'artifact': artifactId, mediaType, label, shot?. */
export const ArtifactData = z.object({
  artifactId: z.string().regex(/^sha256:[0-9a-f]+$/).optional().catch(undefined),
  mediaType: str,
  label: str,
  shot: num,
});

/**
 * 'loop-iteration': iteration, max, and the round's judgement — score (OK mode) or rank of `of` (GREAT mode: our
 * version's place in the blind lineup, ADR-0072; averaged across shuffles, so it can be fractional). Shown to you,
 * never to a critic (port rule 2).
 */
export const LoopIterationData = z.object({ iteration: num, max: num, score: num, rank: num, of: num });

/** 'checkpoint-opened' and 'checkpoint-resolved'. */
export const CheckpointEventData = z.object({ checkpointId: str, kind: str });

/** 'cost': the run's spend so far and its budget; 'run-started' carries the starting budget too. */
export const CostData = z.object({ totalUsd: num, budgetUsd: num });

/** Parses an event payload; a non-object payload reads as empty. */
export function read<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const parsed = schema.safeParse(typeof data === 'object' && data !== null ? data : {});
  return parsed.success ? parsed.data : schema.parse({});
}
