/**
 * The spend book over byway.sqlite (contracts v6 SpendBook; ADR-0095). The web process and the worker each open the
 * store, so each has a connection to the same file: every method here is one short BEGIN IMMEDIATE transaction on it,
 * and none spans a network call, so admission in one process sees the other's calls in flight.
 *
 * The transactions that move money (admit, markSent, accept, settle) commit with PRAGMA synchronous=FULL, so a power
 * loss cannot undo an admission whose call then went out, or a settlement whose result the caller already has. The
 * pragma cannot change inside a transaction, so it is set before BEGIN and put back after COMMIT; node:sqlite is
 * synchronous, so nothing else runs on the connection in between.
 *
 * The exposure rule and the states are the contract's (packages/contracts/src/spend.ts). Amounts are kept as REAL and
 * rounded to the micro-dollar where they are summed.
 */
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  AdmitOutcome,
  AdmitRequest,
  BookRecords,
  BookSpend,
  BudgetDetails,
  LedgerBatch,
  LedgerCursor,
  LedgerEntry,
  LedgerLine,
  LedgeredCall,
  PaidCallSummary,
  ProviderId,
  ProviderJobRole,
  Settlement,
  SettledCall,
  SpendBook,
  SpendFault,
  UncertainCall,
  UnledgeredCall,
} from '@byway/contracts';
import { ledgerEntryProblem, spendFaultDetail } from '@byway/contracts';
import { migrate } from './migrations.ts';
import { openDatabase, writeTransaction } from './db.ts';
import { StoreError } from './errors.ts';

const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6;
const ROLES: ReadonlySet<ProviderJobRole> = new Set(['generation', 'extract']);
/** A book-side comparison tolerance: amounts are rounded to the micro-dollar. */
const EPSILON = 1e-9;

/** In SQL: the row's caller is still renewing it (`:now` bound to the book's clock). */
const LIVE = `lease_until > :now`;
const IN_FLIGHT = `state IN ('open', 'sent', 'accepted') AND ${LIVE}`;
/** In SQL: the row may have been billed and counts its reservation (not its retained part) until cleared. */
const UNCERTAIN = `cleared_at IS NULL AND (state = 'uncertain' OR (state IN ('sent', 'accepted') AND lease_until <= :now))`;

function usdOf(what: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new StoreError('invalid', `${what} must be a finite, non-negative amount in USD, got ${String(value)}`);
  return value;
}

function textOf(what: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new StoreError('invalid', `${what} must be a non-empty string`);
  return value;
}

/** The fault message admission gives while a fault is open: what was found, where, and what to do. */
export function faultMessage(offset: number): string {
  return `byway found a line in its spend ledger (ledger.jsonl, at byte ${offset}) that it cannot read, so it cannot be sure what has been spent. Paid calls wait until you look at it in Settings and acknowledge it.`;
}

type Row = Record<string, unknown>;

export class SqliteSpendBook implements SpendBook {
  readonly #db: DatabaseSync;
  readonly #now: () => Date;
  readonly #ensureOpen: () => void;
  readonly #q: ReturnType<typeof prepare>;

  constructor(db: DatabaseSync, now: () => Date = () => new Date(), ensureOpen: () => void = () => undefined) {
    this.#db = db;
    this.#now = now;
    this.#ensureOpen = ensureOpen;
    this.#q = prepare(db);
  }

  async admit(req: AdmitRequest): Promise<AdmitOutcome> {
    const opId = textOf('opId', req.opId);
    const owner = textOf('owner', req.owner);
    const workspaceId = textOf('workspaceId', req.workspaceId);
    const reserve = usdOf('reserveUsd', req.reserveUsd);
    const wsCap = usdOf('the workspace cap', req.caps.workspaceUsd);
    const runCap = req.caps.runUsd === undefined ? undefined : usdOf('the run cap', req.caps.runUsd);
    if (!Number.isSafeInteger(req.leaseMs) || req.leaseMs <= 0) throw new StoreError('invalid', `leaseMs must be a positive integer, got ${String(req.leaseMs)}`);
    return this.#durable<AdmitOutcome>(() => {
      const q = this.#queries();
      const now = this.#ms();
      if (req.paid) {
        const fault = q.openFault.get();
        if (fault) return { fault: faultMessage(Number(fault.ledger_offset)) };
      }
      const at = this.#stamp();
      q.sweepOpen.run({ now, at });
      q.sweepSent.run({ now, at });
      const ws = this.#workspaceExposure(workspaceId, now);
      const wsTotal = ws.settled + ws.inFlight + ws.uncertain + reserve;
      if (wsTotal > wsCap + EPSILON) {
        return { budget: details('workspace', wsCap, ws.settled, ws.inFlight, reserve, wsTotal, ws.uncertain) };
      }
      if (req.runId !== undefined && runCap !== undefined) {
        const run = q.runExposure.get({ run: req.runId, now }) as Row;
        const settled = roundUsd(Number(run.settled));
        const inFlight = roundUsd(Number(run.in_flight));
        const runTotal = settled + inFlight + reserve;
        if (runTotal > runCap + EPSILON) return { budget: details('run', runCap, settled, inFlight, reserve, runTotal) };
      }
      q.insertOpen.run({
        id: opId,
        workspace: workspaceId,
        run: req.runId ?? null,
        step: req.stepId ?? null,
        purpose: textOf('purpose', req.purpose),
        kind: textOf('kind', req.kind),
        provider: textOf('provider', req.provider),
        model: textOf('model', req.model),
        paid: req.paid ? 1 : 0,
        reserved: reserve,
        owner,
        lease: now + req.leaseMs,
        at,
      });
      return { admitted: true };
    });
  }

  async markSent(opId: string, owner: string): Promise<boolean> {
    return this.#durable(() => Number(this.#queries().markSent.run({ id: opId, owner, now: this.#ms(), at: this.#stamp() }).changes) > 0);
  }

  async accept(opId: string, role: ProviderJobRole, providerJobId: string): Promise<void> {
    if (!ROLES.has(role)) throw new StoreError('invalid', `a provider job role is generation or extract, got ${String(role)}`);
    const job = textOf('providerJobId', providerJobId);
    this.#durable(() => {
      this.#queries().accept.run({ id: opId, path: `$.${role}`, job, at: this.#stamp() });
    });
  }

  async retain(opId: string, usd: number, workspaceCapUsd: number): Promise<{ retained: true } | { budget: BudgetDetails }> {
    const amount = usdOf('the retained amount', usd);
    const cap = usdOf('the workspace cap', workspaceCapUsd);
    return this.#tx(() => {
      const q = this.#queries();
      const row = q.get.get(opId) as Row | undefined;
      if (!row) throw new StoreError('not-found', `no paid operation ${JSON.stringify(opId)}`);
      const ws = this.#workspaceExposure(String(row.workspace_id), this.#ms());
      const total = ws.settled + ws.inFlight + ws.uncertain + amount;
      if (total > cap + EPSILON) return { budget: details('workspace', cap, ws.settled, ws.inFlight, amount, total, ws.uncertain) };
      q.retain.run({ id: opId, usd: amount, at: this.#stamp() });
      return { retained: true as const };
    });
  }

  async release(opId: string): Promise<void> {
    this.#tx(() => this.#queries().release.run({ id: opId, at: this.#stamp() }));
  }

  async abandon(opId: string): Promise<void> {
    this.#tx(() => this.#queries().abandon.run({ id: opId, at: this.#stamp() }));
  }

  async settle(opId: string, settlement: Settlement): Promise<{ ledgerEntryId: string }> {
    const entry = settlement.entry;
    const cost = usdOf('the settled cost', entry.costUsd);
    const at = textOf('the settlement time', settlement.at);
    return this.#durable(() => {
      const q = this.#queries();
      const row = q.get.get(opId) as Row | undefined;
      if (!row) throw new StoreError('not-found', `no paid operation ${JSON.stringify(opId)}`);
      if (row.state === 'settled') return { ledgerEntryId: String(row.ledger_entry_id) };
      const ledgerEntryId = randomUUID();
      q.settle.run({
        id: opId,
        cost,
        settledAt: at,
        served: entry.servedModel,
        basis: entry.priceBasis ?? null,
        entry: JSON.stringify(entry),
        entryId: ledgerEntryId,
        at: this.#stamp(),
      });
      return { ledgerEntryId };
    });
  }

  async renew(opIds: readonly string[], owner: string, leaseMs: number): Promise<void> {
    if (opIds.length === 0) return;
    this.#tx(() => {
      const q = this.#queries();
      const lease = this.#ms() + leaseMs;
      for (const id of opIds) q.renew.run({ id, owner, lease });
    });
  }

  async endLeases(owner: string): Promise<void> {
    this.#tx(() => {
      const q = this.#queries();
      const at = this.#stamp();
      q.endOpen.run({ owner, at });
      q.endSent.run({ owner, at });
    });
  }

  async cursor(): Promise<LedgerCursor> {
    const row = this.#queries().cursor.get() as Row;
    return { offset: Number(row.ledger_offset), tailStart: Number(row.ledger_tail_start), tailSha256: row.ledger_tail_sha256 === null ? null : String(row.ledger_tail_sha256) };
  }

  async absorb(batch: LedgerBatch): Promise<{ faults: number }> {
    return this.#tx(() => {
      const q = this.#queries();
      const at = this.#stamp();
      // A line the book cannot record is a fault at that line, never an error: one damaged line must not stop the rest
      // of the file, demo calls or Settings from being read (ADR-0095 decision 6).
      const refused: { line: LedgerLine; problem?: string }[] = batch.unreadable.map((u) => ({ line: u, ...(u.problem !== undefined ? { problem: u.problem } : {}) }));
      for (const line of batch.entries) {
        const problem = ledgerEntryProblem(line.entry) ?? this.#absorbEntry(line.entry, at);
        if (problem !== undefined) refused.push({ line, problem });
      }
      let faults = 0;
      for (const { line, problem } of refused.sort((x, y) => x.line.offset - y.line.offset)) {
        faults += Number(q.insertFault.run({ offset: line.offset, sha: line.sha256, detail: spendFaultDetail(line, problem), at }).changes);
      }
      const c = batch.cursor;
      q.setCursor.run({ offset: c.offset, tailStart: c.tailStart, tailSha: c.tailSha256 });
      return { faults };
    });
  }

  async unledgered(limit: number): Promise<UnledgeredCall[]> {
    return (this.#queries().unledgered.all(limit) as Row[]).map((r) => ({ opId: String(r.id), entryId: String(r.ledger_entry_id), at: String(r.settled_at), entry: JSON.parse(String(r.entry)) as SettledCall }));
  }

  async markLedgered(opId: string, seq: number): Promise<void> {
    this.#tx(() => this.#queries().markLedgered.run({ id: opId, seq, at: this.#stamp() }));
  }

  async ledgeredCalls(): Promise<LedgeredCall[]> {
    return (this.#queries().ledgered.all() as Row[]).map((r) => ({
      opId: String(r.id),
      entryId: String(r.ledger_entry_id),
      workspaceId: String(r.workspace_id),
      ...(r.run_id === null ? {} : { runId: String(r.run_id) }),
      costUsd: Number(r.settled_usd),
    }));
  }

  async spend(workspaceId: string): Promise<BookSpend> {
    const q = this.#queries();
    const now = this.#ms();
    const ws = this.#workspaceExposure(workspaceId, now);
    const byRun: Record<string, number> = {};
    for (const r of q.byRun.all(workspaceId) as Row[]) byRun[String(r.run_id)] = roundUsd(Number(r.usd));
    const assumed = q.assumed.get(workspaceId) as Row;
    const calls = Number(assumed.calls);
    return {
      spentUsd: ws.settled,
      byRun,
      inFlightUsd: ws.inFlight,
      uncertainUsd: ws.uncertain,
      ...(calls > 0 ? { assumedPricing: { calls, usd: roundUsd(Number(assumed.usd)) } } : {}),
    };
  }

  async records(workspaceId: string): Promise<BookRecords> {
    const q = this.#queries();
    const now = this.#ms();
    const inFlight: PaidCallSummary[] = (q.inFlightRows.all({ ws: workspaceId, now }) as Row[]).map((r) => ({ ...summary(r), usd: roundUsd(Number(r.reserved_usd)), since: String(r.created_at) }));
    const uncertain: UncertainCall[] = (q.uncertainRows.all({ ws: workspaceId, now }) as Row[]).map((r) => {
      const counted = Number(r.counted) === 1;
      const reason: UncertainCall['reason'] = !counted ? 'resent' : r.state === 'uncertain' && r.uncertain_reason === 'failed' ? 'failed' : 'interrupted';
      const jobs = r.provider_jobs === null ? undefined : (JSON.parse(String(r.provider_jobs)) as UncertainCall['providerJobs']);
      return {
        ...summary(r),
        usd: roundUsd((counted ? Number(r.reserved_usd) : 0) + Number(r.retained_usd)),
        since: String(r.updated_at),
        reason,
        ...(jobs && Object.keys(jobs).length > 0 ? { providerJobs: jobs } : {}),
      };
    });
    const faults: SpendFault[] = (q.openFaults.all() as Row[]).map((r) => ({ id: Number(r.id), detail: String(r.detail), createdAt: String(r.created_at) }));
    return { inFlight, uncertain, faults, notInAuditFile: Number((q.outboxSize.get() as Row).n) };
  }

  async clearUncertain(workspaceId: string, opIds: readonly string[]): Promise<number> {
    return this.#tx(() => {
      const q = this.#queries();
      const now = this.#ms();
      const at = this.#stamp();
      let cleared = 0;
      for (const id of new Set(opIds)) cleared += Number(q.clear.run({ id, ws: workspaceId, now, at }).changes);
      return cleared;
    });
  }

  async acknowledgeFault(id: number): Promise<boolean> {
    return this.#tx(() => Number(this.#queries().acknowledge.run({ id, at: this.#stamp() }).changes) > 0);
  }

  /**
   * One audit-file entry into the book (see SpendBook.absorb), inside absorb's transaction and in a savepoint of its
   * own. An entry the database refuses (it would give one call another call's entry id) changes nothing and is returned
   * as a problem, which absorb records as a fault; any other error is the database's, not the line's, and is thrown.
   */
  #absorbEntry(e: LedgerEntry, at: string): string | undefined {
    this.#db.exec('SAVEPOINT absorb_entry');
    try {
      this.#recordEntry(e, at);
      this.#db.exec('RELEASE absorb_entry');
      return undefined;
    } catch (err) {
      this.#db.exec('ROLLBACK TO absorb_entry');
      this.#db.exec('RELEASE absorb_entry');
      if (!isConstraintError(err)) throw err;
      return 'it conflicts with a call the spend book already holds';
    }
  }

  #recordEntry(e: LedgerEntry, at: string): void {
    const q = this.#queries();
    const values = {
      entryId: e.id,
      seq: e.seq,
      cost: e.costUsd,
      settledAt: e.at,
      served: e.servedModel ?? null,
      basis: e.priceBasis ?? null,
      at,
    };
    if (e.operationId) {
      const row = q.get.get(e.operationId) as Row | undefined;
      if (row) {
        if (row.state !== 'settled') q.settleFromEntry.run({ id: e.operationId, ...values });
        else q.markLedgered.run({ id: e.operationId, seq: e.seq, at });
        return;
      }
    }
    q.insertSettled.run({
      id: e.operationId ?? `ledger:${e.id}`,
      workspace: e.workspaceId,
      run: e.runId ?? null,
      step: e.stepId ?? null,
      purpose: String(e.purpose ?? ''),
      kind: String(e.kind ?? ''),
      provider: String(e.provider ?? ''),
      model: String(e.requestedModel ?? ''),
      paid: e.costUsd > 0 ? 1 : 0,
      ...values,
    });
  }

  #workspaceExposure(workspaceId: string, now: number): { settled: number; inFlight: number; uncertain: number } {
    const r = this.#queries().workspaceExposure.get({ ws: workspaceId, now }) as Row;
    return { settled: roundUsd(Number(r.settled)), inFlight: roundUsd(Number(r.in_flight)), uncertain: roundUsd(Number(r.uncertain)) };
  }

  /** One BEGIN IMMEDIATE transaction on the store's connection. */
  #tx<T>(fn: () => T): T {
    this.#ensureOpen();
    return writeTransaction(this.#db, fn);
  }

  /** A write transaction that commits with synchronous=FULL (see the header). */
  #durable<T>(fn: () => T): T {
    this.#ensureOpen();
    this.#db.exec('PRAGMA synchronous = FULL');
    try {
      return writeTransaction(this.#db, fn);
    } finally {
      this.#db.exec('PRAGMA synchronous = NORMAL');
    }
  }

  #queries(): ReturnType<typeof prepare> {
    this.#ensureOpen();
    return this.#q;
  }

  #ms(): number {
    return this.#now().getTime();
  }

  #stamp(): string {
    return this.#now().toISOString();
  }
}

/** SQLite's SQLITE_CONSTRAINT (19), in any of its extended forms (a UNIQUE, CHECK or NOT NULL constraint failed). */
function isConstraintError(err: unknown): boolean {
  const code = (err as { errcode?: unknown } | null)?.errcode;
  return typeof code === 'number' && (code & 0xff) === 19;
}

function summary(r: Row): Omit<PaidCallSummary, 'usd' | 'since'> {
  return {
    opId: String(r.id),
    ...(r.run_id === null ? {} : { runId: String(r.run_id) }),
    purpose: String(r.purpose),
    provider: String(r.provider) as ProviderId,
    model: String(r.model),
  };
}

function details(scope: 'workspace' | 'run', capUsd: number, spentUsd: number, reservedUsd: number, estimateUsd: number, total: number, uncertainUsd?: number): BudgetDetails {
  return {
    scope,
    capUsd,
    spentUsd,
    reservedUsd,
    ...(uncertainUsd === undefined ? {} : { uncertainUsd }),
    estimateUsd: roundUsd(estimateUsd),
    shortfallUsd: roundUsd(Math.max(0, total - capUsd)),
  };
}

function prepare(db: DatabaseSync) {
  const p = (sql: string): StatementSync => db.prepare(sql);
  return {
    get: p('SELECT * FROM paid_operations WHERE id = ?'),
    openFault: p('SELECT ledger_offset FROM spend_faults WHERE acknowledged_at IS NULL ORDER BY id LIMIT 1'),
    openFaults: p('SELECT id, detail, created_at FROM spend_faults WHERE acknowledged_at IS NULL ORDER BY id'),
    sweepOpen: p(`UPDATE paid_operations SET state = 'released', updated_at = :at WHERE state = 'open' AND lease_until <= :now`),
    sweepSent: p(`UPDATE paid_operations SET state = 'uncertain', uncertain_reason = 'interrupted', updated_at = :at WHERE state IN ('sent', 'accepted') AND lease_until <= :now`),
    workspaceExposure: p(`SELECT
      COALESCE(SUM(CASE WHEN state = 'settled' THEN settled_usd END), 0) AS settled,
      COALESCE(SUM(CASE WHEN ${IN_FLIGHT} THEN reserved_usd END), 0) AS in_flight,
      COALESCE(SUM(CASE WHEN ${UNCERTAIN} THEN reserved_usd END), 0) + COALESCE(SUM(CASE WHEN cleared_at IS NULL THEN retained_usd END), 0) AS uncertain
      FROM paid_operations WHERE workspace_id = :ws`),
    runExposure: p(`SELECT
      COALESCE(SUM(CASE WHEN state = 'settled' THEN settled_usd END), 0) AS settled,
      COALESCE(SUM(CASE WHEN ${IN_FLIGHT} THEN reserved_usd END), 0) AS in_flight
      FROM paid_operations WHERE run_id = :run`),
    insertOpen: p(`INSERT INTO paid_operations (id, workspace_id, run_id, step_id, purpose, kind, provider, model, paid, reserved_usd, state, owner,
      lease_until, created_at, updated_at) VALUES (:id, :workspace, :run, :step, :purpose, :kind, :provider, :model, :paid, :reserved, 'open', :owner,
      :lease, :at, :at)`),
    markSent: p(`UPDATE paid_operations SET state = 'sent', sent_at = :at, updated_at = :at WHERE id = :id AND owner = :owner AND state = 'open' AND ${LIVE}`),
    accept: p(`UPDATE paid_operations SET state = CASE WHEN state IN ('open', 'sent') THEN 'accepted' ELSE state END,
      provider_jobs = json_set(COALESCE(provider_jobs, '{}'), :path, :job), updated_at = :at WHERE id = :id`),
    retain: p('UPDATE paid_operations SET retained_usd = retained_usd + :usd, updated_at = :at WHERE id = :id'),
    release: p(`UPDATE paid_operations SET state = 'released', updated_at = :at WHERE id = :id AND state <> 'settled'`),
    abandon: p(`UPDATE paid_operations SET state = 'uncertain', uncertain_reason = 'failed', updated_at = :at WHERE id = :id AND state IN ('open', 'sent', 'accepted')`),
    settle: p(`UPDATE paid_operations SET state = 'settled', settled_usd = :cost, settled_at = :settledAt, served_model = :served, price_basis = :basis,
      entry = :entry, ledger_entry_id = :entryId, settle_seq = (SELECT COALESCE(MAX(settle_seq), 0) + 1 FROM paid_operations), updated_at = :at WHERE id = :id`),
    settleFromEntry: p(`UPDATE paid_operations SET state = 'settled', settled_usd = :cost, settled_at = :settledAt, served_model = :served, price_basis = :basis,
      ledger_entry_id = :entryId, ledgered_seq = :seq, settle_seq = (SELECT COALESCE(MAX(settle_seq), 0) + 1 FROM paid_operations), updated_at = :at WHERE id = :id`),
    insertSettled: p(`INSERT OR IGNORE INTO paid_operations (id, workspace_id, run_id, step_id, purpose, kind, provider, model, paid, reserved_usd, state,
      lease_until, settled_at, settle_seq, settled_usd, served_model, price_basis, ledger_entry_id, ledgered_seq, created_at, updated_at)
      VALUES (:id, :workspace, :run, :step, :purpose, :kind, :provider, :model, :paid, 0, 'settled', 0, :settledAt,
      (SELECT COALESCE(MAX(settle_seq), 0) + 1 FROM paid_operations), :cost, :served, :basis, :entryId, :seq, :at, :at)`),
    renew: p(`UPDATE paid_operations SET lease_until = :lease WHERE id = :id AND owner = :owner AND state IN ('open', 'sent', 'accepted')`),
    endOpen: p(`UPDATE paid_operations SET state = 'released', updated_at = :at WHERE owner = :owner AND state = 'open'`),
    endSent: p(`UPDATE paid_operations SET state = 'uncertain', uncertain_reason = 'interrupted', updated_at = :at WHERE owner = :owner AND state IN ('sent', 'accepted')`),
    cursor: p('SELECT ledger_offset, ledger_tail_start, ledger_tail_sha256 FROM spend_book_meta WHERE id = 1'),
    setCursor: p('UPDATE spend_book_meta SET ledger_offset = :offset, ledger_tail_start = :tailStart, ledger_tail_sha256 = :tailSha WHERE id = 1'),
    insertFault: p('INSERT OR IGNORE INTO spend_faults (ledger_offset, line_sha256, detail, created_at) VALUES (:offset, :sha, :detail, :at)'),
    unledgered: p(`SELECT id, ledger_entry_id, settled_at, entry FROM paid_operations WHERE state = 'settled' AND ledgered_seq IS NULL AND entry IS NOT NULL
      ORDER BY settle_seq LIMIT ?`),
    markLedgered: p('UPDATE paid_operations SET ledgered_seq = :seq, updated_at = :at WHERE id = :id AND ledgered_seq IS NULL'),
    ledgered: p('SELECT id, ledger_entry_id, workspace_id, run_id, settled_usd FROM paid_operations WHERE ledgered_seq IS NOT NULL ORDER BY settle_seq'),
    byRun: p(`SELECT run_id, SUM(settled_usd) AS usd FROM paid_operations WHERE workspace_id = ? AND state = 'settled' AND run_id IS NOT NULL GROUP BY run_id ORDER BY run_id`),
    assumed: p(`SELECT COUNT(*) AS calls, COALESCE(SUM(settled_usd), 0) AS usd FROM paid_operations WHERE workspace_id = ? AND state = 'settled' AND price_basis = 'assumed'`),
    inFlightRows: p(`SELECT * FROM paid_operations WHERE workspace_id = :ws AND ${IN_FLIGHT} ORDER BY created_at, rowid`),
    uncertainRows: p(`SELECT *, CASE WHEN ${UNCERTAIN} THEN 1 ELSE 0 END AS counted FROM paid_operations
      WHERE workspace_id = :ws AND cleared_at IS NULL AND (${UNCERTAIN} OR retained_usd > 0) ORDER BY updated_at, rowid`),
    outboxSize: p(`SELECT COUNT(*) AS n FROM paid_operations WHERE state = 'settled' AND ledgered_seq IS NULL`),
    clear: p(`UPDATE paid_operations SET cleared_at = :at, updated_at = :at WHERE id = :id AND workspace_id = :ws AND cleared_at IS NULL
      AND (state = 'uncertain' OR (state IN ('sent', 'accepted') AND lease_until <= :now) OR retained_usd > 0)`),
    acknowledge: p('UPDATE spend_faults SET acknowledged_at = :at WHERE id = :id AND acknowledged_at IS NULL'),
  };
}

/**
 * A spend book on its own connection (tests, tools, and the in-memory book `:memory:`): the file is migrated first, as
 * the store does. Close it with `close()`.
 */
export function openSpendBook(file: string, options: { now?: () => Date; busyTimeoutMs?: number } = {}): SqliteSpendBook & { close(): void } {
  const db = file === ':memory:' ? openMemory() : openDatabase(file, options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs });
  try {
    migrate(db, options.now);
    let closed = false;
    const book = new SqliteSpendBook(db, options.now, () => {
      if (closed) throw new StoreError('closed', 'the spend book is closed');
    });
    return Object.assign(book, {
      close() {
        if (closed) return;
        closed = true;
        db.close();
      },
    });
  } catch (e) {
    db.close();
    throw e;
  }
}

/** WAL and a busy timeout mean nothing for a private in-memory database, and openDatabase insists on WAL. */
function openMemory(): DatabaseSync {
  return new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
}
