/**
 * A spend book held in memory (contracts v6 SpendBook; ADR-0095), for tests and tools that run one gateway without a
 * store. It passes the same contract suite as @byway/store's book over byway.sqlite, which is what production gateways
 * are given (`store.spendBook`): this one is not shared between processes and does not survive a restart.
 *
 * Every method does its work synchronously before its promise settles, so two calls never interleave, as two
 * transactions on one SQLite connection would not.
 */
import { randomUUID } from 'node:crypto';
import type {
  AdmitOutcome,
  AdmitRequest,
  BookRecords,
  BookSpend,
  BudgetDetails,
  HeldCall,
  LedgerBatch,
  LedgerCursor,
  LedgerEntry,
  LedgerLine,
  LedgeredCall,
  PaidOperationState,
  ProviderJobRole,
  RecordedFault,
  Settlement,
  SettledCall,
  SpendBook,
  UncertainCall,
  UnledgeredCall,
} from '@byway/contracts';
import { ledgerEntryConflict, ledgerEntryProblem, ledgerOperationId, spendFaultDetail } from '@byway/contracts';
import { roundUsd } from './prices.ts';

interface Row {
  id: string;
  workspaceId: string;
  runId?: string;
  stepId?: string;
  purpose: string;
  kind: string;
  provider: AdmitRequest['provider'];
  model: string;
  paid: boolean;
  reservedUsd: number;
  retainedUsd: number;
  state: PaidOperationState;
  uncertainReason?: 'interrupted' | 'failed';
  providerJobs?: Partial<Record<ProviderJobRole, string>>;
  owner?: string;
  leaseUntil: number;
  settleSeq?: number;
  settledAt?: string;
  settledUsd?: number;
  priceBasis?: string;
  entry?: SettledCall;
  ledgerEntryId?: string;
  ledgeredSeq?: number;
  clearedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Fault {
  id: number;
  offset: number;
  sha256: string;
  detail: string;
  createdAt: string;
  acknowledgedAt?: string;
}

const EPSILON = 1e-9;

const live = (r: Row, now: number) => r.leaseUntil > now;
const inFlight = (r: Row, now: number) => (r.state === 'open' || r.state === 'sent' || r.state === 'accepted') && live(r, now);
/** May have been billed and counts its reservation until cleared (the retained part is counted separately). */
const uncertain = (r: Row, now: number) => r.clearedAt === undefined && (r.state === 'uncertain' || ((r.state === 'sent' || r.state === 'accepted') && !live(r, now)));

export class MemorySpendBook implements SpendBook {
  private readonly rows = new Map<string, Row>();
  private readonly faultList: Fault[] = [];
  private position: LedgerCursor = { offset: 0, tailStart: 0, tailSha256: null };
  private settleSeq = 0;
  private readonly now: () => Date;

  constructor(opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  async admit(req: AdmitRequest): Promise<AdmitOutcome> {
    if (this.rows.has(req.opId)) throw new Error(`paid operation ${req.opId} already exists`);
    const now = this.ms();
    if (req.paid) {
      const fault = this.faultList.find((f) => f.acknowledgedAt === undefined);
      if (fault) return { fault: memoryFaultMessage(fault.offset) };
    }
    const at = this.stamp();
    for (const r of this.rows.values()) {
      if (live(r, now)) continue;
      if (r.state === 'open') Object.assign(r, { state: 'released', updatedAt: at });
      else if (r.state === 'sent' || r.state === 'accepted') Object.assign(r, { state: 'uncertain', uncertainReason: 'interrupted', updatedAt: at });
    }
    const ws = this.workspaceExposure(req.workspaceId, now);
    const wsTotal = ws.settled + ws.inFlight + ws.uncertain + req.reserveUsd;
    if (wsTotal > req.caps.workspaceUsd + EPSILON) return { budget: details('workspace', req.caps.workspaceUsd, ws.settled, ws.inFlight, req.reserveUsd, wsTotal, ws.uncertain) };
    if (req.runId !== undefined && req.caps.runUsd !== undefined) {
      let settled = 0;
      let flying = 0;
      for (const r of this.rows.values()) {
        if (r.runId !== req.runId) continue;
        if (r.state === 'settled') settled += r.settledUsd ?? 0;
        if (inFlight(r, now)) flying += r.reservedUsd;
      }
      settled = roundUsd(settled);
      flying = roundUsd(flying);
      const runTotal = settled + flying + req.reserveUsd;
      if (runTotal > req.caps.runUsd + EPSILON) return { budget: details('run', req.caps.runUsd, settled, flying, req.reserveUsd, runTotal) };
    }
    this.rows.set(req.opId, {
      id: req.opId,
      workspaceId: req.workspaceId,
      ...(req.runId !== undefined ? { runId: req.runId } : {}),
      ...(req.stepId !== undefined ? { stepId: req.stepId } : {}),
      purpose: req.purpose,
      kind: req.kind,
      provider: req.provider,
      model: req.model,
      paid: req.paid,
      reservedUsd: req.reserveUsd,
      retainedUsd: 0,
      state: 'open',
      owner: req.owner,
      leaseUntil: now + req.leaseMs,
      createdAt: at,
      updatedAt: at,
    });
    return { admitted: true };
  }

  async markSent(opId: string, owner: string): Promise<boolean> {
    const r = this.rows.get(opId);
    if (!r || r.owner !== owner || r.state !== 'open' || !live(r, this.ms())) return false;
    Object.assign(r, { state: 'sent', updatedAt: this.stamp() });
    return true;
  }

  async accept(opId: string, role: ProviderJobRole, providerJobId: string): Promise<void> {
    const r = this.rows.get(opId);
    if (!r) return;
    if (r.state === 'open' || r.state === 'sent') r.state = 'accepted';
    r.providerJobs = { ...r.providerJobs, [role]: providerJobId };
    r.updatedAt = this.stamp();
  }

  async retain(opId: string, usd: number, workspaceCapUsd: number): Promise<{ retained: true } | { budget: BudgetDetails }> {
    const r = this.mustGet(opId);
    const ws = this.workspaceExposure(r.workspaceId, this.ms());
    const total = ws.settled + ws.inFlight + ws.uncertain + usd;
    if (total > workspaceCapUsd + EPSILON) return { budget: details('workspace', workspaceCapUsd, ws.settled, ws.inFlight, usd, total, ws.uncertain) };
    r.retainedUsd += usd;
    r.updatedAt = this.stamp();
    return { retained: true };
  }

  async release(opId: string): Promise<void> {
    const r = this.rows.get(opId);
    if (r && r.state !== 'settled') Object.assign(r, { state: 'released', updatedAt: this.stamp() });
  }

  async abandon(opId: string): Promise<void> {
    const r = this.rows.get(opId);
    if (r && (r.state === 'open' || r.state === 'sent' || r.state === 'accepted')) Object.assign(r, { state: 'uncertain', uncertainReason: 'failed', updatedAt: this.stamp() });
  }

  async settle(opId: string, settlement: Settlement): Promise<{ ledgerEntryId: string }> {
    const r = this.mustGet(opId);
    if (r.state === 'settled') return { ledgerEntryId: r.ledgerEntryId as string };
    const ledgerEntryId = randomUUID();
    Object.assign(r, {
      state: 'settled',
      settledUsd: settlement.entry.costUsd,
      settledAt: settlement.at,
      settleSeq: ++this.settleSeq,
      entry: structuredClone(settlement.entry),
      ledgerEntryId,
      updatedAt: this.stamp(),
      ...(settlement.entry.priceBasis !== undefined ? { priceBasis: settlement.entry.priceBasis } : {}),
    });
    return { ledgerEntryId };
  }

  async renew(opIds: readonly string[], owner: string, leaseMs: number): Promise<void> {
    const until = this.ms() + leaseMs;
    for (const id of opIds) {
      const r = this.rows.get(id);
      if (r && r.owner === owner && (r.state === 'open' || r.state === 'sent' || r.state === 'accepted')) r.leaseUntil = until;
    }
  }

  async endLeases(owner: string): Promise<void> {
    const at = this.stamp();
    for (const r of this.rows.values()) {
      if (r.owner !== owner) continue;
      if (r.state === 'open') Object.assign(r, { state: 'released', updatedAt: at });
      else if (r.state === 'sent' || r.state === 'accepted') Object.assign(r, { state: 'uncertain', uncertainReason: 'interrupted', updatedAt: at });
    }
  }

  async cursor(): Promise<LedgerCursor> {
    return { ...this.position };
  }

  async absorb(batch: LedgerBatch): Promise<{ faults: number }> {
    const at = this.stamp();
    // As the store's book: a line it cannot record is a fault at that line, never an error.
    const refused: { line: LedgerLine; problem?: string }[] = batch.unreadable.map((u) => ({ line: u, ...(u.problem !== undefined ? { problem: u.problem } : {}) }));
    for (const line of batch.entries) {
      const problem = ledgerEntryProblem(line.entry) ?? this.absorbEntry(line.entry, at);
      if (problem !== undefined) refused.push({ line, problem });
    }
    let faults = 0;
    for (const { line, problem } of refused.sort((x, y) => x.line.offset - y.line.offset)) {
      if (this.faultList.some((f) => f.offset === line.offset && f.sha256 === line.sha256)) continue;
      this.faultList.push({ id: this.faultList.length + 1, offset: line.offset, sha256: line.sha256, detail: spendFaultDetail(line, problem), createdAt: at });
      faults += 1;
    }
    this.position = { ...batch.cursor };
    return { faults };
  }

  async unledgered(limit: number): Promise<UnledgeredCall[]> {
    return [...this.rows.values()]
      .filter((r) => r.state === 'settled' && r.ledgeredSeq === undefined && r.entry !== undefined)
      .sort((x, y) => (x.settleSeq ?? 0) - (y.settleSeq ?? 0))
      .slice(0, limit)
      .map((r) => ({ opId: r.id, entryId: r.ledgerEntryId as string, at: r.settledAt as string, entry: structuredClone(r.entry as SettledCall) }));
  }

  async markLedgered(opId: string, seq: number): Promise<void> {
    const r = this.rows.get(opId);
    if (r && r.ledgeredSeq === undefined) Object.assign(r, { ledgeredSeq: seq, updatedAt: this.stamp() });
  }

  async ledgeredCalls(): Promise<LedgeredCall[]> {
    return [...this.rows.values()]
      .filter((r) => r.ledgeredSeq !== undefined)
      .map((r) => ({ opId: r.id, entryId: r.ledgerEntryId as string, workspaceId: r.workspaceId, ...(r.runId !== undefined ? { runId: r.runId } : {}), costUsd: r.settledUsd ?? 0 }));
  }

  async spend(workspaceId: string): Promise<BookSpend> {
    const ws = this.workspaceExposure(workspaceId, this.ms());
    const byRun: Record<string, number> = {};
    const assumed = { calls: 0, usd: 0 };
    for (const r of this.rows.values()) {
      if (r.workspaceId !== workspaceId || r.state !== 'settled') continue;
      if (r.runId !== undefined) byRun[r.runId] = (byRun[r.runId] ?? 0) + (r.settledUsd ?? 0);
      if (r.priceBasis === 'assumed') {
        assumed.calls += 1;
        assumed.usd += r.settledUsd ?? 0;
      }
    }
    for (const run of Object.keys(byRun)) byRun[run] = roundUsd(byRun[run] as number);
    return {
      spentUsd: ws.settled,
      byRun: Object.fromEntries(Object.entries(byRun).sort(([a], [b]) => a.localeCompare(b))),
      inFlightUsd: ws.inFlight,
      uncertainUsd: ws.uncertain,
      ...(assumed.calls > 0 ? { assumedPricing: { calls: assumed.calls, usd: roundUsd(assumed.usd) } } : {}),
    };
  }

  async records(workspaceId: string): Promise<BookRecords> {
    const now = this.ms();
    const mine = [...this.rows.values()].filter((r) => r.workspaceId === workspaceId);
    const summary = (r: Row) => ({ opId: r.id, ...(r.runId !== undefined ? { runId: r.runId } : {}), purpose: r.purpose, provider: r.provider, model: r.model });
    const flying = mine.filter((r) => inFlight(r, now)).map((r) => ({ ...summary(r), usd: roundUsd(r.reservedUsd), since: r.createdAt }));
    const unsure: UncertainCall[] = mine
      .filter((r) => r.clearedAt === undefined && (uncertain(r, now) || r.retainedUsd > 0))
      .sort((x, y) => x.updatedAt.localeCompare(y.updatedAt))
      .map((r) => {
        const counted = uncertain(r, now);
        const reason: UncertainCall['reason'] = !counted ? 'resent' : r.state === 'uncertain' && r.uncertainReason === 'failed' ? 'failed' : 'interrupted';
        return {
          ...summary(r),
          usd: roundUsd((counted ? r.reservedUsd : 0) + r.retainedUsd),
          since: r.updatedAt,
          reason,
          ...(r.providerJobs && Object.keys(r.providerJobs).length > 0 ? { providerJobs: { ...r.providerJobs } } : {}),
        };
      });
    const open = this.faultList.filter((f) => f.acknowledgedAt === undefined).map((f) => ({ id: f.id, detail: f.detail, createdAt: f.createdAt }));
    const notInAuditFile = [...this.rows.values()].filter((r) => r.state === 'settled' && r.ledgeredSeq === undefined).length;
    return { inFlight: flying, uncertain: unsure, faults: open, notInAuditFile };
  }

  async clearUncertain(workspaceId: string, opIds: readonly string[]): Promise<number> {
    const now = this.ms();
    const at = this.stamp();
    let cleared = 0;
    for (const id of new Set(opIds)) {
      const r = this.rows.get(id);
      if (!r || r.workspaceId !== workspaceId || r.clearedAt !== undefined) continue;
      if (!uncertain(r, now) && r.retainedUsd <= 0) continue;
      Object.assign(r, { clearedAt: at, updatedAt: at });
      cleared += 1;
    }
    return cleared;
  }

  async acknowledgeFault(id: number): Promise<boolean> {
    const f = this.faultList.find((x) => x.id === id && x.acknowledgedAt === undefined);
    if (!f) return false;
    f.acknowledgedAt = this.stamp();
    return true;
  }

  async faults(): Promise<RecordedFault[]> {
    return this.faultList.map((f) => ({ id: f.id, offset: f.offset, sha256: f.sha256, detail: f.detail, createdAt: f.createdAt, acknowledged: f.acknowledgedAt !== undefined }));
  }

  /** One entry into the book, as the store's book records it; returns why it conflicts with what the book holds, changing nothing. */
  private absorbEntry(e: LedgerEntry, at: string): string | undefined {
    const id = ledgerOperationId(e);
    const row = this.rows.get(id);
    const owner = [...this.rows.values()].find((r) => r.ledgerEntryId === e.id);
    const conflict = ledgerEntryConflict(e, row && heldCall(row), owner && heldCall(owner));
    if (conflict !== undefined) return conflict;
    if (row) {
      if (row.state !== 'settled') {
        Object.assign(row, { state: 'settled', settledUsd: e.costUsd, settledAt: e.at, settleSeq: ++this.settleSeq, ledgerEntryId: e.id, ledgeredSeq: e.seq, updatedAt: at });
        if (e.priceBasis !== undefined) row.priceBasis = e.priceBasis;
      } else if (row.ledgeredSeq === undefined) {
        Object.assign(row, { ledgeredSeq: e.seq, updatedAt: at });
      }
      return undefined;
    }
    this.rows.set(id, {
      id,
      workspaceId: e.workspaceId,
      ...(e.runId !== undefined ? { runId: e.runId } : {}),
      ...(e.stepId !== undefined ? { stepId: e.stepId } : {}),
      purpose: e.purpose,
      kind: e.kind,
      provider: e.provider,
      model: e.requestedModel,
      paid: e.costUsd > 0,
      reservedUsd: 0,
      retainedUsd: 0,
      state: 'settled',
      leaseUntil: 0,
      settleSeq: ++this.settleSeq,
      settledAt: e.at,
      settledUsd: e.costUsd,
      ...(e.priceBasis !== undefined ? { priceBasis: e.priceBasis } : {}),
      ledgerEntryId: e.id,
      ledgeredSeq: e.seq,
      createdAt: at,
      updatedAt: at,
    });
    return undefined;
  }

  private workspaceExposure(workspaceId: string, now: number): { settled: number; inFlight: number; uncertain: number } {
    let settled = 0;
    let flying = 0;
    let unsure = 0;
    for (const r of this.rows.values()) {
      if (r.workspaceId !== workspaceId) continue;
      if (r.state === 'settled') settled += r.settledUsd ?? 0;
      if (inFlight(r, now)) flying += r.reservedUsd;
      if (uncertain(r, now)) unsure += r.reservedUsd;
      if (r.clearedAt === undefined) unsure += r.retainedUsd;
    }
    return { settled: roundUsd(settled), inFlight: roundUsd(flying), uncertain: roundUsd(unsure) };
  }

  private mustGet(opId: string): Row {
    const r = this.rows.get(opId);
    if (!r) throw new Error(`no paid operation ${JSON.stringify(opId)}`);
    return r;
  }

  private ms(): number {
    return this.now().getTime();
  }

  private stamp(): string {
    return this.now().toISOString();
  }
}

/** A row as ledgerEntryConflict compares it with a ledger line. */
function heldCall(r: Row): HeldCall {
  return {
    opId: r.id,
    ...(r.ledgerEntryId !== undefined ? { entryId: r.ledgerEntryId } : {}),
    workspaceId: r.workspaceId,
    ...(r.runId !== undefined ? { runId: r.runId } : {}),
    ...(r.settledUsd !== undefined ? { costUsd: r.settledUsd } : {}),
    ...(r.priceBasis !== undefined ? { priceBasis: r.priceBasis } : {}),
  };
}

/** The same words as the store's book (faultMessage in @byway/store), which this package cannot import. */
function memoryFaultMessage(offset: number): string {
  return `byway found a line in its spend ledger (ledger.jsonl, at byte ${offset}) that it cannot read, so it cannot be sure what has been spent. Paid calls wait until you look at it in Settings and acknowledge it.`;
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

/** A fresh in-memory book: one per gateway in a test, unless the test shares one between gateways on purpose. */
export function memorySpendBook(opts: { now?: () => Date } = {}): MemorySpendBook {
  return new MemorySpendBook(opts);
}
