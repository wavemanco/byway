/**
 * The live cost meter against the run's budget (spec §5, Run screen; §3.4 spend). The runner announces spend in
 * `cost` events ({ totalUsd, budgetUsd }), including each budget raise; the run record is the fallback before the
 * first one arrives. Both the demo and the real runner emit these, so the meter lives here, not in a service.
 */
import type { RunEvent, RunRecord } from '@byway/contracts';
import { CostData, read } from './events.ts';
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

/**
 * Spend and budget from the latest `cost` event. Spend only grows and a budget only rises, so the larger of the
 * event and the run record wins: whichever of the two a poll caught first, the meter never steps backwards.
 */
export function runSpend(run: Pick<RunRecord, 'costUsd' | 'budgetUsd'>, events: RunEvent[]): { costUsd: number; budgetUsd: number } {
  const latest = events.filter((e) => e.type === 'cost').reduce<RunEvent | undefined>((a, e) => (!a || e.seq > a.seq ? e : a), undefined);
  const d = latest ? read(CostData, latest.data) : {};
  return {
    costUsd: Math.max(run.costUsd, d.totalUsd ?? 0),
    budgetUsd: Math.max(run.budgetUsd, d.budgetUsd ?? 0),
  };
}

export function runMeter(run: Pick<RunRecord, 'costUsd' | 'budgetUsd'>, events: RunEvent[]): BudgetMeter {
  const { costUsd, budgetUsd } = runSpend(run, events);
  return budgetMeter(costUsd, budgetUsd);
}
