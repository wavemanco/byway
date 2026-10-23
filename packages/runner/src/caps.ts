/**
 * The gateway's spend caps read from the store (spec §3.4): the workspace budget and each run's budget, consulted on
 * every call, so a budget raised at a "Raise the budget by $X?" checkpoint applies to the very next call. Beside them,
 * each model's answer wait chosen in Settings ("How long to wait for an answer"; Store.getAnswerWaits), read on every
 * call too, so a changed wait applies from the next call.
 */
import type { Store } from '@byway/contracts';
import type { CapsSource } from '@byway/gateway';

export function storeCaps(store: Store): CapsSource {
  return {
    async workspaceCapUsd(workspaceId) {
      return (await store.getWorkspace(workspaceId))?.budgetUsd ?? 0;
    },
    async runCapUsd(runId) {
      return (await store.getRun(runId))?.budgetUsd;
    },
    // The choice for this provider and model, if the person made one; the gateway falls back to its kind's default.
    async waitMinutes(workspaceId, ref) {
      return (await store.getAnswerWaits(workspaceId)).find((w) => w.provider === ref.provider && w.model === ref.model)?.minutes;
    },
  };
}
