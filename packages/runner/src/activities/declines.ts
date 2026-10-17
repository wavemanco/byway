/**
 * The run's log of declines (ADR-0102). The gateway asks a declining model once more on the same model and records both
 * calls in the ledger, the second as a retry of the first. This wrapper writes the run's side: one 'model-declined'
 * event per decline, once the second ask has an outcome, with what happened in plain words (declineStory).
 *
 * It wraps the gateway an activity invocation sees, outside the memo layer (memo.ts): an outcome kept from an earlier
 * attempt comes back as it was (an answer with its decline, or the same final 'refused'), and the event's dedupe key (the
 * step call's key and the declined call's ledger entry) makes writing it again a no-op. An attempt that ended before the
 * retry was made carries no decline (memo.ts DeclineRetryPending), so the event is written once, by the attempt that
 * has the retry's outcome. If writing the event fails after an answer, the error is the step's, and the step is
 * retried: the answer is kept by then, so nothing is bought again. If it fails after a final decline, the decline's own
 * failure stands (it is not retryable, and the step's failure says the same): a lost event never turns a decline into a
 * retryable error.
 */
import type { DeclineRecord, Gateway, Store } from '@byway/contracts';
import { declineStory } from '@byway/gateway';
import type { StepCall } from '../types.ts';
import { at, emit } from './events.ts';

/** The run and step call an activity input names, when it is a step's. */
export function stepCallOf(input: unknown): { runId: string; call: StepCall } | undefined {
  const i = input as { run?: { runId?: unknown }; call?: Partial<StepCall> } | undefined;
  const runId = i?.run?.runId;
  const call = i?.call;
  return typeof runId === 'string' && typeof call?.key === 'string' && typeof call.stepId === 'string' ? { runId, call: call as StepCall } : undefined;
}

const declinedOf = (value: unknown): DeclineRecord | undefined => {
  const d = (value as { declined?: unknown } | null)?.declined;
  return typeof d === 'object' && d !== null && typeof (d as DeclineRecord).ledgerEntryId === 'string' ? (d as DeclineRecord) : undefined;
};

/** The gateway as one step call sees it, with each decline its calls meet written to the run's events. */
export function logDeclines(inner: Gateway, store: Store, step: { runId: string; call: StepCall }): Gateway {
  const log = (record: DeclineRecord) => emit(store, step.runId, 'model-declined', { ...record, note: declineStory(record) }, at(step.call, `declined/${record.ledgerEntryId}`));
  const watched =
    <Q, R>(call: (req: Q) => Promise<R>) =>
    async (req: Q): Promise<R> => {
      let result: R;
      try {
        result = await call(req);
      } catch (e) {
        const record = declinedOf(e);
        if (record) await log(record).catch(() => undefined);
        throw e;
      }
      const record = declinedOf(result);
      if (record) await log(record);
      return result;
    };
  return new Proxy(inner, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      const bound = (value as (...a: unknown[]) => unknown).bind(target);
      return prop === 'complete' || prop === 'image' ? watched(bound as (req: unknown) => Promise<unknown>) : bound;
    },
  });
}
