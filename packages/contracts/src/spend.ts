/**
 * The spend book (contracts v6, ADR-0095): the durable record of every paid call, from admission to settlement, shared
 * by every process on one data directory. It is the authority the spend caps are checked against; `ledger.jsonl` stays
 * the hash-chained audit record of settled calls, filled from the book through an idempotent outbox.
 *
 * Why a book: the gateway used to reserve a call's estimate in one process's memory and read settled spend back from the
 * JSONL ledger, leniently. Another process's call in flight, a call whose caller died after sending it, and a billed
 * call whose ledger line was never written or was torn were all invisible to the caps (review finding F03). Every
 * method here is one short write transaction in the store (implemented by @byway/store over byway.sqlite; @byway/gateway
 * has an in-memory one for tests), and none spans a network call.
 *
 * A paid operation moves through these states:
 * - open: admitted and counted at its reservation, not yet sent to the provider;
 * - sent: the request may have reached the provider;
 * - accepted: a queue provider (fal) accepted a job and gave its id;
 * - settled: the provider answered and its true cost is recorded;
 * - released: definitely not billed (never sent, or every attempt failed before the provider did any paid work);
 * - uncertain: may have been billed and its cost is not known (an attempt failed after the request may have been
 *   written, or its caller stopped or died while waiting).
 *
 * Exposure (what the caps count). A row is live while its lease has not run out; its caller renews the lease while
 * the call is in progress, and gives it up at once when it stops cleanly (endLeases). A caller that crashes cannot: its
 * rows stay live until their leases run out.
 * - Run cap: the run's settled cost, plus the reservation of its live open, sent and accepted rows.
 * - Workspace cap: all settled cost, plus the reservation of live open, sent and accepted rows, plus the reservation of
 *   uncertain rows (state uncertain, or sent or accepted and no longer live) and every retained amount, until the person
 *   clears them in Settings. An open row that is no longer live counts nothing: it was never sent.
 * - Amounts that may have been billed are deliberately not charged to run caps: a clean stop and restart must not raise a
 *   budget question, and the workspace cap still counts them. After a crash, the dead caller's live rows count against
 *   the run cap as in flight until their leases run out.
 */
import type { BudgetDetails, LedgerEntry, ProviderId } from './gateway.ts';

export type PaidOperationState = 'open' | 'sent' | 'accepted' | 'settled' | 'released' | 'uncertain';

/** A fal relay link submits two queue jobs: the clip, then its last frame. */
export type ProviderJobRole = 'generation' | 'extract';

export interface AdmitRequest {
  /** A fresh id the caller chose for this operation. */
  opId: string;
  /** The process-and-gateway that holds the operation; only it may mark it sent or renew its lease. */
  owner: string;
  /** How long the operation stays live without a renewal. */
  leaseMs: number;
  workspaceId: string;
  runId?: string;
  stepId?: string;
  purpose: string;
  kind: LedgerEntry['kind'];
  provider: ProviderId;
  model: string;
  /** The call's planning estimate (estimate.ts): what it counts while in flight, and while uncertain. */
  reserveUsd: number;
  /** False for a call that costs nothing (the demo's mock): an accounting fault does not block it. */
  paid: boolean;
  caps: { workspaceUsd: number; runUsd?: number };
}

export type AdmitOutcome =
  | { admitted: true }
  /** A cap would be broken: the details the runner turns into "Raise the budget by $X?". */
  | { budget: BudgetDetails }
  /** An unacknowledged accounting fault blocks paid calls (the message says what and where). */
  | { fault: string };

/** A settled call as the audit file will record it: a ledger entry without what the ledger assigns. */
export type SettledCall = Omit<LedgerEntry, 'id' | 'seq' | 'at' | 'prevHash' | 'hash' | 'operationId'>;

export interface Settlement {
  /** When the call settled, the ledger entry's `at`. */
  at: string;
  entry: SettledCall;
}

/**
 * How far the book has read `ledger.jsonl`. The line that ends at `offset` starts at `tailStart` and hashes to
 * `tailSha256`: when it no longer does (the file was replaced), the next read starts again from the beginning, which
 * is safe because absorbing is idempotent.
 */
export interface LedgerCursor {
  offset: number;
  tailStart: number;
  tailSha256: string | null;
}

/** A complete line of the audit file that is not an entry: recorded once, by its byte offset and its hash. */
export interface UnreadableLine {
  offset: number;
  sha256: string;
  /** The line's start, for the person to recognise it. */
  excerpt: string;
}

/** What one read of the audit file found after the cursor. */
export interface LedgerBatch {
  entries: LedgerEntry[];
  unreadable: UnreadableLine[];
  cursor: LedgerCursor;
}

/** A settled call the outbox has not yet written to the audit file. */
export interface UnledgeredCall {
  opId: string;
  /** The id its ledger entry will have (chosen at settlement, and already returned to the caller). */
  entryId: string;
  at: string;
  entry: SettledCall;
}

/** A call the book holds as written to the audit file, for the cross-check against it. */
export interface LedgeredCall {
  opId: string;
  entryId: string;
  workspaceId: string;
  runId?: string;
  costUsd: number;
}

export interface BookSpend {
  /** Settled cost only, as the audit file records it. */
  spentUsd: number;
  /** Settled cost by run. */
  byRun: Record<string, number>;
  /** Reservations of calls under way now. */
  inFlightUsd: number;
  /** Calls that may have been billed and whose cost is not known, until cleared: counted against the workspace cap only. */
  uncertainUsd: number;
  /** Settled calls priced on an assumed basis (LedgerEntry.priceBasis): how many, and what they were counted at. */
  assumedPricing?: { calls: number; usd: number };
}

export interface PaidCallSummary {
  opId: string;
  runId?: string;
  purpose: string;
  provider: ProviderId;
  model: string;
  usd: number;
  /** When it was admitted (in flight) or last changed (may have been billed). */
  since: string;
}

/** A call that may have been billed, as Settings lists it with a Clear action. */
export interface UncertainCall extends PaidCallSummary {
  /**
   * `interrupted`: its caller stopped or died while waiting for the provider. `failed`: an attempt failed after the
   * request may have reached the provider. `resent`: an earlier attempt failed that way, and the call was sent again.
   */
  reason: 'interrupted' | 'failed' | 'resent';
  /** Queue jobs the provider accepted (fal request ids by role), to look up in the provider's dashboard. */
  providerJobs?: Partial<Record<ProviderJobRole, string>>;
}

/** Something in the audit file the book could not read: paid calls stop until the person acknowledges it. */
export interface SpendFault {
  id: number;
  /** What was found and where, in words. */
  detail: string;
  createdAt: string;
}

export interface BookRecords {
  inFlight: PaidCallSummary[];
  uncertain: UncertainCall[];
  /** Unacknowledged faults (they are not per workspace: one audit file serves them all). */
  faults: SpendFault[];
  /** Settled calls not yet written to the audit file (the outbox writes them shortly). */
  notInAuditFile: number;
}

/** What Settings shows of the spend book: its records, and torn ledger tails set aside after a crash. */
export interface SpendRecords extends BookRecords {
  /** `ledger.jsonl.damaged-*` files beside the ledger, by name: kept for inspection, never read, never blocking. */
  setAside: string[];
}

/** The audit file checked against itself and against the book (Settings' "Check the spend ledger", the start-up report). */
export interface LedgerAudit {
  /** The hash chain (Gateway.verifyLedger): the first broken entry, `line:<n>`, `head`, or null when intact. */
  brokenAt: string | null;
  /**
   * Calls the book holds as written to the audit file whose entry is not there, or carries another cost: a restore of
   * an older or missing ledger.jsonl, or an OS crash that lost a line after it was marked written. The caps count them.
   */
  missing: LedgeredCall[];
  /** Settled calls not yet written to the audit file. */
  pending: number;
  setAside: string[];
}

export interface SpendBook {
  /**
   * In one transaction: refuse a paid call while an unacknowledged fault exists; sweep (an open row no longer live is
   * released, a sent or accepted one becomes uncertain); check both caps against exposure plus the reservation; insert
   * the row as open, with its owner and lease.
   */
  admit(req: AdmitRequest): Promise<AdmitOutcome>;
  /** Compare-and-set from open to sent, for the live row this owner holds. False when it was swept meanwhile. */
  markSent(opId: string, owner: string): Promise<boolean>;
  /** Records a queue job the provider accepted (sent or open becomes accepted). */
  accept(opId: string, role: ProviderJobRole, providerJobId: string): Promise<void>;
  /**
   * Before a call is sent again after an attempt that may have been billed: counts that attempt's bound against the
   * workspace cap (only), if it fits.
   */
  retain(opId: string, usd: number, workspaceCapUsd: number): Promise<{ retained: true } | { budget: BudgetDetails }>;
  /** Definitely not billed: the row counts nothing (beyond what was retained). */
  release(opId: string): Promise<void>;
  /** May have been billed: the row counts its reservation against the workspace until cleared. */
  abandon(opId: string): Promise<void>;
  /** The provider answered: records the true cost from any state but settled; idempotent, returning the entry id chosen. */
  settle(opId: string, settlement: Settlement): Promise<{ ledgerEntryId: string }>;
  /** Extends the lease of this owner's unsettled operations. */
  renew(opIds: readonly string[], owner: string, leaseMs: number): Promise<void>;
  /**
   * This owner is stopping cleanly (its gateway is closing), so its operations are given up at once rather than when
   * their leases run out: in one transaction its open rows are released (never sent, they count nothing) and its sent
   * and accepted rows become uncertain, as interrupted (they may have been billed, and count against the workspace cap
   * only until cleared). Other owners' rows and settled rows are untouched; a later settlement still records the true
   * cost. Idempotent. An owner that crashes never gets here: its rows wait for their leases to run out.
   */
  endLeases(owner: string): Promise<void>;
  cursor(): Promise<LedgerCursor>;
  /**
   * Reconciles audit-file lines into the book, idempotently: an entry with an operationId marks its row written (and
   * settles it from the entry when it is not settled yet; a missing row is inserted); a legacy entry is inserted once,
   * keyed by its entry id; a line that is not an entry becomes a fault, once per offset. Then the cursor advances.
   */
  absorb(batch: LedgerBatch): Promise<{ faults: number }>;
  /** Settled calls not yet in the audit file, oldest first. */
  unledgered(limit: number): Promise<UnledgeredCall[]>;
  markLedgered(opId: string, seq: number): Promise<void>;
  /** Every call the book holds as written to the audit file. */
  ledgeredCalls(): Promise<LedgeredCall[]>;
  spend(workspaceId: string): Promise<BookSpend>;
  records(workspaceId: string): Promise<BookRecords>;
  /** Stops counting calls that may have been billed (the person checked them); returns how many were cleared. */
  clearUncertain(workspaceId: string, opIds: readonly string[]): Promise<number>;
  acknowledgeFault(id: number): Promise<boolean>;
}
