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

/** A fal relay link submits up to three queue jobs: the clip, its last frame, then a frame from its middle (F10 (a)). */
export const PROVIDER_JOB_ROLES = ['generation', 'extract', 'middle'] as const;
export type ProviderJobRole = (typeof PROVIDER_JOB_ROLES)[number];

export interface AdmitRequest {
  /** A fresh id the caller chose for this operation. */
  opId: string;
  /**
   * The call's identity across retries (stage 3, ADR-0099): for a step's call, its run and memo key, the same on every
   * Temporal attempt of the step. One live row holds a key at a time. Admitting a key a live row holds answers
   * `inFlight` (an earlier attempt is still under way, or still keeping its result); a key whose holder is gone is
   * taken over: an accepted call is resumed (`resume`), a settled one answers `settledEarlier` (its result may have
   * been kept: look before buying again), and anything else gives the key up to a new row. Absent for calls outside a
   * step (the advisor's).
   */
  operationKey?: string;
  /**
   * With an operation key: the caller was told `settledEarlier`, then looked for that call's kept result and found
   * none, so the settled call gives its key up and this one is bought again (and counted): its earlier attempt ended
   * without keeping what it bought (its process died first, or its memo could not be saved).
   */
  rebuy?: boolean;
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
  | { fault: string }
  /** A live row holds the operation key: another attempt of the same call is under way, or keeping its result. */
  | { inFlight: true }
  /**
   * The key's call was settled by an earlier attempt that has ended (or died): its result may have been kept (the
   * runner's memo), so the caller looks there first, and admits again with `rebuy` only if it is not there. A holder
   * keeps its result before it ends, so a look that follows this answer cannot miss a result that was kept.
   */
  | { settledEarlier: true }
  /**
   * The operation key's row had queue jobs the provider accepted, and its holder is gone (its lease ran out, or it
   * stopped and handed the call back): this caller now holds that row (`opId`, owner and lease) and polls the jobs by
   * their ids instead of submitting new ones. Nothing more is reserved: the row was already counted. `acceptedAt` is
   * when each job was accepted (SpendBook.accept), so a resumed fal clip keeps the clock its wait counts from; a job
   * accepted before the book kept the time has none, and its wait counts from the resume.
   */
  | { resume: { opId: string; jobs: Partial<Record<ProviderJobRole, string>>; acceptedAt?: Partial<Record<ProviderJobRole, string>> } };

/** A settled call as the audit file will record it: a ledger entry without what the ledger assigns. */
export type SettledCall = Omit<LedgerEntry, 'id' | 'seq' | 'at' | 'prevHash' | 'hash' | 'operationId'>;

export interface Settlement {
  /** When the call settled, the ledger entry's `at`. */
  at: string;
  entry: SettledCall;
  /**
   * For a call with an operation key: how long it stays held from settlement (its lease is extended to at least now
   * plus this), so its caller can keep the result before another attempt may take the key, even when the call settled
   * near the end of a lease its caller had stopped renewing (ADR-0099).
   */
  holdMs?: number;
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

/** Where a complete line of the audit file is: its byte offset and its hash, and its start for the person to recognise it. */
export interface LedgerLine {
  offset: number;
  sha256: string;
  /** The line's start, for the person to recognise it. */
  excerpt: string;
}

/** A complete line of the audit file that is not an entry: recorded once, by its byte offset and its hash. */
export interface UnreadableLine extends LedgerLine {
  /** Why it is not an entry the book can count, in words (ledgerEntryProblem), when the reader knows. */
  problem?: string;
}

/**
 * A line read as an entry, and where it is. The book checks it again (ledgerEntryProblem), compares it with what it holds
 * (ledgerEntryConflict) and records it in a step of its own: one it still cannot record becomes a fault at this line,
 * like an unreadable one, never an error that stops the rest of the batch (or demo calls, or Settings) from being read.
 */
export interface EntryLine extends LedgerLine {
  entry: LedgerEntry;
}

/** What one read of the audit file found after the cursor. */
export interface LedgerBatch {
  entries: EntryLine[];
  unreadable: UnreadableLine[];
  cursor: LedgerCursor;
}

const KINDS: Record<LedgerEntry['kind'], true> = { completion: true, image: true, video: true };
const PROVIDERS: Record<ProviderId, true> = { anthropic: true, openai: true, google: true, openrouter: true, fal: true, mock: true };
const PRICE_BASES: Record<NonNullable<LedgerEntry['priceBasis']>, true> = { assumed: true };
const own = <T extends object>(table: T, key: unknown): boolean => typeof key === 'string' && Object.hasOwn(table, key);

/**
 * byway's ceiling on what one call can cost, in USD (ADR-0095 decisions 6 and 7). A ledger line that records more is
 * not an entry the book can count (ledgerEntryProblem), and the gateway never writes one: it refuses a call whose
 * planning estimate is above it, and settles a call whose reported figures would price it above it at its estimate,
 * flagged `priceBasis: 'assumed'`. So one hand-edited or damaged line can only pause paid calls until it is
 * acknowledged, never put every later call over budget for good (N4: a cost of 1e303 summed to Infinity).
 *
 * It is far above what v1 calls cost (prices.ts, as read 2026-10-07). A completion's output is at most 128,000 tokens
 * (the gateway's limit): $6.40 at the dearest output rate ($50 per million: Fable 5.1, GPT-6 Astra). With a million
 * input tokens at the dearest input rate ($12.50 per million, Fable 5.1's cache writes) it is $18.90, under a fiftieth
 * of the ceiling. One call is one attempt on one model: byway asks no provider for a fallback model, and the retry after
 * a decline is a call of its own (ADR-0102). The longest clip (60 s) at the dearest rate ($0.112 a second, Kling v3) is $6.72, with $0.002 for its last
 * frame; one image is about $0.25. Input has no fixed limit, but a call estimated above the ceiling is refused, so it
 * holds whatever a model accepts.
 */
export const MAX_PLAUSIBLE_CALL_USD = 1000;

/** How many characters of a line a fault keeps, for the person to recognise it. */
const FAULT_EXCERPT_CHARS = 120;

/** The words a fault is recorded with (SpendFault.detail): where the line is, why it cannot be counted when known, and its start. */
export function spendFaultDetail(line: LedgerLine, problem?: string): string {
  return `Line at byte ${line.offset} of ledger.jsonl cannot be counted as a spend entry${problem ? ` (${problem})` : ''}: "${line.excerpt.slice(0, FAULT_EXCERPT_CHARS)}"`;
}

/**
 * Why a value read from the audit file is not a LedgerEntry the spend book can record, in words, or undefined when it
 * is one (ADR-0095 decision 6). Every field the book records is checked, by the contract's types: an id, a workspace,
 * a purpose and a time that are non-empty text; a sequence number that is a whole number from 1; a kind and a provider
 * the contract names; the requested and served models as text; a cost from 0 to MAX_PLAUSIBLE_CALL_USD, byway's ceiling
 * for one call; and, when present, a run, a step and an operation as non-empty text and a price basis the contract names. Fields
 * the book does not record (the hashes, usage, latency) are left to the chain check: usage counts feed no sum the caps
 * use. What fails here is a fault, not something counted as nothing.
 */
export function ledgerEntryProblem(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'it is not a JSON object';
  const e = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === 'string' && v !== '';
  for (const field of ['id', 'workspaceId', 'purpose', 'at'] as const) if (!text(e[field])) return `its "${field}" is missing or not text`;
  if (!Number.isSafeInteger(e.seq) || (e.seq as number) < 1) return 'its "seq" is not a whole number from 1';
  if (!own(KINDS, e.kind)) return 'its "kind" is not completion, image or video';
  if (!own(PROVIDERS, e.provider)) return 'its "provider" is not one byway knows';
  for (const field of ['requestedModel', 'servedModel'] as const) if (typeof e[field] !== 'string') return `its "${field}" is missing or not text`;
  if (typeof e.costUsd !== 'number' || !(e.costUsd >= 0 && e.costUsd <= MAX_PLAUSIBLE_CALL_USD)) {
    return `its "costUsd" is not a number from 0 to ${MAX_PLAUSIBLE_CALL_USD}, the most byway counts for one call (in USD)`;
  }
  // Absent for a call outside a run (the advisor's); present, a run or step id is never empty: a hand-edited line with
  // one would record spend under run "" (no run has that id), so it is a fault like any other value the book cannot use.
  for (const field of ['runId', 'stepId'] as const) if (e[field] !== undefined && !text(e[field])) return `its "${field}" is empty or not text`;
  if (e.operationId !== undefined && !text(e.operationId)) return 'its "operationId" is not text';
  if (e.priceBasis !== undefined && !own(PRICE_BASES, e.priceBasis)) return 'its "priceBasis" is not "assumed"';
  return undefined;
}

/** The book's row for an entry: the operation it names, or, for an entry from before the book, one keyed by its id. */
export function ledgerOperationId(e: Pick<LedgerEntry, 'id' | 'operationId'>): string {
  return e.operationId ?? `ledger:${e.id}`;
}

/**
 * A call as the spend book holds it, as far as absorbing a ledger line compares the two: its operation, the entry id it
 * was settled under (absent while it is not settled), and what the book counts it by.
 */
export interface HeldCall {
  opId: string;
  entryId?: string;
  workspaceId: string;
  runId?: string;
  costUsd?: number;
  priceBasis?: string;
}

/** What the book counts a settled call by, so a line recording it otherwise is not the same entry. */
const COUNTED_BY = ['workspaceId', 'runId', 'costUsd', 'priceBasis'] as const;

/**
 * Why an entry read from the audit file conflicts with what the spend book already holds, in words, or undefined when it
 * does not (ADR-0095 decision 6). `named` is the call the line names (ledgerOperationId) and `owner` the call that
 * already holds the line's entry id, each when the book has one. The line is the same entry as the book's (the outbox's
 * own line read back, or a line read again after a restart or a restore) only when it names the call that holds its id
 * and records it as the book counts it: in the same workspace and run, at the same cost and price basis; absorbing it
 * then adds nothing. Any other line whose id or settled call the book already holds is a fault at its line: counting it
 * could count a call twice, and skipping it would drop what it says unseen (N1). A line naming a call the book holds but
 * has not settled settles it, but only in the workspace and run the book admitted it to; elsewhere it is a fault too.
 */
export function ledgerEntryConflict(e: LedgerEntry, named: HeldCall | undefined, owner: HeldCall | undefined): string | undefined {
  if (owner !== undefined && owner.opId !== ledgerOperationId(e)) return 'its "id" is the entry id of another call the spend book holds';
  if (named === undefined) return undefined;
  // A call the book holds but has not settled is settled from the line, so only where the book admitted it: a line for
  // another workspace or run would count its cost to this call's own.
  if (named.entryId === undefined) {
    for (const field of ['workspaceId', 'runId'] as const) if (named[field] !== e[field]) return `its "${field}" differs from the call the spend book holds under its operation id`;
    return undefined;
  }
  if (named.entryId !== e.id) return 'it names a call the spend book holds as settled under another entry id';
  for (const field of COUNTED_BY) if (named[field] !== e[field]) return `its "${field}" differs from the entry the spend book holds under this id`;
  return undefined;
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

/**
 * A call that used the whole of its model's wait, chosen in Settings' "How long to wait for an answer" (the waits design
 * of 2026-10-22, section 7), as the spend book keeps it beside the reason 'waited': how long it waited, and how.
 * - `silence`: a streamed answer sent nothing for the wait (sent once more first, as for any lost answer);
 * - `answer`: a call answered whole (a Google text call, an image) did not answer within the wait, and was not sent again;
 * - `clip`: a fal clip was not finished within the wait from fal's acceptance, and byway cancelled it; `cancel` is what
 *   fal answered to the cancel, in byway's words for it (fal's own status text, redacted and cut short).
 */
export interface WaitedFor {
  minutes: number;
  how: 'silence' | 'answer' | 'clip';
  cancel?: string;
}

/** A call that may have been billed, as Settings lists it with a Clear action. */
export interface UncertainCall extends PaidCallSummary {
  /**
   * `interrupted`: its caller stopped waiting for the provider's answer: its run was cancelled or ended and byway cut the
   * call off (ADR-0111), or byway stopped or died, or lost its connection, while waiting. `failed`: an attempt failed
   * after the request may have reached the provider. `resent`: an earlier attempt failed that way, and the call was sent
   * again. `waited`: the call used the whole of its model's wait and byway stopped waiting (`waited` says how).
   */
  reason: 'interrupted' | 'failed' | 'resent' | 'waited';
  /** With the reason 'waited': how long the call waited, and how. */
  waited?: WaitedFor;
  /**
   * What of `usd` was retained for earlier sends of the call that may have been billed, before byway sent it again
   * (SpendBook.retain): all of it for 'resent', on top of the reservation for the other reasons. Absent when nothing was.
   */
  retainedUsd?: number;
  /**
   * When an earlier send that was retained used the whole of its model's wait (a stream that sent nothing for it, sent
   * once more): how long and how it waited, so Settings says that send went silent, not that its connection failed
   * (block 2's check, WEB-1). With any reason; absent for a send retained for another failure.
   */
  retainedWaited?: WaitedFor;
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

/** A fault as the book keeps it, open or acknowledged, with the line it was recorded for. */
export interface RecordedFault extends SpendFault {
  offset: number;
  sha256: string;
  acknowledged: boolean;
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
  /**
   * The hash chain (Gateway.verifyLedger): the first broken entry, `line:<n>`, `head`, or the number of a missing entry
   * whose head record has an empty id; null when intact.
   */
  brokenAt: string | null;
  /**
   * Calls the book holds as written to the audit file whose entry is not there, or carries another cost: a restore of
   * an older or missing ledger.jsonl, or an OS crash that lost a line after it was marked written. The caps count them.
   */
  missing: LedgeredCall[];
  /** Settled calls not yet written to the audit file. */
  pending: number;
  setAside: string[];
  /** Unacknowledged faults, from any line: while there is one, every paid call waits (ADR-0095 decision 6). */
  openFaults: number;
  /** When brokenAt is `line:<n>`: what the book did with that line, as it is now in the file. */
  brokenLine?: BrokenLine;
}

/**
 * What the spend book did with a line of the audit file that is not an entry, so the ledger check says what is true of
 * it rather than what might be (it is read into the book before the check):
 * - `fault`: the book read the line as it is now and holds it as an unacknowledged fault, so paid calls wait;
 * - `acknowledged`: the same, and the person acknowledged it: the budgets do not count it;
 * - `read-before`: the line changed after the book read that part of the file; the book keeps what it read then (an
 *   entry it counts, or a fault of its own), and the line as it is now neither counts nor pauses anything;
 * - `blank`: a blank line, which the book skips: it neither counts nor pauses anything;
 * - `unread`: the book has not read it yet (it was written while the check ran);
 * - `torn`: the last line, without its line ending: an append cut short, which is never read, and which byway sets
 *   aside the next time it writes to the ledger.
 */
export interface BrokenLine {
  /** 1-based, as in `line:<n>`. */
  line: number;
  book: 'fault' | 'acknowledged' | 'read-before' | 'blank' | 'unread' | 'torn';
}

export interface SpendBook {
  /**
   * In one transaction: refuse a paid call while an unacknowledged fault exists; resolve the operation key, if any
   * (AdmitRequest.operationKey: in flight, resumed, or given up to this call); sweep (an open row no longer live is
   * released, a sent or accepted one becomes uncertain); check both caps against exposure plus the reservation; insert
   * the row as open, with its owner, lease and key.
   */
  admit(req: AdmitRequest): Promise<AdmitOutcome>;
  /** Compare-and-set from open to sent, for the live row this owner holds. False when it was swept meanwhile. */
  markSent(opId: string, owner: string): Promise<boolean>;
  /**
   * Whether this owner holds the call's row: it admitted it, or resumed it (AdmitOutcome `resume`), and no other owner
   * has resumed it since, in whatever state it is now; false for a row the book does not have. Changes nothing. A call
   * already sent asks it before each further queue job (a fal clip's frame jobs), so an attempt that lost its row to a
   * takeover submits none beside the attempt that holds it (MONEY-1, the check of fix/fx-landnow).
   */
  holds(opId: string, owner: string): Promise<boolean>;
  /**
   * Records a queue job the provider accepted (sent or open becomes accepted), and when, by the book's clock: a call
   * resumed later is handed that time (AdmitOutcome `resume.acceptedAt`), so a fal clip's wait keeps counting from it.
   * A role keeps the first job it was accepted with: another job id for it is refused (it throws), and the same id
   * again changes nothing.
   */
  accept(opId: string, role: ProviderJobRole, providerJobId: string): Promise<void>;
  /**
   * Before a call is sent again after an attempt that may have been billed: counts that attempt's bound against the
   * workspace cap (only), if it fits. `waited`, when that attempt used the whole of its model's wait (a stream's silence),
   * is kept with what was retained (UncertainCall.retainedWaited), whatever becomes of the call; a wait that is not one
   * is refused, and nothing is retained.
   */
  retain(opId: string, usd: number, workspaceCapUsd: number, waited?: WaitedFor): Promise<{ retained: true } | { budget: BudgetDetails }>;
  /** Definitely not billed: the row counts nothing (beyond what was retained). */
  release(opId: string): Promise<void>;
  /**
   * May have been billed: the row counts its reservation against the workspace until cleared. `reason` is what Settings
   * says of it (UncertainCall.reason): 'failed' (the default) for an attempt that failed after its request may have
   * reached the provider, 'interrupted' for a call its caller cut off while waiting for the answer (ADR-0111), 'waited'
   * for a call that used the whole of its model's wait, with `waited` (required with it, refused without it).
   */
  abandon(opId: string, reason?: 'failed' | 'interrupted' | 'waited', waited?: WaitedFor): Promise<void>;
  /** The provider answered: records the true cost from any state but settled; idempotent, returning the entry id chosen. */
  settle(opId: string, settlement: Settlement): Promise<{ ledgerEntryId: string }>;
  /**
   * Extends the lease of this owner's unsettled operations, and of its settled ones that hold an operation key (their
   * caller is still keeping the result: another attempt waits for it rather than buy the call again; ADR-0099).
   */
  renew(opIds: readonly string[], owner: string, leaseMs: number): Promise<void>;
  /**
   * This owner's caller has ended (the activity invocation is over), so these operations are held no longer: their
   * leases end now, and their operation keys are free for a later attempt. Only this owner's rows change. Idempotent.
   */
  letGo(opIds: readonly string[], owner: string): Promise<void>;
  /**
   * This owner is stopping cleanly (its gateway is closing), so its operations are given up at once rather than when
   * their leases run out: in one transaction its open rows are released (never sent, they count nothing) and its sent
   * and accepted rows become uncertain, as interrupted (they may have been billed, and count against the workspace cap
   * only until cleared), and its settled rows are held no longer (their operation keys are free for a later attempt).
   * Other owners' rows are untouched; a later settlement still records the true cost. Idempotent. An owner that crashes
   * never gets here: its rows wait for their leases to run out.
   */
  endLeases(owner: string): Promise<void>;
  cursor(): Promise<LedgerCursor>;
  /**
   * Reconciles audit-file lines into the book, idempotently: an entry with an operationId marks its row written (and
   * settles it from the entry when it is not settled yet; a missing row is inserted); a legacy entry is inserted once,
   * keyed by its entry id. The same entry read again (ledgerEntryConflict: the outbox's own line read back, a line read
   * once more after a restart or a restore) adds nothing. A line that is not an entry, an entry it cannot record
   * (ledgerEntryProblem), one that conflicts with what the book holds (another call's entry id, or a settled call
   * recorded otherwise: ledgerEntryConflict), or one the database still refuses becomes a fault with why in words, once
   * per offset and hash. No single line makes it throw. Then the cursor advances.
   */
  absorb(batch: LedgerBatch): Promise<{ faults: number }>;
  /** Settled calls not yet in the audit file, oldest first. */
  unledgered(limit: number): Promise<UnledgeredCall[]>;
  markLedgered(opId: string, seq: number): Promise<void>;
  /** Every call the book holds as written to the audit file. */
  ledgeredCalls(): Promise<LedgeredCall[]>;
  spend(workspaceId: string): Promise<BookSpend>;
  records(workspaceId: string): Promise<BookRecords>;
  /**
   * Stops counting calls that may have been billed (the person checked them); returns how many were cleared. A call
   * still in flight (listed for a send it retained while it is sent again) is left as it is until it ends.
   */
  clearUncertain(workspaceId: string, opIds: readonly string[]): Promise<number>;
  acknowledgeFault(id: number): Promise<boolean>;
  /** Every fault the book has recorded, open or acknowledged, oldest first (the ledger check, the start-up report). */
  faults(): Promise<RecordedFault[]>;
}
