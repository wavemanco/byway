/**
 * The gateway's side of the spend book (ADR-0095): admission, the life of one paid call, lease renewal, reading the
 * audit file into the book (absorb) and writing settled calls out to it (the outbox drain).
 *
 * Per call: absorb new ledger lines, then admit (the book refuses a call that would break a cap, or any paid call while
 * an accounting fault is open); mark the call sent just before its first provider request; after an attempt that may
 * have been billed, retain that attempt's bound against the workspace before sending again; settle the true cost when
 * the provider answers, or release (certainly not billed) or abandon (may have been) when it does not. While the call is
 * in progress its lease is renewed every 15 s for 60 s, so a process that dies leaves rows that expire: never-sent ones
 * count nothing, sent ones count their estimate against the workspace as "may have been billed".
 *
 * The audit file: one idempotent step, absorb, reconciles every ledger line into the book (entries from before the book,
 * entries an older worker appended, entries the outbox wrote whose mark a crash lost). The outbox drain runs under the
 * ledger's lock: it absorbs what is new, then appends each settled call the book has not marked written, with the entry
 * id chosen at settlement, and marks it. So a crash between an append and its mark, two drainers, or a read before the
 * next drain never writes an entry twice. On the call path the drain waits at most two seconds for the lock; what it
 * could not write, the timer writes later. A drain that fails never fails the call: the book already counts it.
 */
import { randomUUID } from 'node:crypto';
import { GatewayError, type AdmitRequest, type BudgetDetails, type LedgerCursor, type LedgerBatch, type ProviderJobRole, type Settlement, type SpendBook } from '@byway/contracts';
import { billingOf, type Billing } from './errors.ts';
import type { Ledger } from './ledger.ts';

export interface PaidCallsOptions {
  book: SpendBook;
  ledger: Ledger;
  /** How long an operation stays live without renewal. Default 60 s. */
  leaseMs?: number;
  /** How often held operations are renewed and the outbox drained. Default 15 s. */
  renewEveryMs?: number;
  /** How long a drain on the call path waits for the ledger's lock. Default 2 s. */
  drainWaitMs?: number;
  /** Where background failures are reported (a renewal or a drain the timer will try again). Default console.warn. */
  warn?: (message: string) => void;
}

/** What admission needs besides what PaidCalls supplies (the id, the owner and the lease). */
export type PaidCallRequest = Omit<AdmitRequest, 'opId' | 'owner' | 'leaseMs' | 'caps'>;

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_RENEW_EVERY_MS = 15_000;
const DEFAULT_DRAIN_WAIT_MS = 2_000;
/** Entries written per hold of the ledger's lock: a stale-lock break (30 s) must never catch a drain still writing. */
const DRAIN_BATCH = 50;
/** Settlement is tried this many times, with pauses of 0.5, 1 and 2 s: a busy database is waited out, not lost. */
const SETTLE_ATTEMPTS = 4;
const SETTLE_DELAY_MS = 500;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The 'budget-exceeded' refusal, with the words people see and the details the runner turns into a question. */
export function budgetError(budget: BudgetDetails): GatewayError & { budget: BudgetDetails } {
  const usd = (n: number) => `$${n.toFixed(4)}`;
  const unsure = budget.uncertainUsd !== undefined && budget.uncertainUsd > 0 ? `, ${usd(budget.uncertainUsd)} that may have been billed (see Settings)` : '';
  const err = new GatewayError(
    'budget-exceeded',
    `the ${budget.scope} budget of $${budget.capUsd.toFixed(2)} would be exceeded: ${usd(budget.spentUsd)} spent, ${usd(budget.reservedUsd)} in flight${unsure}, and this call is estimated at ${usd(budget.estimateUsd)}`,
  );
  err.budget = budget;
  return err as GatewayError & { budget: BudgetDetails };
}

const changed = (batch: LedgerBatch, cursor: LedgerCursor) =>
  batch.entries.length > 0 || batch.unreadable.length > 0 || batch.cursor.offset !== cursor.offset || batch.cursor.tailSha256 !== cursor.tailSha256;

export class PaidCalls {
  readonly book: SpendBook;
  readonly owner = `${process.pid}:${randomUUID()}`;
  readonly leaseMs: number;
  readonly drainWaitMs: number;
  /** @internal Where background failures are reported. */
  readonly warn: (message: string) => void;
  private readonly ledger: Ledger;
  private readonly held = new Set<string>();
  private readonly timer: ReturnType<typeof setInterval>;
  private absorbing: Promise<void> | undefined;
  private running: Promise<void> | undefined;
  private waiting: Promise<void> | undefined;
  private closed = false;

  constructor(opts: PaidCallsOptions) {
    this.book = opts.book;
    this.ledger = opts.ledger;
    this.leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
    this.drainWaitMs = opts.drainWaitMs ?? DEFAULT_DRAIN_WAIT_MS;
    this.warn = opts.warn ?? ((m) => console.warn(m));
    this.timer = setInterval(() => void this.tick(), opts.renewEveryMs ?? DEFAULT_RENEW_EVERY_MS);
    this.timer.unref?.();
  }

  /**
   * Reads ledger lines the book has not seen into it. Concurrent calls in this process share one read: a line appended
   * meanwhile is read by the next one.
   */
  absorb(): Promise<void> {
    this.absorbing ??= (async () => {
      const cursor = await this.book.cursor();
      const batch = await this.ledger.readFrom(cursor);
      if (changed(batch, cursor)) await this.book.absorb(batch);
    })().finally(() => {
      this.absorbing = undefined;
    });
    return this.absorbing;
  }

  /** Admits one paid call (absorbing first), or throws 'budget-exceeded' or 'accounting-fault'. */
  async admit(req: PaidCallRequest, caps: () => Promise<AdmitRequest['caps']>): Promise<PaidCall> {
    await this.absorb();
    const opId = await this.admitOnce(req, await caps());
    return new PaidCall(this, opId, req, caps);
  }

  /** @internal Admission itself, also used for the one re-admission of a call swept while its process slept. */
  async admitOnce(req: PaidCallRequest, caps: AdmitRequest['caps']): Promise<string> {
    const opId = randomUUID();
    const outcome = await this.book.admit({ ...req, opId, owner: this.owner, leaseMs: this.leaseMs, caps });
    if ('budget' in outcome) throw budgetError(outcome.budget);
    if ('fault' in outcome) throw new GatewayError('accounting-fault', outcome.fault);
    this.held.add(opId);
    return opId;
  }

  /** @internal */
  letGo(opId: string): void {
    this.held.delete(opId);
  }

  /**
   * Writes settled calls the audit file does not have yet. In this process at most one drain runs and one waits to run:
   * a caller shares the waiting one, which has not read the outbox yet and so will write the caller's settled call too.
   * A caller therefore waits for at most two drains, each of which waits at most `waitMs` for the ledger's lock, however
   * many calls settle at once. Each holds the lock for at most DRAIN_BATCH entries.
   */
  drain(waitMs = this.drainWaitMs): Promise<void> {
    if (this.waiting) return this.waiting;
    const before = this.running ?? Promise.resolve();
    const next: Promise<void> = before
      .catch(() => undefined)
      .then(() => {
        this.waiting = undefined;
        this.running = next;
        return this.drainOnce(waitMs);
      })
      .finally(() => {
        if (this.running === next) this.running = undefined;
      });
    this.waiting = next;
    return next;
  }

  private async drainOnce(waitMs: number): Promise<void> {
    if ((await this.book.unledgered(1)).length === 0) return;
    // Catch up outside the lock first, so the read under it is short.
    await this.absorb();
    await this.ledger.exclusive(
      async (locked) => {
        const cursor = await this.book.cursor();
        const batch = await locked.readFrom(cursor);
        if (changed(batch, cursor)) await this.book.absorb(batch);
        for (const call of await this.book.unledgered(DRAIN_BATCH)) {
          const entry = await locked.append({ ...call.entry, operationId: call.opId }, { id: call.entryId, at: call.at });
          await this.book.markLedgered(call.opId, entry.seq);
        }
      },
      { lockTimeoutMs: waitMs },
    );
  }

  /** The timer: renew what this gateway holds, then write anything left in the outbox. Failures are reported, never thrown. */
  private async tick(): Promise<void> {
    if (this.closed) return;
    try {
      if (this.held.size > 0) await this.book.renew([...this.held], this.owner, this.leaseMs);
    } catch (e) {
      this.warn(`byway could not renew its calls in progress in the spend book (${(e as Error)?.message ?? String(e)}); it tries again in a moment.`);
    }
    if (this.closed) return;
    try {
      await this.drain();
    } catch (e) {
      this.warn(`byway could not write settled calls to ledger.jsonl yet (${(e as Error)?.message ?? String(e)}); they are counted, and it tries again in a moment.`);
    }
  }

  /** Stops the timer after one last bounded drain. Idempotent; never throws. Call before the store closes. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    await this.drain().catch(() => undefined);
  }
}

/** One paid call's life in the book. The gateway calls these in order; end() is safe to call more than once. */
export class PaidCall {
  private opId: string;
  private sent = false;
  private answered = false;
  private settled = false;
  private ended = false;
  /** The billing of the last failed attempt: decides release or abandon if the call ends without an answer. */
  private lastFailure: Billing | undefined;
  private readonly calls: PaidCalls;
  private readonly req: PaidCallRequest;
  private readonly caps: () => Promise<AdmitRequest['caps']>;

  constructor(calls: PaidCalls, opId: string, req: PaidCallRequest, caps: () => Promise<AdmitRequest['caps']>) {
    this.calls = calls;
    this.opId = opId;
    this.req = req;
    this.caps = caps;
  }

  get id(): string {
    return this.opId;
  }

  /**
   * Just before a provider request goes out. The first time, the row moves from open to sent. If its lease ran out
   * meanwhile (the process slept) another process may have released it, so the call is admitted once more.
   */
  async markSent(): Promise<void> {
    if (this.sent) return;
    if (!(await this.calls.book.markSent(this.opId, this.calls.owner))) {
      this.calls.letGo(this.opId);
      this.opId = await this.calls.admitOnce(this.req, await this.caps());
      if (!(await this.calls.book.markSent(this.opId, this.calls.owner))) {
        throw new GatewayError('provider-error', 'byway could not record this call as sent in its spending records, so it did not send it. Try again.', true);
      }
    }
    this.sent = true;
  }

  /** A failed attempt: its billing decides what is counted if no attempt succeeds. */
  failed(err: unknown): void {
    this.lastFailure = billingOf(err);
  }

  /** Before sending again after an attempt that may have been billed: count that attempt's bound against the workspace. */
  async retain(usd: number, workspaceCapUsd: number): Promise<void> {
    const out = await this.calls.book.retain(this.opId, usd, workspaceCapUsd);
    if ('budget' in out) throw budgetError(out.budget);
  }

  /** A queue job the provider accepted. A failure to record it is reported and the call goes on: it stays counted. */
  async accepted(role: ProviderJobRole, providerJobId: string): Promise<void> {
    try {
      await this.calls.book.accept(this.opId, role, providerJobId);
    } catch (e) {
      this.calls.warn(`byway could not record ${role} job ${providerJobId} in its spending records (${(e as Error)?.message ?? String(e)}); the call stays counted at its estimate.`);
    }
  }

  /**
   * The provider answered: record the true cost, trying a few times. If it still cannot be recorded, the row stays
   * counted at its estimate (as may have been billed, once its lease runs out) and the error is thrown.
   */
  async settle(settlement: Settlement): Promise<string> {
    this.answered = true;
    for (let n = 1; ; n++) {
      try {
        const { ledgerEntryId } = await this.calls.book.settle(this.opId, settlement);
        this.settled = true;
        return ledgerEntryId;
      } catch (e) {
        if (n >= SETTLE_ATTEMPTS) throw e;
        await pause(SETTLE_DELAY_MS * 2 ** (n - 1));
      }
    }
  }

  /**
   * The call is over. Unsettled: never sent or certainly not billed is released; may have been billed (an answer that
   * could not be recorded, or a last attempt that failed after its request may have arrived) is abandoned. Settled: the
   * outbox is drained, waiting briefly for the ledger's lock. Never throws.
   */
  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.calls.letGo(this.opId);
    try {
      if (this.settled) await this.calls.drain();
      else if (this.answered || (this.sent && this.lastFailure !== 'none')) await this.calls.book.abandon(this.opId);
      else await this.calls.book.release(this.opId);
    } catch {
      // Unsettled rows the book could not update run out their lease; a drain left undone is done by the timer.
    }
  }
}
