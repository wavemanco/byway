/**
 * The gateway's spend caps read from the store (spec §3.4): the workspace budget and each run's budget, consulted on
 * every call, so a budget raised at a "Raise the budget by $X?" checkpoint applies to the very next call.
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
  };
}
