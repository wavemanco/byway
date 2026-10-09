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
 * - lines of the ledger the spend book could not read and that wait to be acknowledged in Settings: paid calls wait
 *   until they are (ADR-0095 decision 6), and a line that is not an entry is described by what the book did with it;
 * - settled calls the spend book has not written to ledger.jsonl yet, and torn ledger tails set aside after a crash
 *   (`ledger.jsonl.damaged-*`), as notes: they block nothing.
 *
 * It never stops byway. It reads the records, the ledger and the artifact files and changes none of them; the spend
 * book first reads in ledger lines it has not seen (Gateway.spend, Gateway.auditLedger), as the first model call would,
 * so a line it cannot read is recorded as a fault here rather than at the first paid call.
 */
import type { BrokenLine, Gateway, Store } from '@byway/contracts';
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
  /** For `line:<n>`: what the spend book did with that line (LedgerAudit.brokenLine). */
  ledgerBrokenLine?: BrokenLine;
  /** Runs whose recorded cost is more than a cent above what the spend book holds for them, in run id order. */
  unledgered: UnledgeredRun[];
  /** Calls missing from ledger.jsonl, by run (run ids in order, then calls of no run). */
  auditGaps: AuditGap[];
  /** Torn ledger tails set aside after a crash, by file name. */
  setAside: string[];
  /** Settled calls the spend book has not written to ledger.jsonl yet (its outbox writes them shortly). */
  pending: number;
  /** Lines of the ledger the spend book could not read, waiting to be acknowledged in Settings: paid calls wait. */
  openFaults: number;
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
  return {
    store,
    ledgerBrokenAt: audit.brokenAt,
    ...(audit.brokenLine ? { ledgerBrokenLine: audit.brokenLine } : {}),
    unledgered,
    auditGaps,
    setAside: audit.setAside,
    pending: audit.pending,
    openFaults: audit.openFaults,
  };
}

/** A line of the ledger that is not an entry, by what the spend book did with it (LedgerAudit.brokenLine). */
function brokenLineText(n: string, fate: BrokenLine | undefined): string {
  switch (fate?.book) {
    case 'torn':
      return `The last line of the spend ledger (line ${n}) has no line ending: a crash probably cut an append short. byway sets it aside the next time it writes to the ledger.`;
    case 'blank':
      return `Line ${n} of the spend ledger is blank; the spend book skips it.`;
    case 'acknowledged':
      return `Line ${n} of the spend ledger cannot be read as an entry; it was acknowledged in Settings, so the budgets do not count it.`;
    case 'read-before':
      return `Line ${n} of the spend ledger cannot be read as an entry; it changed after byway read it, and the spend book keeps what it read there then.`;
    default:
      // A fault waiting to be acknowledged is said by a line of its own; a line not read yet becomes one.
      return `Line ${n} of the spend ledger cannot be read as an entry.`;
  }
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
  const line = /^line:(\d+)$/.exec(report.ledgerBrokenAt ?? '');
  if (report.ledgerBrokenAt === 'head') {
    problems.push("The spend ledger's head record (ledger.jsonl.head) cannot be read, so whether entries were cut off the end cannot be checked; the next model call rewrites it.");
  } else if (line) {
    problems.push(brokenLineText(line[1] as string, report.ledgerBrokenLine));
  } else if (report.ledgerBrokenAt !== null) {
    problems.push(`The spend ledger fails its check at entry ${report.ledgerBrokenAt} (an entry was changed, lost or cut off).`);
  }
  if (report.openFaults > 0) {
    const one = report.openFaults === 1;
    problems.push(
      `${one ? '1 line of the spend ledger that byway could not count is' : `${report.openFaults} lines of the spend ledger that byway could not count are`} listed under Spending records in Settings; byway makes no paid call until you acknowledge ${one ? 'it' : 'them'} there.`,
    );
  }
  if (report.auditGaps.length > 0) {
    const calls = report.auditGaps.reduce((n, g) => n + g.calls, 0);
    const total = report.auditGaps.reduce((n, g) => n + g.usd, 0);
    const where = report.auditGaps.map((g) => `${g.runId ?? 'recommending and composing'} (${plural(g.calls, 'call', 'calls')}, ${usd(g.usd)})`);
    problems.push(
      `ledger.jsonl lacks ${plural(calls, 'call', 'calls')} (${usd(total)}) that the spend book in byway.sqlite holds as written there: ${listed(where)}. An older or missing ledger.jsonl was restored, a crash lost lines, or a line was damaged. The caps still count these calls; only their audit record is missing.`,
    );
  }
  if (report.unledgered.length > 0) {
    const runs = report.unledgered.map((r) => `${r.runId} (${usd(r.storeUsd)} recorded, ${usd(r.bookUsd)} in the spend book)`);
    problems.push(
      `The spend book holds less spend than the records show for ${plural(report.unledgered.length, 'run', 'runs')}: ${listed(runs)}. The caps do not count the difference, so byway can spend it again before a cap stops it; check your providers' own dashboards for what was spent.`,
    );
  }
  const notes: string[] = [];
  if (report.pending > 0) {
    notes.push(`Note: ${plural(report.pending, 'settled call is', 'settled calls are')} counted in the spend book but not yet written to ledger.jsonl; byway writes ${report.pending === 1 ? 'it' : 'them'} shortly.`);
  }
  if (report.setAside.length > 0) {
    notes.push(`Note: ${listed(report.setAside)} ${report.setAside.length === 1 ? 'holds' : 'hold'} the torn end of the spend ledger, set aside after a crash cut an append short. Kept for inspection; nothing is blocked.`);
  }
  if (problems.length === 0) {
    // Exactly what was checked: calls the book has not written to the file yet are in the notes, and calls under way or
    // that may have been billed are never in the file.
    return {
      ok: true,
      lines: [
        `the database and its ${plural(store.artifacts, 'artifact file', 'artifact files')} are complete; the spend ledger's chain is intact, and it holds every call the spend book records as written to it, at the same cost`,
        ...notes,
      ],
    };
  }
  return {
    ok: false,
    lines: [`${plural(problems.length, 'problem', 'problems')} in the data directory, perhaps from a partial restore (see "Back up and restore" in the README); byway starts anyway`, ...problems, ...notes],
  };
}
