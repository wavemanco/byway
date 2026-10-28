/**
 * The one way activities write run events: typed by RunEventPayloads (the app reads exactly these), and always with a
 * dedupe key, because Temporal runs an activity at least once and a retried activity must not log its step twice.
 */
import type { Gateway, RunEvent, RunEventPayloads, RunEventType, Store } from '@byway/contracts';
import { ENDED_STATUSES as ENDED, type StepCall } from '../types.ts';

const TERMINAL: ReadonlySet<RunEventType> = new Set(['run-finished', 'run-failed', 'run-cancelled']);

export interface EmitOptions {
  stepId?: string;
  candidate?: number;
  dedupeKey: string;
}

/**
 * Append one typed event. Once a run has ended, only its terminal event is written: an activity that was still in
 * flight when the run was cancelled must not add steps after "cancelled".
 */
export async function emit<T extends RunEventType>(store: Store, runId: string, type: T, data: RunEventPayloads[T], opts: EmitOptions): Promise<RunEvent | undefined> {
  if (!TERMINAL.has(type)) {
    const run = await store.getRun(runId);
    if (run && ENDED.has(run.status)) return undefined;
  }
  return store.appendEvent(
    {
      runId,
      type,
      ...(opts.stepId !== undefined ? { stepId: opts.stepId } : {}),
      ...(opts.candidate !== undefined ? { candidate: opts.candidate } : {}),
      data: data as unknown as Record<string, unknown>,
    },
    { dedupeKey: opts.dedupeKey },
  );
}

/** Event options for a step call: its step id, candidate and a key under the call's base key. */
export const at = (call: StepCall, suffix: string): EmitOptions => ({
  stepId: call.stepId,
  ...(call.candidate !== undefined ? { candidate: call.candidate } : {}),
  dedupeKey: `${call.key}/${suffix}`,
});

/**
 * Bring the run's cost up to date from the gateway's settled spend (spec §3.3 "Spend authority": the spend book is the
 * source of truth, in demo mode too; ADR-0095) and emit a cost event. Concurrent steps may finish out of order, so the
 * cost never goes down.
 */
export async function recordCost(store: Store, gateway: Gateway, runId: string, workspaceId: string, call: StepCall): Promise<void> {
  const spend = await gateway.spend(workspaceId);
  const run = await store.getRun(runId);
  if (!run || ENDED.has(run.status)) return;
  const totalUsd = Math.max(run.costUsd, spend.byRun[runId] ?? 0);
  if (totalUsd !== run.costUsd) await store.updateRun(runId, { costUsd: totalUsd });
  await emit(store, runId, 'cost', { totalUsd, budgetUsd: run.budgetUsd }, { dedupeKey: `${call.key}/cost` });
}
