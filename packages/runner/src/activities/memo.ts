/**
 * Idempotent provider calls (ENG-3, ENG-12, convention C5). Temporal runs an activity at least once: a step whose
 * provider call succeeded but whose local work then failed (a store write, an event) is retried from the start, and a
 * step refused by the budget runs again from the start once the person raises it. Either way the calls it already
 * made were billed, so each model, image and video call is memoized (Store.setMemo, first write wins) under its step
 * call's key, and the step run again gets the same answers without paying again.
 *
 * A call's memo key is the step call's key, the kind of call, a hash of the request, and which repeat of that request
 * it is within the activity: the same request asked twice on purpose (two critic shuffles over one lineup) is two
 * calls, and a request that differs on the retry (a new prompt) is a new call. What makes a request is kept stable
 * across retries: the SEED string and the critic's random draws are memoized too (memoized, seededRandom).
 *
 * Keeping a paid answer is not left to Temporal (ENG-3): if the memo write (or, for a long answer, its artifact write)
 * fails after the provider answered, a Temporal retry would find no memo and buy the call again. So the save is
 * retried here, a few times with growing pauses, and if it still fails the step fails for good with a plain message:
 * the call was paid for and is in the spending ledger.
 *
 * Overlapping attempts (stage 3; ADR-0099). Temporal starts a second attempt of a step while the first may still run:
 * after a timeout, or a worker it lost touch with. The memo cannot tell them apart, because the first records its
 * answer only after the call. So each call carries an operation key (the run and its memo key, added after hashing, so
 * memo keys are unchanged) and the invocation's signals, and the spend book holds the call for its first attempt: a
 * second attempt's call is refused 'in-flight', and it waits, looking for the first one's memo every couple of seconds
 * and asking the gateway again now and then (the holder may be gone, and then the call is taken over or resumed). It
 * honours its own cancel, and after five minutes stops with a plain message rather than pay again.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { CompletionResult, Gateway, SpendContext, Store } from '@byway/contracts';
import { StepError } from './failures.ts';

/** Where an activity invocation's memos live: its run, and its step call's key (StepCall.key). */
export interface MemoScope {
  runId: string;
  key: string;
}

type MemoStore = Pick<Store, 'getMemo' | 'setMemo' | 'artifacts'>;

/** A memo value holds a reference, not content (Store.setMemo): answers longer than this go in an artifact. */
const MAX_INLINE_BYTES = 60_000;

const hashOf = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);

/** A completion as its memo: inline when short, else in an artifact of its own (JSON, so it never shares the work's bytes). */
async function saveCompletion(store: MemoStore, result: CompletionResult): Promise<string> {
  const inline = JSON.stringify({ result });
  if (Buffer.byteLength(inline, 'utf8') <= MAX_INLINE_BYTES) return inline;
  const { text, ...rest } = result;
  const kept = await store.artifacts.putText(JSON.stringify({ memo: 'completion', text }), 'application/json');
  return JSON.stringify({ result: rest, textArtifactId: kept.id });
}

async function loadCompletion(store: MemoStore, value: string): Promise<CompletionResult> {
  const memo = JSON.parse(value) as { result: CompletionResult } | { result: Omit<CompletionResult, 'text'>; textArtifactId: string };
  if (!('textArtifactId' in memo)) return memo.result;
  const { text } = JSON.parse(await store.artifacts.getText(memo.textArtifactId)) as { text: string };
  return { ...memo.result, text };
}

export interface MemoOptions {
  /** How many times saving a paid answer is tried before the step fails for good. */
  saveAttempts?: number;
  /** The pause before the second try; it doubles before each try after that. */
  saveDelayMs?: number;
  /**
   * This invocation's signals (Invocation.done, Temporal's cancel), passed with each call's operation key so the spend
   * book holds the call for this attempt (SpendContext.operation). Absent: calls carry no key (unit tests of the memo).
   */
  operation?: Omit<NonNullable<SpendContext['operation']>, 'key'>;
  /** While another attempt holds a call: how often its memo is looked for (default 2 s)… */
  waitPollMs?: number;
  /** …how often the gateway is asked again (default 10 s; its holder may be gone)… */
  recallEveryMs?: number;
  /** …and how long the wait may last before the step stops (default 5 minutes). */
  waitLimitMs?: number;
}

const WAIT_POLL_MS = 2_000;
const RECALL_EVERY_MS = 10_000;
const WAIT_LIMIT_MS = 5 * 60_000;

/**
 * The gateway's refusal of a call another attempt holds (GatewayError 'in-flight'), by name and code: 'held' while that
 * attempt is under way or keeping its result, 'settled' when it settled the call and has ended (settledEarlier).
 */
const inFlight = (e: unknown): 'held' | 'settled' | undefined => {
  const err = e as { name?: unknown; code?: unknown; settledEarlier?: unknown } | null;
  if (err?.name !== 'GatewayError' || err.code !== 'in-flight') return undefined;
  return err.settledEarlier === true ? 'settled' : 'held';
};

/**
 * Four tries with pauses of 0.5, 1 and 2 s: with SQLite's own 10 s busy wait in each, a locked database is waited out
 * for about 45 s at most, and the event loop is free between tries for the activity's heartbeats (timeout 30 s).
 */
const SAVE_ATTEMPTS = 4;
const SAVE_DELAY_MS = 500;

/** What a paid call returned, as the failure message names it. */
const PAID: Record<string, string> = { complete: 'AI model’s answer', image: 'image', video: 'video clip' };

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The gateway one activity invocation sees: provider calls memoized under its scope, everything else passed through. */
export function memoGateway(inner: Gateway, store: MemoStore, scope: MemoScope, opts: MemoOptions = {}): Gateway {
  const attempts = Math.max(1, opts.saveAttempts ?? SAVE_ATTEMPTS);
  const delay = opts.saveDelayMs ?? SAVE_DELAY_MS;
  const pollMs = opts.waitPollMs ?? WAIT_POLL_MS;
  const recallMs = opts.recallEveryMs ?? RECALL_EVERY_MS;
  const limitMs = opts.waitLimitMs ?? WAIT_LIMIT_MS;
  const repeats = new Map<string, number>();
  const keyOf = (kind: string, request: unknown): string => {
    const at = `${kind}/${hashOf(request)}`;
    const n = (repeats.get(at) ?? 0) + 1;
    repeats.set(at, n);
    return `${scope.key}/${at}/${n}`;
  };
  /**
   * The call, or, while another attempt holds it (in-flight), that attempt's answer once it is kept: the memo is looked
   * for every pollMs and the gateway asked again every recallMs, for at most limitMs. A cancel of this attempt ends the
   * wait at the next ask, which the invocation's gateway refuses as stopped. When the gateway says an earlier attempt
   * settled the call and has ended, the memo is looked for at once, after that answer: a holder keeps its result before
   * it ends, so a result that was kept is found, and only when there is none is the call bought again (rebuy).
   */
  async function callOrWait<T>(kind: string, key: string, call: (rebuy: boolean) => Promise<T>, load: (v: string) => Promise<T>): Promise<{ made: T } | { kept: T }> {
    const started = Date.now();
    let rebuy = false;
    for (;;) {
      try {
        return { made: await call(rebuy) };
      } catch (e) {
        const held = inFlight(e);
        if (!held) throw e;
        if (held === 'settled') {
          const hit = await store.getMemo(scope.runId, key);
          if (hit !== undefined) return { kept: await load(hit) };
          if (!rebuy) {
            rebuy = true;
            continue;
          }
        }
        rebuy = false;
      }
      const recall = Date.now() + recallMs;
      while (Date.now() < recall && !opts.operation?.cancel?.aborted) {
        if (Date.now() - started >= limitMs) {
          throw new StepError(
            `Another attempt of this step’s ${PAID[kind] ?? 'AI call'} is still under way, so this attempt stopped after waiting rather than pay for it a second time. Start the run again.`,
          );
        }
        await pause(Math.min(pollMs, Math.max(1, recall - Date.now())));
        const hit = await store.getMemo(scope.runId, key);
        if (hit !== undefined) return { kept: await load(hit) };
      }
    }
  }

  async function once<T>(kind: string, request: object, call: (req: never) => Promise<T>, save: (r: T) => Promise<string>, load: (v: string) => Promise<T>): Promise<T> {
    const key = keyOf(kind, request);
    const hit = await store.getMemo(scope.runId, key);
    if (hit !== undefined) return load(hit);
    // The operation joins the request after the memo key was made from it, so memo keys are unchanged.
    const sent = (rebuy: boolean) =>
      opts.operation ? { ...request, operation: { key: `${scope.runId}/${key}`, ...opts.operation, ...(rebuy ? { rebuy: true } : {}) } } : request;
    const outcome = await callOrWait(kind, key, (rebuy) => call(sent(rebuy) as never), load);
    if ('kept' in outcome) return outcome.kept;
    const result = outcome.made;
    // From here on the call is paid for: keep its answer, retrying here (see the header), never by Temporal.
    let saved = '';
    let kept = '';
    for (let n = 1; ; n++) {
      try {
        saved = await save(result);
        kept = await store.setMemo(scope.runId, key, saved);
        break;
      } catch (e) {
        if (n >= attempts) {
          const reason = (e as Error)?.message ?? String(e);
          throw new StepError(
            `The ${PAID[kind] ?? 'AI call'} for this step was paid for and is recorded in the spending ledger, but byway could not keep it (${reason}). The step stops here rather than run again, which would pay for the call a second time.`,
          );
        }
        await pause(delay * 2 ** (n - 1));
      }
    }
    // A racing attempt that kept its answer first wins: every caller goes on with the one answer that was kept.
    return kept === saved ? result : load(kept);
  }
  const asJson = async <T>(r: T) => JSON.stringify(r);
  const fromJson = async <T>(v: string) => JSON.parse(v) as T;
  return {
    get demo() {
      return inner.demo;
    },
    complete: (req) =>
      once(
        'complete',
        req,
        (sent: typeof req) => inner.complete(sent),
        (r) => saveCompletion(store, r),
        (v) => loadCompletion(store, v),
      ),
    image: (req) => once('image', req, (sent: typeof req) => inner.image(sent), asJson, fromJson),
    video: (req) => once('video', req, (sent: typeof req) => inner.video(sent), asJson, fromJson),
    spend: (id) => inner.spend(id),
    providers: () => inner.providers(),
    profiles: () => inner.profiles(),
    profileStatus: () => inner.profileStatus(),
    verifyLedger: () => inner.verifyLedger(),
    spendRecords: (id) => inner.spendRecords(id),
    auditLedger: () => inner.auditLedger(),
    // One invocation's view: the gateway it wraps is shared by the worker and closed by whoever made it.
    close: async () => undefined,
  };
}

/** The value memoized under `key` for the run, made (and kept, first write wins) when there is none yet. */
export async function memoized(store: Pick<Store, 'getMemo' | 'setMemo'>, runId: string, key: string, make: () => string | Promise<string>): Promise<string> {
  const hit = await store.getMemo(runId, key);
  if (hit !== undefined) return hit;
  return store.setMemo(runId, key, await make());
}

/** A fresh random salt, for seededRandom. */
export const newSalt = (): string => randomBytes(16).toString('hex');

/** Uniform [0, 1) draws from a salt: the same salt gives the same draws, so a retried step shuffles the same way. */
export function seededRandom(salt: string): () => number {
  let counter = 0;
  let pool: Buffer = Buffer.alloc(0);
  let at = 0;
  return () => {
    if (at + 4 > pool.length) {
      pool = createHash('sha256').update(`${salt}:${counter++}`).digest();
      at = 0;
    }
    const n = pool.readUInt32BE(at);
    at += 4;
    return n / 2 ** 32;
  };
}

/** An activity input's memo scope, when it is a step call of a run. */
export function memoScopeOf(input: unknown): MemoScope | undefined {
  const i = input as { run?: { runId?: unknown }; call?: { key?: unknown } } | undefined;
  const runId = i?.run?.runId;
  const key = i?.call?.key;
  return typeof runId === 'string' && typeof key === 'string' ? { runId, key } : undefined;
}
