/**
 * The SpendBook contract suite (contracts v6, ADR-0095). Every implementation runs it: @byway/store's book over
 * byway.sqlite (on two connections to one file, so cross-process visibility is exercised) and @byway/gateway's in-memory
 * book for tests. It pins the exposure rule, the sweep, the state changes, idempotent settlement, absorbing the audit
 * file and the outbox, faults and the Settings actions, with an injected clock so leases expire on demand.
 *
 * Imported by the implementations' own tests as `@byway/contracts/spend-book-suite` (a test file, not shipped code).
 */
import { describe, expect, it } from 'vitest';
import { MAX_PLAUSIBLE_CALL_USD, type AdmitRequest, type EntryLine, type LedgerBatch, type LedgerEntry, type Settlement, type SpendBook } from '../src/index.ts';

export interface SpendBookFixture {
  /** Two handles on the same book: two connections for a database, the same object twice in memory. */
  a: SpendBook;
  b: SpendBook;
  /** Moves the book's clock forward. */
  advance(ms: number): void;
  close(): void;
}

const LEASE = 60_000;
let counter = 0;
const nextId = () => `op-${++counter}`;

export const admitRequest = (over: Partial<AdmitRequest> = {}): AdmitRequest => ({
  opId: nextId(),
  owner: 'owner-a',
  leaseMs: LEASE,
  workspaceId: 'ws',
  runId: 'run',
  stepId: 'draft',
  purpose: 'build:prose',
  kind: 'completion',
  provider: 'anthropic',
  model: 'claude-x',
  reserveUsd: 0.1,
  paid: true,
  caps: { workspaceUsd: 1, runUsd: 1 },
  ...over,
});

export const settlement = (costUsd: number, over: Partial<Settlement['entry']> = {}): Settlement => ({
  at: '2026-10-08T12:00:00.000Z',
  entry: {
    workspaceId: 'ws',
    runId: 'run',
    stepId: 'draft',
    purpose: 'build:prose',
    kind: 'completion',
    provider: 'anthropic',
    requestedModel: 'claude-x',
    servedModel: 'claude-x',
    requestSha256: `sha256:${'a'.repeat(64)}`,
    responseSha256: `sha256:${'b'.repeat(64)}`,
    usage: { inputTokens: 10, outputTokens: 20 },
    costUsd,
    latencyMs: 5,
    ...over,
  },
});

let seq = 0;
export const ledgerEntry = (costUsd: number, over: Partial<LedgerEntry> = {}): LedgerEntry => {
  seq += 1;
  return {
    id: `entry-${seq}`,
    seq,
    at: '2026-10-08T11:00:00.000Z',
    prevHash: `sha256:${'0'.repeat(64)}`,
    hash: `sha256:${seq.toString(16).padStart(64, '0')}`,
    workspaceId: 'ws',
    runId: 'run',
    purpose: 'build:prose',
    kind: 'completion',
    provider: 'anthropic',
    requestedModel: 'claude-x',
    servedModel: 'claude-x',
    requestSha256: `sha256:${'a'.repeat(64)}`,
    responseSha256: `sha256:${'b'.repeat(64)}`,
    usage: { inputTokens: 1, outputTokens: 1 },
    costUsd,
    latencyMs: 1,
    ...over,
  };
};

/** Entries as lines of the audit file, 100 bytes apart from the start, each hashed by its entry id. */
const lines = (entries: LedgerEntry[]): EntryLine[] => entries.map((entry, i) => ({ offset: 100 * i, sha256: `sha256:line-${String(entry.id)}`, excerpt: JSON.stringify(entry).slice(0, 120), entry }));
const batch = (entries: LedgerEntry[], over: Partial<LedgerBatch> = {}): LedgerBatch => ({ entries: lines(entries), unreadable: [], cursor: { offset: 100 * entries.length, tailStart: 0, tailSha256: null }, ...over });
/** An entry with a field changed to something the contract does not allow, as a hand edit or a flipped bit leaves it. */
const odd = (costUsd: number, change: Record<string, unknown>): LedgerEntry => {
  const e: Record<string, unknown> = { ...ledgerEntry(costUsd), ...change };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return e as unknown as LedgerEntry;
};

const cents = (n: number) => Math.round(n * 1e6) / 1e6;

/** Why a line whose entry id another call holds is a fault, as the fault records it. */
const OTHER_CALLS_ID = 'its "id" is the entry id of another call the spend book holds';

export function spendBookContract(name: string, open: () => SpendBookFixture): void {
  describe(`SpendBook contract: ${name}`, () => {
    const withBook = (fn: (f: SpendBookFixture) => Promise<void>) => async () => {
      const f = open();
      try {
        await fn(f);
      } finally {
        f.close();
      }
    };

    it(
      'admits within both caps and counts the reservation as in flight, seen through the other handle',
      withBook(async ({ a, b }) => {
        expect(await a.admit(admitRequest({ reserveUsd: 0.4 }))).toEqual({ admitted: true });
        expect(await b.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0.4, uncertainUsd: 0, byRun: {} });
        const refused = await b.admit(admitRequest({ reserveUsd: 0.7 }));
        expect(refused).toEqual({ budget: { scope: 'workspace', capUsd: 1, spentUsd: 0, reservedUsd: 0.4, uncertainUsd: 0, estimateUsd: 0.7, shortfallUsd: 0.1 } });
        expect(await a.spend('other-ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0 });
      }),
    );

    it(
      'refuses at run scope with the run’s settled and in-flight amounts, and leaves other runs alone',
      withBook(async ({ a }) => {
        const first = admitRequest({ reserveUsd: 0.2, caps: { workspaceUsd: 10, runUsd: 0.5 } });
        await a.admit(first);
        await a.settle(first.opId, settlement(0.25));
        await a.admit(admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 10, runUsd: 0.5 } }));
        const refused = await a.admit(admitRequest({ reserveUsd: 0.2, caps: { workspaceUsd: 10, runUsd: 0.5 } }));
        expect(refused).toEqual({ budget: { scope: 'run', capUsd: 0.5, spentUsd: 0.25, reservedUsd: 0.1, estimateUsd: 0.2, shortfallUsd: 0.05 } });
        expect(await a.admit(admitRequest({ runId: 'run-2', reserveUsd: 0.2, caps: { workspaceUsd: 10, runUsd: 0.5 } }))).toEqual({ admitted: true });
      }),
    );

    it(
      'sweeps: an open row whose lease ran out is released and counts nothing; a sent one may have been billed, against the workspace only',
      withBook(async ({ a, b, advance }) => {
        const open = admitRequest({ reserveUsd: 0.3 });
        const sent = admitRequest({ reserveUsd: 0.4 });
        await a.admit(open);
        await a.admit(sent);
        expect(await a.markSent(sent.opId, 'owner-a')).toBe(true);
        advance(LEASE + 1);
        expect(await b.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0.4 });
        // The run cap does not count it: a stop and restart raises no budget question.
        expect(await b.admit(admitRequest({ reserveUsd: 0.5, caps: { workspaceUsd: 10, runUsd: 0.5 } }))).toEqual({ admitted: true });
        // The workspace cap does.
        const refused = await b.admit(admitRequest({ reserveUsd: 0.2, caps: { workspaceUsd: 1, runUsd: 10 } }));
        expect(refused).toMatchObject({ budget: { scope: 'workspace', uncertainUsd: 0.4, reservedUsd: 0.5, estimateUsd: 0.2 } });
        // A late mark of the released row fails: it was never sent, and must not count again.
        expect(await a.markSent(open.opId, 'owner-a')).toBe(false);
        const records = await a.records('ws');
        expect(records.uncertain).toEqual([expect.objectContaining({ opId: sent.opId, usd: 0.4, reason: 'interrupted', purpose: 'build:prose', provider: 'anthropic', model: 'claude-x', runId: 'run' })]);
      }),
    );

    it(
      'ends one owner’s leases at once (a clean stop): its sent and accepted calls may have been billed, against the workspace only; its open ones count nothing',
      withBook(async ({ a, b }) => {
        const roomy = { workspaceUsd: 10, runUsd: 10 };
        const open = admitRequest({ reserveUsd: 0.3, caps: roomy });
        const sent = admitRequest({ reserveUsd: 0.4, caps: roomy });
        const accepted = admitRequest({ reserveUsd: 0.2, kind: 'video', provider: 'fal', model: 'fal-ai/kling', caps: roomy });
        const settled = admitRequest({ reserveUsd: 0.1, caps: roomy });
        const theirs = admitRequest({ reserveUsd: 0.05, owner: 'owner-b', caps: roomy });
        for (const r of [open, sent, accepted, settled, theirs]) expect(await a.admit(r)).toEqual({ admitted: true });
        for (const r of [sent, accepted, settled]) await a.markSent(r.opId, 'owner-a');
        await a.markSent(theirs.opId, 'owner-b');
        await a.accept(accepted.opId, 'generation', 'req-gen');
        await a.settle(settled.opId, settlement(0.08));
        await b.endLeases('owner-a');
        // No time has passed: nothing waits for a lease to run out.
        expect(await a.spend('ws')).toEqual({ spentUsd: 0.08, byRun: { run: 0.08 }, inFlightUsd: 0.05, uncertainUsd: 0.6 });
        // The run cap counts its settled cost and the other owner's call in flight only: 0.08 + 0.05 + 0.37 fits under 0.5.
        expect(await a.admit(admitRequest({ reserveUsd: 0.37, caps: { workspaceUsd: 10, runUsd: 0.5 } }))).toEqual({ admitted: true });
        const records = await a.records('ws');
        expect(records.uncertain.map((u) => [u.opId, u.usd, u.reason]).sort()).toEqual(
          [
            [sent.opId, 0.4, 'interrupted'],
            [accepted.opId, 0.2, 'interrupted'],
          ].sort(),
        );
        expect(records.uncertain.find((u) => u.opId === accepted.opId)?.providerJobs).toEqual({ generation: 'req-gen' });
        // The released call cannot be sent any more; the stopped calls are not renewed; a late answer still settles.
        expect(await a.markSent(open.opId, 'owner-a')).toBe(false);
        await a.renew([sent.opId], 'owner-a', LEASE);
        expect(await a.spend('ws')).toMatchObject({ uncertainUsd: 0.6 });
        await a.settle(sent.opId, settlement(0.1));
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.18, uncertainUsd: 0.2 });
        await b.endLeases('owner-a');
        await b.endLeases('nobody');
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.18, uncertainUsd: 0.2 });
      }),
    );

    it(
      'marks sent once, only for the owner of a live open row',
      withBook(async ({ a, b, advance }) => {
        const r = admitRequest();
        await a.admit(r);
        expect(await b.markSent(r.opId, 'owner-b')).toBe(false);
        expect(await b.markSent(r.opId, 'owner-a')).toBe(true);
        expect(await a.markSent(r.opId, 'owner-a')).toBe(false);
        const late = admitRequest();
        await a.admit(late);
        advance(LEASE + 1);
        expect(await a.markSent(late.opId, 'owner-a')).toBe(false);
        expect(await a.markSent('no-such-op', 'owner-a')).toBe(false);
      }),
    );

    it(
      'renews only this owner’s unsettled rows, so a call that runs long stays in flight',
      withBook(async ({ a, advance }) => {
        const mine = admitRequest({ reserveUsd: 0.2 });
        const theirs = admitRequest({ reserveUsd: 0.3, owner: 'owner-b' });
        await a.admit(mine);
        await a.admit(theirs);
        await a.markSent(mine.opId, 'owner-a');
        await a.markSent(theirs.opId, 'owner-b');
        advance(LEASE - 1000);
        await a.renew([mine.opId, theirs.opId], 'owner-a', LEASE);
        advance(2000);
        expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0.2, uncertainUsd: 0.3 });
      }),
    );

    it(
      'settles from every state, idempotently: the true cost wins, and a second settlement changes nothing',
      withBook(async ({ a, b, advance }) => {
        const states: string[] = [];
        const ops: string[] = [];
        for (const how of ['open', 'sent', 'accepted', 'released', 'uncertain', 'expired']) {
          const r = admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 100, runUsd: 100 } });
          await a.admit(r);
          if (how !== 'open' && how !== 'released') await a.markSent(r.opId, 'owner-a');
          if (how === 'accepted') await a.accept(r.opId, 'generation', 'req-1');
          if (how === 'released') await a.release(r.opId);
          if (how === 'uncertain') await a.abandon(r.opId);
          states.push(how);
          ops.push(r.opId);
        }
        advance(LEASE + 1);
        const ids: string[] = [];
        for (const op of ops) ids.push((await b.settle(op, settlement(0.05))).ledgerEntryId);
        expect(new Set(ids).size).toBe(ops.length);
        for (const [i, op] of ops.entries()) expect((await a.settle(op, settlement(9))).ledgerEntryId).toBe(ids[i]);
        expect(await a.spend('ws')).toEqual({ spentUsd: cents(0.05 * states.length), byRun: { run: cents(0.05 * states.length) }, inFlightUsd: 0, uncertainUsd: 0 });
        expect((await a.unledgered(100)).map((u) => [u.opId, u.entryId])).toEqual(ops.map((op, i) => [op, ids[i]]));
      }),
    );

    it(
      'retains a re-sent attempt’s bound against the workspace only, if it fits; it stays counted after the call settles',
      withBook(async ({ a }) => {
        const r = admitRequest({ reserveUsd: 0.3, caps: { workspaceUsd: 1, runUsd: 0.4 } });
        await a.admit(r);
        await a.markSent(r.opId, 'owner-a');
        expect(await a.retain(r.opId, 0.3, 1)).toEqual({ retained: true });
        expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0.3, uncertainUsd: 0.3 });
        const refused = await a.retain(r.opId, 0.5, 1);
        expect(refused).toEqual({ budget: { scope: 'workspace', capUsd: 1, spentUsd: 0, reservedUsd: 0.3, uncertainUsd: 0.3, estimateUsd: 0.5, shortfallUsd: 0.1 } });
        await a.settle(r.opId, settlement(0.2));
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.2, byRun: { run: 0.2 }, inFlightUsd: 0, uncertainUsd: 0.3 });
        // The run cap counts the settled cost only: 0.2 + 0.2 fits under 0.4.
        expect(await a.admit(admitRequest({ reserveUsd: 0.2, caps: { workspaceUsd: 10, runUsd: 0.4 } }))).toEqual({ admitted: true });
        expect((await a.records('ws')).uncertain).toEqual([expect.objectContaining({ opId: r.opId, usd: 0.3, reason: 'resent' })]);
      }),
    );

    it(
      'releases a call that was certainly not billed and abandons one that may have been',
      withBook(async ({ a }) => {
        const released = admitRequest({ reserveUsd: 0.3 });
        const abandoned = admitRequest({ reserveUsd: 0.4 });
        await a.admit(released);
        await a.admit(abandoned);
        await a.markSent(released.opId, 'owner-a');
        await a.markSent(abandoned.opId, 'owner-a');
        await a.release(released.opId);
        await a.abandon(abandoned.opId);
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0.4 });
        expect((await a.records('ws')).uncertain).toEqual([expect.objectContaining({ opId: abandoned.opId, usd: 0.4, reason: 'failed' })]);
        // A late settlement of the abandoned call records its true cost instead.
        await a.settle(abandoned.opId, settlement(0.15));
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.15, uncertainUsd: 0 });
      }),
    );

    it(
      'records accepted queue jobs; an accepted call whose caller is gone may have been billed, with its job ids listed',
      withBook(async ({ a, advance }) => {
        const r = admitRequest({ kind: 'video', provider: 'fal', model: 'fal-ai/kling', reserveUsd: 0.7 });
        await a.admit(r);
        await a.markSent(r.opId, 'owner-a');
        await a.accept(r.opId, 'generation', 'req-gen');
        await a.accept(r.opId, 'extract', 'req-frame');
        expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0.7 });
        expect((await a.records('ws')).inFlight).toEqual([expect.objectContaining({ opId: r.opId, usd: 0.7, provider: 'fal' })]);
        advance(LEASE + 1);
        expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0.7 });
        expect((await a.records('ws')).uncertain).toEqual([expect.objectContaining({ opId: r.opId, reason: 'interrupted', providerJobs: { generation: 'req-gen', extract: 'req-frame' } })]);
      }),
    );

    it(
      'clears what may have been billed, for this workspace only, and leaves settled cost alone',
      withBook(async ({ a, b }) => {
        const gone = admitRequest({ reserveUsd: 0.4 });
        const resent = admitRequest({ reserveUsd: 0.3 });
        const elsewhere = admitRequest({ reserveUsd: 0.2, workspaceId: 'ws-2', runId: 'run-x' });
        for (const r of [gone, resent, elsewhere]) {
          await a.admit(r);
          await a.markSent(r.opId, 'owner-a');
        }
        await a.abandon(gone.opId);
        await a.abandon(elsewhere.opId);
        await a.retain(resent.opId, 0.3, 1);
        await a.settle(resent.opId, settlement(0.1));
        expect(await b.clearUncertain('ws', [gone.opId, resent.opId, elsewhere.opId, 'no-such-op'])).toBe(2);
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.1, uncertainUsd: 0 });
        expect(await a.spend('ws-2')).toMatchObject({ uncertainUsd: 0.2 });
        expect((await a.records('ws')).uncertain).toEqual([]);
        expect(await b.clearUncertain('ws', [gone.opId])).toBe(0);
      }),
    );

    it(
      'absorbs legacy entries once, by entry id: re-reading the whole file from the start changes nothing',
      withBook(async ({ a, b }) => {
        const legacy = [ledgerEntry(0.05), ledgerEntry(0.1), ledgerEntry(0.2, { runId: 'run-2', priceBasis: 'assumed' }), ledgerEntry(0.3, { workspaceId: 'ws-2' })];
        expect(await a.absorb(batch(legacy))).toEqual({ faults: 0 });
        const once = await b.spend('ws');
        expect(once).toEqual({ spentUsd: 0.35, byRun: { run: 0.15, 'run-2': 0.2 }, inFlightUsd: 0, uncertainUsd: 0, assumedPricing: { calls: 1, usd: 0.2 } });
        await b.absorb(batch(legacy));
        await a.absorb(batch(legacy.slice(0, 2), { cursor: { offset: 0, tailStart: 0, tailSha256: null } }));
        expect(await a.spend('ws')).toEqual(once);
        expect(await a.unledgered(10)).toEqual([]);
        expect((await a.ledgeredCalls()).map((c) => [c.entryId, c.costUsd]).sort()).toEqual(legacy.map((e) => [e.id, e.costUsd]).sort());
        expect(await a.cursor()).toEqual({ offset: 0, tailStart: 0, tailSha256: null });
        await a.absorb(batch([], { cursor: { offset: 812, tailStart: 700, tailSha256: 'sha256:tail' } }));
        expect(await b.cursor()).toEqual({ offset: 812, tailStart: 700, tailSha256: 'sha256:tail' });
      }),
    );

    it(
      'absorbs an entry that names its operation: marks the row written, settles it from the entry when it is not, and inserts a missing one',
      withBook(async ({ a }) => {
        const drained = admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 100, runUsd: 100 } });
        const unsettled = admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 100, runUsd: 100 } });
        await a.admit(drained);
        await a.admit(unsettled);
        await a.markSent(unsettled.opId, 'owner-a');
        const { ledgerEntryId } = await a.settle(drained.opId, settlement(0.07));
        expect((await a.unledgered(10)).map((u) => u.opId)).toEqual([drained.opId]);
        await a.absorb(
          batch([
            ledgerEntry(0.07, { id: ledgerEntryId, operationId: drained.opId }),
            ledgerEntry(0.09, { operationId: unsettled.opId }),
            ledgerEntry(0.11, { operationId: 'op-from-elsewhere', runId: 'run-3' }),
          ]),
        );
        expect(await a.unledgered(10)).toEqual([]);
        expect(await a.spend('ws')).toEqual({ spentUsd: 0.27, byRun: { run: 0.16, 'run-3': 0.11 }, inFlightUsd: 0, uncertainUsd: 0 });
        expect((await a.ledgeredCalls()).map((c) => c.opId).sort()).toEqual([drained.opId, unsettled.opId, 'op-from-elsewhere'].sort());
      }),
    );

    it(
      'keeps settled calls in an outbox, oldest first, until each is marked written',
      withBook(async ({ a, b }) => {
        const ops = [admitRequest(), admitRequest(), admitRequest()];
        const ids: string[] = [];
        for (const r of ops) {
          await a.admit(r);
          ids.push((await a.settle(r.opId, settlement(0.01, { purpose: `p-${r.opId}` }))).ledgerEntryId);
        }
        const out = await b.unledgered(2);
        expect(out).toEqual([
          { opId: ops[0]!.opId, entryId: ids[0], at: '2026-10-08T12:00:00.000Z', entry: settlement(0.01, { purpose: `p-${ops[0]!.opId}` }).entry },
          { opId: ops[1]!.opId, entryId: ids[1], at: '2026-10-08T12:00:00.000Z', entry: settlement(0.01, { purpose: `p-${ops[1]!.opId}` }).entry },
        ]);
        await b.markLedgered(ops[0]!.opId, 7);
        await b.markLedgered(ops[0]!.opId, 8);
        expect((await a.unledgered(10)).map((u) => u.opId)).toEqual([ops[1]!.opId, ops[2]!.opId]);
        expect(await a.records('ws')).toMatchObject({ notInAuditFile: 2 });
      }),
    );

    it(
      'records a line it cannot read as a fault once per offset; paid calls wait until it is acknowledged, free ones do not',
      withBook(async ({ a, b }) => {
        const bad = { offset: 412, sha256: 'sha256:bad', excerpt: '{"workspaceId":"ws","cost' };
        expect(await a.absorb(batch([], { unreadable: [bad] }))).toEqual({ faults: 1 });
        expect(await b.absorb(batch([], { unreadable: [bad] }))).toEqual({ faults: 0 });
        const records = await a.records('ws');
        expect(records.faults).toEqual([{ id: expect.any(Number), detail: expect.stringContaining('412'), createdAt: expect.any(String) }]);
        const refused = await b.admit(admitRequest());
        expect(refused).toEqual({ fault: expect.stringMatching(/412/) });
        expect(await b.admit(admitRequest({ paid: false, reserveUsd: 0 }))).toEqual({ admitted: true });
        const id = records.faults[0]!.id;
        expect(await b.acknowledgeFault(id)).toBe(true);
        expect(await a.acknowledgeFault(id)).toBe(false);
        expect((await a.records('ws')).faults).toEqual([]);
        expect(await a.admit(admitRequest())).toEqual({ admitted: true });
        // The same line read again is the same fault, already acknowledged: it does not block again.
        expect(await a.absorb(batch([], { unreadable: [bad] }))).toEqual({ faults: 0 });
        expect(await a.admit(admitRequest())).toEqual({ admitted: true });
      }),
    );

    it(
      'lists every fault it recorded, open or acknowledged, with its line’s offset and hash, oldest first',
      withBook(async ({ a, b }) => {
        expect(await a.faults()).toEqual([]);
        const first = { offset: 0, sha256: 'sha256:first', excerpt: '{corrupted' };
        const second = { offset: 300, sha256: 'sha256:second', excerpt: '#', problem: 'it is not JSON' };
        await a.absorb(batch([], { unreadable: [second, first] }));
        const listed = await b.faults();
        expect(listed).toEqual([
          { id: expect.any(Number), offset: 0, sha256: 'sha256:first', detail: expect.stringContaining('byte 0'), createdAt: expect.any(String), acknowledged: false },
          { id: expect.any(Number), offset: 300, sha256: 'sha256:second', detail: expect.stringContaining('byte 300 of ledger.jsonl cannot be counted as a spend entry (it is not JSON)'), createdAt: expect.any(String), acknowledged: false },
        ]);
        await b.acknowledgeFault(listed[0]!.id);
        expect((await a.faults()).map((f) => [f.offset, f.acknowledged])).toEqual([
          [0, true],
          [300, false],
        ]);
        expect((await a.records('ws')).faults.map((f) => f.id)).toEqual([listed[1]!.id]);
      }),
    );

    it(
      'records an entry line it cannot record (a field missing or of the wrong type) as a fault at that line, never an error; the rest of the batch is counted',
      withBook(async ({ a, b }) => {
        const entries = [
          ledgerEntry(0.05),
          odd(0.07, { at: undefined }),
          odd(0.07, { servedModel: { x: 1 } }),
          odd(0.07, { stepId: { x: 1 } }),
          odd(0.07, { priceBasis: 7 }),
          odd(0.07, { requestedModel: ['m'] }),
          odd(0.07, { runId: 5 }),
          odd(0.07, { kind: 'telegram' }),
          // An empty run or step would record spend under a run "" (a hand edit): no call has one.
          odd(0.07, { runId: '' }),
          odd(0.07, { stepId: '' }),
          ledgerEntry(0.02),
        ];
        expect(await a.absorb(batch(entries))).toEqual({ faults: 9 });
        // Read again (a restart, another process): the same lines are the same faults.
        expect(await b.absorb(batch(entries))).toEqual({ faults: 0 });
        expect(await b.spend('ws')).toEqual({ spentUsd: 0.07, byRun: { run: 0.07 }, inFlightUsd: 0, uncertainUsd: 0 });
        const { faults } = await b.records('ws');
        expect(faults.map((f) => f.detail)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900].map((at) => expect.stringContaining(`Line at byte ${at} of ledger.jsonl cannot be counted as a spend entry`)));
        expect(faults.slice(7).map((f) => f.detail)).toEqual([expect.stringContaining('its "runId" is empty or not text'), expect.stringContaining('its "stepId" is empty or not text')]);
        expect(await a.admit(admitRequest())).toEqual({ fault: expect.stringMatching(/byte 100\b/) });
        expect(await a.admit(admitRequest({ paid: false, reserveUsd: 0 }))).toEqual({ admitted: true });
        for (const f of faults) expect(await b.acknowledgeFault(f.id)).toBe(true);
        expect(await a.admit(admitRequest())).toEqual({ admitted: true });
        expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.07 });
      }),
    );

    it(
      'records an entry that would give one call the entry id of another as a fault, not an error; the call it names stays counted at its estimate',
      withBook(async ({ a }) => {
        const named = admitRequest({ reserveUsd: 0.1 });
        const other = admitRequest({ reserveUsd: 0.1 });
        await a.admit(named);
        await a.admit(other);
        await a.markSent(named.opId, 'owner-a');
        const { ledgerEntryId } = await a.settle(other.opId, settlement(0.02));
        const clash = ledgerEntry(0.03, { id: ledgerEntryId, operationId: named.opId });
        expect(await a.absorb(batch([ledgerEntry(0.01), clash]))).toEqual({ faults: 1 });
        expect(await a.spend('ws')).toEqual({ spentUsd: 0.03, byRun: { run: 0.03 }, inFlightUsd: 0.1, uncertainUsd: 0 });
        expect((await a.records('ws')).faults).toEqual([expect.objectContaining({ detail: expect.stringContaining(`Line at byte 100 of ledger.jsonl cannot be counted as a spend entry (${OTHER_CALLS_ID})`) })]);
      }),
    );

    // A line whose entry id the book already holds, for a call the line does not record as the book does: N1 found the
    // first two skipped silently, so whatever they cost was never counted and nothing paused.
    const collisions: [string, (held: { opId: string; entryId: string }) => LedgerEntry, string][] = [
      ['a new operation', ({ entryId }) => ledgerEntry(5, { id: entryId, operationId: 'op-never-admitted' }), OTHER_CALLS_ID],
      ['no operation (an entry from before the book)', ({ entryId }) => ledgerEntry(5, { id: entryId }), OTHER_CALLS_ID],
      ['its own operation, at another cost', ({ opId, entryId }) => ledgerEntry(5, { id: entryId, operationId: opId }), 'its "costUsd" differs from the entry the spend book holds under this id'],
      ['its own operation, in another run', ({ opId, entryId }) => ledgerEntry(0.02, { id: entryId, operationId: opId, runId: 'run-9' }), 'its "runId" differs from the entry the spend book holds under this id'],
      ['its own operation, settled under another entry id', ({ opId }) => ledgerEntry(0.02, { operationId: opId }), 'it names a call the spend book holds as settled under another entry id'],
    ];
    for (const [what, make, reason] of collisions) {
      it(
        `records a line with a settled call’s entry id, naming ${what}, as a fault at its line, never skipping it`,
        withBook(async ({ a, b }) => {
          const held = admitRequest({ reserveUsd: 0.1 });
          await a.admit(held);
          await a.markSent(held.opId, 'owner-a');
          const { ledgerEntryId } = await a.settle(held.opId, settlement(0.02));
          expect(await a.absorb(batch([ledgerEntry(0.01), make({ opId: held.opId, entryId: ledgerEntryId }), ledgerEntry(0.03)]))).toEqual({ faults: 1 });
          // The rest of the batch is counted and the cursor moves on; the line is neither counted nor dropped unseen.
          expect(await b.spend('ws')).toEqual({ spentUsd: 0.06, byRun: { run: 0.06 }, inFlightUsd: 0, uncertainUsd: 0 });
          expect(await b.cursor()).toEqual({ offset: 300, tailStart: 0, tailSha256: null });
          expect((await b.records('ws')).faults).toEqual([expect.objectContaining({ detail: expect.stringContaining(`Line at byte 100 of ledger.jsonl cannot be counted as a spend entry (${reason})`) })]);
          expect(await a.admit(admitRequest())).toEqual({ fault: expect.stringMatching(/byte 100\b/) });
          // The call the book settled is still waiting to be written to the audit file under its own entry.
          expect((await a.unledgered(10)).map((u) => [u.opId, u.entryId])).toEqual([[held.opId, ledgerEntryId]]);
        }),
      );
    }

    // A line naming a call the book holds but has not settled settles that call from the line (an older byway.sqlite
    // restored beside a newer ledger), but only where the book admitted it: the round-3 verifier found a line written
    // for another workspace or run counted to the call's own, without a fault.
    const strays: [string, Partial<LedgerEntry>, string][] = [
      ['another workspace', { workspaceId: 'ws2' }, 'its "workspaceId" differs from the call the spend book holds under its operation id'],
      ['another run', { runId: 'run-9' }, 'its "runId" differs from the call the spend book holds under its operation id'],
    ];
    for (const [what, change, reason] of strays) {
      it(
        `records a line naming a call the book holds unsettled, but in ${what}, as a fault, never counting it to the call's own`,
        withBook(async ({ a, b }) => {
          const held = admitRequest({ reserveUsd: 0.1 });
          await a.admit(held);
          await a.markSent(held.opId, 'owner-a');
          expect(await a.absorb(batch([ledgerEntry(0.5, { operationId: held.opId, ...change })]))).toEqual({ faults: 1 });
          expect(await b.spend('ws')).toEqual({ spentUsd: 0, byRun: {}, inFlightUsd: 0.1, uncertainUsd: 0 });
          expect((await b.records('ws')).faults).toEqual([expect.objectContaining({ detail: expect.stringContaining(`(${reason})`) })]);
        }),
      );
    }

    it(
      'settles a call the book holds unsettled from a line naming it in its own workspace and run, without a fault',
      withBook(async ({ a, b }) => {
        const held = admitRequest({ reserveUsd: 0.1 });
        await a.admit(held);
        await a.markSent(held.opId, 'owner-a');
        expect(await a.absorb(batch([ledgerEntry(0.05, { operationId: held.opId })]))).toEqual({ faults: 0 });
        expect(await b.spend('ws')).toEqual({ spentUsd: 0.05, byRun: { run: 0.05 }, inFlightUsd: 0, uncertainUsd: 0 });
      }),
    );

    it(
      'reads the same entry again without a fault: the outbox’s own line read back marks its call written, and reading it again changes nothing',
      withBook(async ({ a, b }) => {
        const r = admitRequest({ reserveUsd: 0.1 });
        await a.admit(r);
        await a.markSent(r.opId, 'owner-a');
        const { ledgerEntryId } = await a.settle(r.opId, settlement(0.07, { priceBasis: 'assumed' }));
        const own = ledgerEntry(0.07, { id: ledgerEntryId, operationId: r.opId, priceBasis: 'assumed' });
        expect(await a.absorb(batch([own]))).toEqual({ faults: 0 });
        expect(await a.unledgered(10)).toEqual([]);
        // Another process, a restart, a restored ledger read from its start, and the line copied further down.
        expect(await b.absorb(batch([own]))).toEqual({ faults: 0 });
        expect(await a.absorb(batch([ledgerEntry(0.01), own], { cursor: { offset: 200, tailStart: 100, tailSha256: null } }))).toEqual({ faults: 0 });
        expect(await b.spend('ws')).toEqual({ spentUsd: 0.08, byRun: { run: 0.08 }, inFlightUsd: 0, uncertainUsd: 0, assumedPricing: { calls: 1, usd: 0.07 } });
        expect((await a.ledgeredCalls()).filter((c) => c.opId === r.opId)).toEqual([expect.objectContaining({ entryId: ledgerEntryId, costUsd: 0.07 })]);
        expect(await a.faults()).toEqual([]);
        expect(await a.admit(admitRequest())).toEqual({ admitted: true });
      }),
    );

    it(
      'records an entry whose cost is more than one call can cost, or less than nothing, as a fault that can be acknowledged; it never puts every paid call over budget',
      withBook(async ({ a, b }) => {
        const entries = [ledgerEntry(0.05), ledgerEntry(1e303), ledgerEntry(MAX_PLAUSIBLE_CALL_USD + 0.01), ledgerEntry(-0.5), ledgerEntry(0.02)];
        expect(await a.absorb(batch(entries))).toEqual({ faults: 3 });
        expect(await b.spend('ws')).toEqual({ spentUsd: 0.07, byRun: { run: 0.07 }, inFlightUsd: 0, uncertainUsd: 0 });
        const { faults } = await b.records('ws');
        expect(faults.map((f) => f.detail)).toEqual([100, 200, 300].map((at) => expect.stringContaining(`Line at byte ${at} of ledger.jsonl cannot be counted as a spend entry (its "costUsd" is not`)));
        expect(await a.admit(admitRequest())).toEqual({ fault: expect.stringMatching(/byte 100\b/) });
        for (const f of faults) expect(await b.acknowledgeFault(f.id)).toBe(true);
        expect(await a.admit(admitRequest())).toEqual({ admitted: true });
        // The ceiling itself is a cost one call can have.
        expect(await a.absorb(batch([ledgerEntry(MAX_PLAUSIBLE_CALL_USD, { workspaceId: 'ws-big' })], { cursor: { offset: 600, tailStart: 500, tailSha256: null } }))).toEqual({ faults: 0 });
        expect(await b.spend('ws-big')).toMatchObject({ spentUsd: MAX_PLAUSIBLE_CALL_USD });
      }),
    );

    it(
      'lists calls in flight and what may have been billed for the workspace',
      withBook(async ({ a, b }) => {
        const flying = admitRequest({ reserveUsd: 0.25, purpose: 'critic:prose' });
        await a.admit(flying);
        await a.admit(admitRequest({ workspaceId: 'ws-2', runId: 'r2' }));
        const records = await b.records('ws');
        expect(records).toEqual({
          inFlight: [{ opId: flying.opId, runId: 'run', purpose: 'critic:prose', provider: 'anthropic', model: 'claude-x', usd: 0.25, since: expect.any(String) }],
          uncertain: [],
          faults: [],
          notInAuditFile: 0,
        });
      }),
    );

    // Stage 3 (ADR-0099): an operation key names one call across Temporal's attempts of its step (the runner's run and
    // memo key). One live row holds a key; an attempt that finds it held waits, and one that finds its holder gone takes
    // the key over, resuming queue jobs the provider accepted instead of submitting new ones.
    describe('operation keys', () => {
      const keyed = (key: string, over: Partial<AdmitRequest> = {}) => admitRequest({ operationKey: key, caps: { workspaceUsd: 10, runUsd: 10 }, ...over });

      it(
        'answers a second admission of a key a live row holds with inFlight, in every state, settled included; it reserves nothing more',
        withBook(async ({ a, b }) => {
          const states = ['open', 'sent', 'accepted', 'settled'] as const;
          for (const state of states) {
            const r = keyed(`k-${state}`, { reserveUsd: 0.1 });
            expect(await a.admit(r)).toEqual({ admitted: true });
            if (state !== 'open') await a.markSent(r.opId, 'owner-a');
            if (state === 'accepted') await a.accept(r.opId, 'generation', 'req-1');
            if (state === 'settled') await a.settle(r.opId, { ...settlement(0.05), holdMs: LEASE });
            expect(await b.admit(keyed(`k-${state}`, { owner: 'owner-b' }))).toEqual({ inFlight: true });
          }
          expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.05, inFlightUsd: 0.3 });
        }),
      );

      it(
        'lets a later attempt take the key of an owner that is gone: an open row is released, a sent one may have been billed; a settled one first says so, and is bought again (counted) only when asked to',
        withBook(async ({ a, b, advance }) => {
          const open = keyed('k-open', { reserveUsd: 0.1 });
          const sent = keyed('k-sent', { reserveUsd: 0.2 });
          const settled = keyed('k-settled', { reserveUsd: 0.3 });
          for (const r of [open, sent, settled]) await a.admit(r);
          await a.markSent(sent.opId, 'owner-a');
          await a.markSent(settled.opId, 'owner-a');
          await a.settle(settled.opId, settlement(0.25));
          advance(LEASE + 1);
          // The settled call's result may have been kept: the caller is told so, and looks before buying it again.
          expect(await b.admit(keyed('k-settled', { owner: 'owner-b' }))).toEqual({ settledEarlier: true });
          for (const r of [open, sent, settled]) {
            const next = keyed(r.operationKey!, { owner: 'owner-b', reserveUsd: 0.05, ...(r === settled ? { rebuy: true } : {}) });
            expect(await b.admit(next)).toEqual({ admitted: true });
            expect(await b.markSent(next.opId, 'owner-b')).toBe(true);
            // The new row holds the key now.
            expect(await a.admit(keyed(r.operationKey!))).toEqual({ inFlight: true });
          }
          expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.25, inFlightUsd: 0.15, uncertainUsd: 0.2 });
          expect((await a.records('ws')).uncertain).toEqual([expect.objectContaining({ opId: sent.opId, reason: 'interrupted' })]);
        }),
      );

      it(
        'never frees a settled call’s key for rebuy while its holder is live: it is in flight',
        withBook(async ({ a, b }) => {
          const r = keyed('k-live');
          await a.admit(r);
          await a.markSent(r.opId, 'owner-a');
          await a.settle(r.opId, { ...settlement(0.05), holdMs: LEASE });
          expect(await b.admit(keyed('k-live', { owner: 'owner-b', rebuy: true }))).toEqual({ inFlight: true });
        }),
      );

      it(
        'frees the key of a call that ended without an answer at once (released, or may have been billed), live lease or not',
        withBook(async ({ a, b }) => {
          const released = keyed('k-released');
          const abandoned = keyed('k-abandoned');
          for (const r of [released, abandoned]) {
            await a.admit(r);
            await a.markSent(r.opId, 'owner-a');
          }
          await a.release(released.opId);
          await a.abandon(abandoned.opId);
          expect(await b.admit(keyed('k-released', { owner: 'owner-b' }))).toEqual({ admitted: true });
          expect(await b.admit(keyed('k-abandoned', { owner: 'owner-b' }))).toEqual({ admitted: true });
        }),
      );

      it(
        'resumes an accepted call whose owner is gone: the new owner holds it with its job ids, nothing new is reserved, and it settles once',
        withBook(async ({ a, b, advance }) => {
          const first = keyed('k-clip', { kind: 'video', provider: 'fal', model: 'fal-ai/kling', reserveUsd: 0.7 });
          await a.admit(first);
          await a.markSent(first.opId, 'owner-a');
          await a.accept(first.opId, 'generation', 'req-gen');
          advance(LEASE + 1);
          const retry = keyed('k-clip', { owner: 'owner-b', kind: 'video', provider: 'fal', model: 'fal-ai/kling', reserveUsd: 0.7 });
          expect(await b.admit(retry)).toEqual({ resume: { opId: first.opId, jobs: { generation: 'req-gen' } } });
          expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0.7, uncertainUsd: 0 });
          // Held by its new owner: renewed by it, not by the old one.
          advance(LEASE - 1000);
          await b.renew([first.opId], 'owner-b', LEASE);
          advance(2000);
          expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0.7 });
          await b.accept(first.opId, 'extract', 'req-frame');
          await b.settle(first.opId, settlement(0.66));
          expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.66, inFlightUsd: 0, uncertainUsd: 0 });
          expect((await a.unledgered(10)).map((u) => u.opId)).toEqual([first.opId]);
        }),
      );

      it(
        'resumes an accepted call its owner handed back as it stopped (endLeases), and not one the person has cleared',
        withBook(async ({ a, b }) => {
          const clip = (key: string) => keyed(key, { kind: 'video', provider: 'fal', model: 'fal-ai/kling', reserveUsd: 0.7 });
          const stopped = clip('k-stopped');
          const cleared = clip('k-cleared');
          for (const r of [stopped, cleared]) {
            await a.admit(r);
            await a.markSent(r.opId, 'owner-a');
            await a.accept(r.opId, 'generation', `req-${r.operationKey}`);
          }
          await a.endLeases('owner-a');
          expect(await a.clearUncertain('ws', [cleared.opId])).toBe(1);
          expect(await b.admit({ ...clip('k-stopped'), owner: 'owner-b' })).toEqual({ resume: { opId: stopped.opId, jobs: { generation: 'req-k-stopped' } } });
          expect(await b.admit({ ...clip('k-cleared'), owner: 'owner-b' })).toEqual({ admitted: true });
          // The resumed call is in flight again, under its new owner, and no longer counted as may have been billed.
          expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 1.4, uncertainUsd: 0 });
        }),
      );

      it(
        'keeps a settled keyed call held while its caller renews it (keeping its result), and lets it go at once when asked',
        withBook(async ({ a, b, advance }) => {
          const r = keyed('k-memo');
          await a.admit(r);
          await a.markSent(r.opId, 'owner-a');
          // Settled close to the end of its lease: the settlement itself holds it for another lease.
          advance(LEASE - 1000);
          await a.settle(r.opId, { ...settlement(0.05), holdMs: LEASE });
          advance(LEASE - 1000);
          expect(await b.admit(keyed('k-memo', { owner: 'owner-b' }))).toEqual({ inFlight: true });
          await a.renew([r.opId], 'owner-a', LEASE);
          advance(LEASE - 1000);
          expect(await b.admit(keyed('k-memo', { owner: 'owner-b' }))).toEqual({ inFlight: true });
          // Another owner's letGo changes nothing; the owner's frees the key now.
          await b.letGo([r.opId], 'owner-b');
          expect(await b.admit(keyed('k-memo', { owner: 'owner-b' }))).toEqual({ inFlight: true });
          await a.letGo([r.opId], 'owner-a');
          expect(await b.admit(keyed('k-memo', { owner: 'owner-b' }))).toEqual({ settledEarlier: true });
          expect(await b.admit(keyed('k-memo', { owner: 'owner-b', rebuy: true }))).toEqual({ admitted: true });
          // A settled call without a key is never renewed: it is not held by anyone.
          const plain = admitRequest();
          await a.admit(plain);
          await a.markSent(plain.opId, 'owner-a');
          await a.settle(plain.opId, settlement(0.01));
          await a.renew([plain.opId], 'owner-a', LEASE);
          expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.06 });
        }),
      );

      it(
        'lets the settled keyed calls of an owner that stops cleanly go at once, so a step retried on a new worker does not wait out the lease',
        withBook(async ({ a, b }) => {
          const r = keyed('k-stop');
          await a.admit(r);
          await a.markSent(r.opId, 'owner-a');
          await a.settle(r.opId, { ...settlement(0.05), holdMs: LEASE });
          await a.endLeases('owner-a');
          expect(await b.admit(keyed('k-stop', { owner: 'owner-b' }))).toEqual({ settledEarlier: true });
          expect(await b.admit(keyed('k-stop', { owner: 'owner-b', rebuy: true }))).toEqual({ admitted: true });
          expect(await a.spend('ws')).toMatchObject({ spentUsd: 0.05, inFlightUsd: 0.1 });
        }),
      );
    });

    it(
      'admits concurrent calls against one remaining budget exactly as far as it reaches',
      withBook(async ({ a, b }) => {
        const outcomes = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).admit(admitRequest({ reserveUsd: 0.15, caps: { workspaceUsd: 1, runUsd: 10 } }))));
        expect(outcomes.filter((o) => 'admitted' in o)).toHaveLength(6);
        expect(await a.spend('ws')).toMatchObject({ inFlightUsd: 0.9 });
      }),
    );
  });
}
