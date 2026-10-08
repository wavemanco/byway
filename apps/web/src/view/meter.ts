/** The live cost meter against the run's budget (spec §5, Run screen; §3.4 spend). */
import { formatUsd } from './format.ts';

export interface BudgetMeter {
  /** 0–1 share of the budget spent; null when the budget is unknown. */
  fraction: number | null;
  /** 'near' from 80% of the budget, 'over' once it is reached. */
  tone: 'ok' | 'near' | 'over';
  spent: string;
  budget: string | null;
}

export function budgetMeter(costUsd: number, budgetUsd: number | undefined): BudgetMeter {
  const spent = formatUsd(costUsd);
  if (budgetUsd === undefined || !(budgetUsd > 0)) return { fraction: null, tone: 'ok', spent, budget: null };
  const share = costUsd / budgetUsd;
  return {
    fraction: Math.min(1, Math.max(0, share)),
    tone: share >= 1 ? 'over' : share >= 0.8 ? 'near' : 'ok',
    spent,
    budget: formatUsd(budgetUsd),
  };
}
