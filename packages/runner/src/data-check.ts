/**
 * The data-directory report byway prints at start (R4; ADR-0096). The backup unit is the whole data directory
 * (ADR-0094), and a restore that mixes files from different moments fails in ways nothing used to report. This check
 * makes the likely ones visible before the engine starts:
 * - the database file, by SQLite's quick_check, and every recorded artifact's file (checkStore, @byway/store);
 * - the spend ledger's hash chain and head (Gateway.verifyLedger);
 * - runs whose recorded cost the ledger does not hold. A restore without `ledger.jsonl` and its head, or with an older
 *   pair, is the most likely partial restore, and the ledger's own check calls it intact: a missing file reads as no
 *   spend. The store keeps each run's cost as the ledger last reported it (recordCost never lowers it), so a run whose
 *   recorded cost is above what the ledger now holds for it lost ledger entries.
 *
 * It only reads, and it never stops byway: refusing calls after spend was lost is review finding F03's to decide, and
 * until then the caps count from the restored ledger, which the report says plainly.
 */
import type { Gateway, Store } from '@byway/contracts';
import { checkStore, type StoreCheck } from '@byway/store';

/** A run whose recorded cost the ledger does not hold. */
export interface UnledgeredRun {
  runId: string;
  /** The run's cost as the store recorded it. */
  storeUsd: number;
  /** What the ledger holds for the run now. */
  ledgerUsd: number;
}

export interface DataDirReport {
  store: StoreCheck;
  /** The first ledger entry that breaks the hash chain (or `line:<n>`, or `head` for a head record that cannot be read), or null when the chain and head agree. */
  ledgerBrokenAt: string | null;
  /** Runs whose recorded cost is more than a cent above what the ledger holds for them, in run id order. */
  unledgered: UnledgeredRun[];
}

export interface DataDirReportOptions {
  dataDir: string;
  store: Pick<Store, 'listRuns'>;
  gateway: Pick<Gateway, 'spend' | 'verifyLedger'>;
  /** The workspaces whose runs are compared with the ledger; v1 has one, the default workspace. */
  workspaceIds: readonly string[];
}

/** Costs are rounded to the cent and below where they are shown; anything above this is spend the ledger lost. */
const TOLERANCE_USD = 0.01;

export async function dataDirReport(opts: DataDirReportOptions): Promise<DataDirReport> {
  const [store, ledgerBrokenAt] = await Promise.all([checkStore(opts.dataDir), opts.gateway.verifyLedger()]);
  const unledgered: UnledgeredRun[] = [];
  for (const ws of opts.workspaceIds) {
    const { byRun } = await opts.gateway.spend(ws);
    for (const run of await opts.store.listRuns(ws)) {
      const ledgerUsd = byRun[run.id] ?? 0;
      if (run.costUsd - ledgerUsd > TOLERANCE_USD) unledgered.push({ runId: run.id, storeUsd: run.costUsd, ledgerUsd });
    }
  }
  unledgered.sort((a, b) => a.runId.localeCompare(b.runId));
  return { store, ledgerBrokenAt, unledgered };
}

/** How many of each kind of problem are named one by one before "and N more". */
const LISTED = 5;

const usd = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const listed = (items: string[]) => (items.length > LISTED ? `${items.slice(0, LISTED).join(', ')} and ${items.length - LISTED} more` : items.join(', '));

/**
 * The report as the lines byway prints: a one-line summary, then one line per kind of problem. `ok` is true when
 * nothing was found. The words point to the README's "Back up and restore", which says what each mix does.
 */
export function reportLines(report: DataDirReport): { ok: boolean; lines: string[] } {
  const problems: string[] = [];
  const { store } = report;
  if (store.database.length > 0) problems.push(`The database file reports damage: ${store.database.join('; ')}`);
  if (store.missing.length > 0) {
    const one = store.missing.length === 1;
    const runs = [...new Set(store.missing.flatMap((m) => m.runIds))].sort();
    problems.push(
      `${plural(store.missing.length, 'artifact file is', 'artifact files are')} missing or cut short (${listed(store.missing.map((m) => m.id))}), so what ${one ? 'it holds' : 'they hold'} cannot be shown${runs.length > 0 ? `. ${runs.length === 1 ? 'Run that uses' : 'Runs that use'} ${one ? 'it' : 'them'}: ${listed(runs)}` : ''}.`,
    );
  }
  if (report.ledgerBrokenAt === 'head') {
    problems.push("The spend ledger's head record (ledger.jsonl.head) cannot be read, so whether entries were cut off the end cannot be checked; the next model call rewrites it.");
  } else if (report.ledgerBrokenAt !== null) {
    problems.push(`The spend ledger fails its check at entry ${report.ledgerBrokenAt} (an entry was changed, lost or cut off), so its totals may be short.`);
  }
  if (report.unledgered.length > 0) {
    const runs = report.unledgered.map((r) => `${r.runId} (${usd(r.storeUsd)} recorded, ${usd(r.ledgerUsd)} in the ledger)`);
    problems.push(
      `The spend ledger holds less spend than the records show for ${plural(report.unledgered.length, 'run', 'runs')}: ${listed(runs)}. The caps do not count the difference, so byway can spend it again before a cap stops it; check your providers' own dashboards for what was spent.`,
    );
  }
  if (problems.length === 0) {
    return { ok: true, lines: [`the database and its ${plural(store.artifacts, 'artifact file', 'artifact files')} are complete; the spend ledger's chain is intact and covers every run's recorded cost`] };
  }
  return {
    ok: false,
    lines: [`${plural(problems.length, 'problem', 'problems')} in the data directory, perhaps from a partial restore (see "Back up and restore" in the README); byway starts anyway`, ...problems],
  };
}
