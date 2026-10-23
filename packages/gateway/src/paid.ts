/**
 * The gateway's side of the spend book (ADR-0095): admission, the life of one paid call, lease renewal, reading the
 * audit file into the book (absorb) and writing settled calls out to it (the outbox drain).
 *
 * Per call: absorb new ledger lines, then admit (the book refuses a call that would break a cap, or any paid call while
 * an accounting fault is open); mark the call sent just before its first provider request; after an attempt that may
 * have been billed, retain that attempt's bound against the workspace before sending again; settle the true cost when
 * the provider answers, or release (certainly not billed) or abandon (may have been) when it does not. While the call is
 * in progress its lease is renewed every 15 s for 60 s. A gateway that closes cleanly gives its calls in progress up at
 * once; a process that dies leaves rows that expire with their leases. Either way never-sent ones count nothing, and
 * sent ones count their estimate against the workspace only, as "may have been billed".
 *
 * A step's call carries an operation key and its caller's two signals (SpendContext.operation; stage 3, ADR-0099).
 * Admission resolves the key in the book: another attempt still holding it gets 'in-flight' (the runner waits for its
 * result), and a key whose holder is gone is taken over, its accepted queue jobs resumed. Such a call is held, that is
 * renewed, while it is unsettled and its caller neither ended nor was cancelled (Temporal's cancel, a timeout included,
 * stops the renewal, so another attempt takes the call over within one lease), and once settled until its invocation
 * ends, cancel or not (the result is still being kept); then it is let go at once. A call without a key is held while
 * it runs, as before.
 *
 * The audit file: one idempotent step, absorb, reconciles every ledger line into the book (entries from before the book,
 * entries an older worker appended, entries the outbox wrote whose mark a crash lost). The outbox drain runs under the
 * ledger's lock: it absorbs what is new, then appends each settled call the book has not marked written, with the entry
 * id chosen at settlement, and marks it. So a crash between an append and its mark, two drainers, or a read before the
 * next drain never writes an entry twice. On the call path the drain waits at most two seconds for the lock; what it
 * could not write, the timer writes later. A drain that fails never fails the call: the book already counts it.
 */
import { randomUUID } from 'node:crypto';
import { GatewayError, type AdmitRequest, type BudgetDetails, type LedgerCursor, type LedgerBatch, type ProviderJobRole, type Settlement, type SpendBook, type WaitedFor } from '@byway/contracts';
import { billingOf, isCutOff, type Billing } from './errors.ts';
import type { Ledger } from './ledger.ts';
import { waitedOf } from './waited.ts';

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

/** A keyed call's caller, as SpendContext.operation gives it: its invocation's end, and Temporal's cancel of it. */
export interface CallerSignals {
  until: AbortSignal;
  cancel?: AbortSignal;
}

/** Queue jobs a resumed call's provider already accepted, by role. */
export type ResumedJobs = Partial<Record<ProviderJobRole, string>>;

/** One operation this gateway holds in the book. */
interface Held {
  /** A keyed call's caller; absent for a call without a key, which is held while it runs. */
  caller?: CallerSignals;
  /** The call has ended (settled, released or abandoned); a settled keyed one stays held until its caller ends. */
  ended: boolean;
}

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

/**
 * Another attempt of the same call holds its key (stage 3): nothing was sent. The runner's memo layer waits for that
 * attempt's result; retryable, so a caller without one tries again later.
 */
const inFlight = () =>
  new GatewayError('in-flight', 'Another attempt of this call is still under way, so byway did not make it again: this attempt waits for that one’s result.', true, { billed: false });

/**
 * An earlier attempt settled this call and has ended (stage 3): nothing was sent. Its result may have been kept, so the
 * caller looks for it, and asks again with operation.rebuy only if it is not there.
 */
const settledEarlier = () =>
  new GatewayError('in-flight', 'An earlier attempt of this call already made it, so byway did not make it again: this attempt looks for that one’s result first.', true, {
    billed: false,
    settledEarlier: true,
  });

/**
 * The refusal a closed gateway gives a paid call: retryable, so a step is tried again once byway has started again. It
 * is byway's own refusal, and nothing was sent or billed (ADR-0099).
 */
const stopping = () => new GatewayError('byway-failure', 'byway is stopping, so it did not start this call. Try again once it has started again.', true, { billed: false });

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
  private readonly held = new Map<string, Held>();
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

  /**
   * Admits one paid call (absorbing first), or throws 'budget-exceeded', 'accounting-fault' or, for a keyed call another
   * attempt still holds, 'in-flight'. A keyed call whose holder is gone may come back resumed (PaidCall.resumed).
   */
  async admit(req: PaidCallRequest, caps: () => Promise<AdmitRequest['caps']>, caller?: CallerSignals): Promise<PaidCall> {
    await this.absorb();
    const admitted = await this.admitOnce(req, await caps(), caller);
    return new PaidCall(this, admitted, req, caps, caller);
  }

  /** @internal Admission itself, also used for the one re-admission of a call swept while its process slept. */
  async admitOnce(req: PaidCallRequest, caps: AdmitRequest['caps'], caller?: CallerSignals): Promise<{ opId: string; resumed?: ResumedJobs }> {
    // Nothing would renew its lease or hand it back: a closed gateway starts no paid call.
    if (this.closed) throw stopping();
    const fresh = randomUUID();
    const outcome = await this.book.admit({ ...req, opId: fresh, owner: this.owner, leaseMs: this.leaseMs, caps });
    if ('budget' in outcome) throw budgetError(outcome.budget);
    if ('fault' in outcome) throw new GatewayError('accounting-fault', outcome.fault);
    if ('inFlight' in outcome) throw inFlight();
    if ('settledEarlier' in outcome) throw settledEarlier();
    const resumed = 'resume' in outcome ? outcome.resume : undefined;
    const opId = resumed?.opId ?? fresh;
    if (this.closed) {
      // close() ran while the book was admitting the call, and its endLeases may have come before the row existed: the
      // row is handed back here (a new one was never sent, so it counts nothing; a resumed one is interrupted again), and
      // the call is refused as for a closed gateway.
      await (resumed ? this.book.endLeases(this.owner) : this.book.release(opId)).catch((e: unknown) => {
        this.warn(`byway could not hand back a call it did not start as it stopped (${(e as Error)?.message ?? String(e)}); it counts as under way until its lease runs out.`);
      });
      throw stopping();
    }
    this.held.set(opId, { ...(caller ? { caller } : {}), ended: false });
    // The invocation ended: a settled call it was keeping is let go now, not when its lease runs out.
    caller?.until.addEventListener('abort', () => this.callerEnded(opId), { once: true });
    return { opId, ...(resumed ? { resumed: resumed.jobs } : {}) };
  }

  /**
   * @internal A call is over. A settled keyed call stays held until its caller's invocation ends (its result is being
   * kept); anything else is held no longer. A settled keyed call whose caller has already ended is let go at once.
   */
  ended(opId: string, settled: boolean): void {
    const held = this.held.get(opId);
    if (!held) return;
    if (settled && held.caller) {
      if (!held.caller.until.aborted) {
        held.ended = true;
        return;
      }
      void this.release([opId]);
    }
    this.held.delete(opId);
  }

  /** @internal A re-admitted call stops holding the row it replaced (the book swept it). */
  forget(opId: string): void {
    this.held.delete(opId);
  }

  /** A keyed call's invocation ended: if the call is over, let it go now (else end() does, when it is). */
  private callerEnded(opId: string): void {
    const held = this.held.get(opId);
    if (!held?.ended) return;
    this.held.delete(opId);
    void this.release([opId]);
  }

  /** Ends the book's hold on these operations now (SpendBook.letGo). A failure is reported: their leases run out instead. */
  private async release(opIds: string[]): Promise<void> {
    try {
      await this.book.letGo(opIds, this.owner);
    } catch (e) {
      this.warn(`byway could not let go of a finished call in its spending records (${(e as Error)?.message ?? String(e)}); a later attempt of it waits until its lease runs out.`);
    }
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
      const renew: string[] = [];
      for (const [opId, held] of this.held) {
        // A cancelled caller's unsettled call is not renewed: another attempt takes it over once its lease runs out.
        if (!held.ended && held.caller?.cancel?.aborted) continue;
        // A caller that has ended keeps nothing held (callerEnded lets it go).
        if (held.caller?.until.aborted) continue;
        renew.push(opId);
      }
      if (renew.length > 0) await this.book.renew(renew, this.owner, this.leaseMs);
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

  /**
   * A clean stop: stops the timer, gives up this gateway's calls still in progress at once (endLeases: a call it had
   * sent counts as "may have been billed", against the workspace only; one it had not sent counts nothing), then makes
   * one last bounded drain. So a step retried on a restarted worker straight away finds its run's budget as it was
   * before the stopped call. Calls admitted afterwards are refused. Idempotent; never throws. Call before the store
   * closes: a process that dies without it leaves its calls to run out their leases (up to `leaseMs`).
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.held.clear();
    try {
      await this.book.endLeases(this.owner);
    } catch (e) {
      this.warn(`byway could not hand back its calls in progress in the spend book as it stopped (${(e as Error)?.message ?? String(e)}); they count as under way until their leases run out.`);
    }
    await this.drain().catch(() => undefined);
  }
}

/** One paid call's life in the book. The gateway calls these in order; end() is safe to call more than once. */
export class PaidCall {
  private opId: string;
  /** Queue jobs the provider already accepted, when this call resumes one its earlier attempt made (stage 3). */
  private resumedJobs: ResumedJobs | undefined;
  private sent = false;
  private answered = false;
  private settled = false;
  private ended = false;
  /** The billing of the last failed attempt: decides release or abandon if the call ends without an answer. */
  private lastFailure: Billing | undefined;
  /** The last failed attempt was cut off by its caller's stop (ADR-0111): an abandoned call is recorded as interrupted. */
  private cutOff = false;
  /** The last failed attempt used the whole of its model's wait (waited.ts): an abandoned call is recorded as waited. */
  private waited: WaitedFor | undefined;
  /** What the book retained for sends that may have been billed before this call was sent again (retain). */
  private retained = 0;
  private readonly calls: PaidCalls;
  private readonly req: PaidCallRequest;
  private readonly caps: () => Promise<AdmitRequest['caps']>;
  private readonly caller: CallerSignals | undefined;

  constructor(calls: PaidCalls, admitted: { opId: string; resumed?: ResumedJobs }, req: PaidCallRequest, caps: () => Promise<AdmitRequest['caps']>, caller?: CallerSignals) {
    this.calls = calls;
    this.opId = admitted.opId;
    this.resumedJobs = admitted.resumed;
    // A resumed call was sent (and accepted) by its earlier attempt.
    this.sent = admitted.resumed !== undefined;
    this.req = req;
    this.caps = caps;
    this.caller = caller;
  }

  get id(): string {
    return this.opId;
  }

  /** The provider's job ids when this call resumes one an earlier attempt made: poll them, never submit again. */
  get resumed(): ResumedJobs | undefined {
    return this.resumedJobs;
  }

  /** The call's planning estimate, as admitted: what it counts while in flight, and what it settles at when its reported figures cannot be believed. */
  get reserveUsd(): number {
    return this.req.reserveUsd;
  }

  /**
   * Just before a provider request goes out. The first time, the row moves from open to sent. If its lease ran out
   * meanwhile (the process slept) another process may have released it, so the call is admitted once more.
   */
  async markSent(): Promise<void> {
    if (this.sent) return;
    if (!(await this.calls.book.markSent(this.opId, this.calls.owner))) {
      this.calls.forget(this.opId);
      const again = await this.calls.admitOnce(this.req, await this.caps(), this.caller);
      this.opId = again.opId;
      if (again.resumed) {
        // Another attempt's accepted jobs, taken over meanwhile: polled, not sent again.
        this.resumedJobs = again.resumed;
        this.sent = true;
        return;
      }
      if (!(await this.calls.book.markSent(this.opId, this.calls.owner))) {
        throw new GatewayError('byway-failure', 'byway could not record this call as sent in its spending records, so it did not send it. Try again.', true, { billed: false });
      }
    }
    this.sent = true;
  }

  /**
   * A failed attempt: its billing decides what is counted if no attempt succeeds. One byway cut off (cutOffError) that
   * may have been billed is abandoned as interrupted, not as failed (ADR-0111): Settings says byway stopped waiting. One
   * that used the whole of its model's wait (waitedError) is abandoned as waited, with how long and how it waited.
   */
  failed(err: unknown): void {
    this.lastFailure = billingOf(err);
    this.cutOff = isCutOff(err);
    this.waited = waitedOf(err);
  }

  /** Before sending again after an attempt that may have been billed: count that attempt's bound against the workspace. */
  async retain(usd: number, workspaceCapUsd: number): Promise<void> {
    const out = await this.calls.book.retain(this.opId, usd, workspaceCapUsd);
    if ('budget' in out) throw budgetError(out.budget);
    this.retained = Math.round((this.retained + usd) * 1_000_000) / 1_000_000;
  }

  /**
   * What the book retained for this call before it was sent again, for each send that may have been billed (retain):
   * counted against the workspace as "may have been billed" until the person clears it in Settings, whatever became of
   * the call (ADR-0095).
   */
  get retainedUsd(): number {
    return this.retained;
  }

  /**
   * What the book counts for this call as "may have been billed" against the workspace, until the person clears it in
   * Settings (ADR-0095): what was retained for each send that may have been billed before the call was sent again, plus
   * its estimate once it has ended unsettled and may have been billed (an answer it could not record, or a last send that
   * may have reached the provider: end() abandons it). Read after end().
   */
  get uncertainUsd(): number {
    const abandoned = !this.settled && (this.answered || (this.sent && this.lastFailure !== 'none'));
    return Math.round(((abandoned ? this.req.reserveUsd : 0) + this.retained) * 1_000_000) / 1_000_000;
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
        // A keyed call stays held from its settlement while its caller keeps the result (stage 3, ADR-0099).
        const { ledgerEntryId } = await this.calls.book.settle(this.opId, this.caller ? { ...settlement, holdMs: this.calls.leaseMs } : settlement);
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
    this.calls.ended(this.opId, this.settled);
    try {
      if (this.settled) await this.calls.drain();
      else if (this.answered || (this.sent && this.lastFailure !== 'none')) {
        if (!this.answered && this.cutOff) await this.calls.book.abandon(this.opId, 'interrupted');
        else if (!this.answered && this.waited) await this.calls.book.abandon(this.opId, 'waited', this.waited);
        else await this.calls.book.abandon(this.opId, 'failed');
      }
      else await this.calls.book.release(this.opId);
    } catch {
      // Unsettled rows the book could not update run out their lease; a drain left undone is done by the timer.
    }
  }
}
