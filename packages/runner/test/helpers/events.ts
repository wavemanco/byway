/**
 * Checks that a run's events are exactly the contract's RunEventPayloads and that every event naming a step can be
 * labelled with the recipe's presentation (presentedStepFor), as the app's timeline does.
 */
import { expect } from 'vitest';
import { z } from 'zod';
import { presentationOf, presentedStepFor } from '@byway/catalog';
import type { RunEvent, RunEventType, RunView } from '@byway/contracts';

const id = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const empty = z.object({}).strict();

const PAYLOADS: Record<RunEventType, z.ZodType> = {
  'run-started': z.object({ recipeId: z.string().min(1), profileId: z.string().min(1), budgetUsd: z.number() }).strict(),
  'step-started': z
    .object({ label: z.string().min(1), stage: z.enum(['D1', 'D2', 'D3']), role: z.string().min(1), actor: z.enum(['model', 'human', 'policy', 'tool']), block: z.string().optional(), glue: z.string().optional() })
    .strict(),
  'step-finished': z.object({ costUsd: z.number().min(0), skipped: z.boolean().optional(), note: z.string().optional(), outputArtifactIds: z.array(id).optional() }).strict(),
  'step-failed': z.object({ error: z.string().min(1), retryable: z.boolean() }).strict(),
  'checkpoint-opened': z.object({ checkpointId: z.string().min(1), kind: z.enum(['pick', 'react', 'confirm', 'compare', 'directive', 'write', 'choose']) }).strict(),
  'checkpoint-resolved': z.object({ checkpointId: z.string().min(1) }).strict(),
  artifact: z.object({ artifactId: id, mediaType: z.string().min(1), label: z.string().min(1), shot: z.number().int().positive().optional() }).strict(),
  // A score (OK mode) or our rank of `of` (GREAT mode; averaged over shuffles, so not always whole).
  'loop-iteration': z
    .object({ iteration: z.number().int().positive(), max: z.number().int().positive(), score: z.number().optional(), rank: z.number().min(1).optional(), of: z.number().int().min(2).optional() })
    .strict()
    .refine((d) => (d.rank === undefined) === (d.of === undefined) && !(d.score !== undefined && d.rank !== undefined), 'a score, or a rank with its lineup size'),
  cost: z.object({ totalUsd: z.number().min(0), budgetUsd: z.number().min(0) }),
  'run-finished': z.object({ outputArtifactId: id, costUsd: z.number().min(0) }).strict(),
  'run-failed': z.object({ error: z.string().min(1) }).strict(),
  'run-cancelled': empty,
  'run-paused': empty,
  'run-resumed': empty,
};

export function checkEvents(view: RunView, recipeId?: string): void {
  const presentation = recipeId ? presentationOf(recipeId) : undefined;
  const seqs = view.events.map((e) => e.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(new Set(seqs).size).toBe(seqs.length);
  for (const e of view.events) {
    const parsed = PAYLOADS[e.type].safeParse(e.data);
    expect(parsed.success, `${e.type} ${JSON.stringify(e.data)}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    if (presentation && e.stepId) expect(presentedStepFor(presentation, e.stepId), `${recipeId}: event ${e.type} for "${e.stepId}" has no shown step`).toBeDefined();
  }
  const started = view.events.filter((e) => e.type === 'step-started').length;
  const ended = view.events.filter((e) => e.type === 'step-finished' || e.type === 'step-failed').length;
  if (view.run.status === 'done') expect(ended).toBe(started);
}

export const ofType = (view: RunView, type: RunEventType, stepId?: string): RunEvent[] => view.events.filter((e) => e.type === type && (stepId === undefined || e.stepId === stepId));
export const notes = (view: RunView, stepId: string): (string | undefined)[] => ofType(view, 'step-finished', stepId).map((e) => e.data.note as string | undefined);
