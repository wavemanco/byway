/**
 * The data-directory report byway prints at start (R4; ADR-0096, ADR-0095). The backup unit is the whole data directory
 * (ADR-0094), and a restore that mixes files from different moments fails in ways nothing used to report. This check
 * makes the likely ones visible before the engine starts:
 * - the database file, by SQLite's quick_check, and every recorded artifact's file (checkStore, @byway/store);
 * - the spend ledger's hash chain and head (Gateway.auditLedger);
 * - calls the spend book in byway.sqlite holds as written to ledger.jsonl that the file does not have. A restore of an
 *   older or missing ledger.jsonl is the most likely partial restore, and the ledger's own check calls it intact. The
 *   caps still count those calls, because the book, not the file, is their authority (ADR-0095); what is lost is their
 *   audit record;
 * - runs whose recorded cost is above what the spend book holds for them: spend the caps do not count, which only a
 *   ledger lost before byway first read it into the book can leave;
 * - torn ledger tails set aside after a crash (`ledger.jsonl.damaged-*`), as a note: they block nothing.
 *
 * It never stops byway. It reads the records, the ledger and the artifact files and changes none of them; the spend
 * book first reads in ledger lines it has not seen (Gateway.spend), as the first model call would.
 */
import type { Gateway, Store } from '@byway/contracts';
import { checkStore, type StoreCheck } from '@byway/store';

/** A run whose recorded cost the spend book does not hold. */
export interface UnledgeredRun {
  runId: string;
  /** The run's cost as the store recorded it. */
  storeUsd: number;
  /** What the spend book holds for the run now. */
  bookUsd: number;
}

/** Calls the spend book holds as written to ledger.jsonl that the file lacks, for one run (null: calls of no run). */
export interface AuditGap {
  runId: string | null;
  calls: number;
  usd: number;
}

export interface DataDirReport {
  store: StoreCheck;
  /** The first ledger entry that breaks the hash chain (or `line:<n>`, or `head` for a head record that cannot be read), or null when the chain and head agree. */
  ledgerBrokenAt: string | null;
  /** Runs whose recorded cost is more than a cent above what the spend book holds for them, in run id order. */
  unledgered: UnledgeredRun[];
  /** Calls missing from ledger.jsonl, by run (run ids in order, then calls of no run). */
  auditGaps: AuditGap[];
  /** Torn ledger tails set aside after a crash, by file name. */
  setAside: string[];
}

export interface DataDirReportOptions {
  dataDir: string;
  store: Pick<Store, 'listRuns'>;
  gateway: Pick<Gateway, 'spend' | 'auditLedger'>;
  /** The workspaces whose runs are compared with the spend book; v1 has one, the default workspace. */
  workspaceIds: readonly string[];
}

/** Costs are rounded to the cent and below where they are shown; anything above this is spend that went missing. */
const TOLERANCE_USD = 0.01;
const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6;

export async function dataDirReport(opts: DataDirReportOptions): Promise<DataDirReport> {
  const unledgered: UnledgeredRun[] = [];
  for (const ws of opts.workspaceIds) {
    const { byRun } = await opts.gateway.spend(ws);
    for (const run of await opts.store.listRuns(ws)) {
      const bookUsd = byRun[run.id] ?? 0;
      if (run.costUsd - bookUsd > TOLERANCE_USD) unledgered.push({ runId: run.id, storeUsd: run.costUsd, bookUsd });
    }
  }
  unledgered.sort((a, b) => a.runId.localeCompare(b.runId));
  const [store, audit] = await Promise.all([checkStore(opts.dataDir), opts.gateway.auditLedger()]);
  const gaps = new Map<string | null, AuditGap>();
  for (const call of audit.missing) {
    const runId = call.runId ?? null;
    const gap = gaps.get(runId) ?? { runId, calls: 0, usd: 0 };
    gap.calls += 1;
    gap.usd = roundUsd(gap.usd + call.costUsd);
    gaps.set(runId, gap);
  }
  const auditGaps = [...gaps.values()].sort((a, b) => (a.runId === null ? 1 : b.runId === null ? -1 : a.runId.localeCompare(b.runId)));
  return { store, ledgerBrokenAt: audit.brokenAt, unledgered, auditGaps, setAside: audit.setAside };
}

/** How many of each kind of problem are named one by one before "and N more". */
const LISTED = 5;

const usd = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const listed = (items: string[]) => (items.length > LISTED ? `${items.slice(0, LISTED).join(', ')} and ${items.length - LISTED} more` : items.join(', '));

/**
 * The report as the lines byway prints: a one-line summary, then one line per kind of problem, then notes. `ok` is
 * true when nothing was found; a note (a set-aside ledger tail) does not change it. The words point to the README's
 * "Back up and restore", which says what each mix does.
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
    problems.push(`The spend ledger fails its check at entry ${report.ledgerBrokenAt} (an entry was changed, lost or cut off).`);
  }
  if (report.auditGaps.length > 0) {
    const calls = report.auditGaps.reduce((n, g) => n + g.calls, 0);
    const total = report.auditGaps.reduce((n, g) => n + g.usd, 0);
    const where = report.auditGaps.map((g) => `${g.runId ?? 'recommending and composing'} (${plural(g.calls, 'call', 'calls')}, ${usd(g.usd)})`);
    problems.push(
      `ledger.jsonl lacks ${plural(calls, 'call', 'calls')} (${usd(total)}) that the spend book in byway.sqlite holds as written there: ${listed(where)}. An older or missing ledger.jsonl was restored, or a crash lost lines. The caps still count these calls; only their audit record is missing.`,
    );
  }
  if (report.unledgered.length > 0) {
    const runs = report.unledgered.map((r) => `${r.runId} (${usd(r.storeUsd)} recorded, ${usd(r.bookUsd)} in the spend book)`);
    problems.push(
      `The spend book holds less spend than the records show for ${plural(report.unledgered.length, 'run', 'runs')}: ${listed(runs)}. The caps do not count the difference, so byway can spend it again before a cap stops it; check your providers' own dashboards for what was spent.`,
    );
  }
  const notes =
    report.setAside.length > 0
      ? [`Note: ${listed(report.setAside)} ${report.setAside.length === 1 ? 'holds' : 'hold'} the torn end of the spend ledger, set aside after a crash cut an append short. Kept for inspection; nothing is blocked.`]
      : [];
  if (problems.length === 0) {
    return { ok: true, lines: [`the database and its ${plural(store.artifacts, 'artifact file', 'artifact files')} are complete; the spend ledger's chain is intact and holds every call the spend book counts`, ...notes] };
  }
  return {
    ok: false,
    lines: [`${plural(problems.length, 'problem', 'problems')} in the data directory, perhaps from a partial restore (see "Back up and restore" in the README); byway starts anyway`, ...problems, ...notes],
  };
}
