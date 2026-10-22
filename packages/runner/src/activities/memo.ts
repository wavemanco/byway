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
 * the call was paid for and is in the spending ledger. That failure is a StepError marked billed (PaidNotKept), so the
 * asset step can say which image it was, as it does for the gateway's billed failures (asset.ts billedStop).
 *
 * Overlapping attempts (stage 3; ADR-0099). Temporal starts a second attempt of a step while the first may still run:
 * after a timeout, or a worker it lost touch with. The memo cannot tell them apart, because the first records its
 * answer only after the call. So each call carries an operation key (the run and its memo key, added after hashing, so
 * memo keys are unchanged) and the invocation's signals, and the spend book holds the call for its first attempt: a
 * second attempt's call is refused 'in-flight', and it waits, looking for the first one's memo every couple of seconds
 * and asking the gateway again now and then (the holder may be gone, and then the call is taken over or resumed). It
 * honours its own cancel, and after five minutes stops with a plain message rather than pay again.
 *
 * Declines (ADR-0102). The gateway asks a declining model once more, as a call of its own, and a step that runs again
 * must never buy the declined call again. So a decline is kept like an answer, twice over: the gateway hands it over
 * once the declined call is ledgered and before the retry is admitted (operation.keepDecline), and it is kept under the
 * call's memo key plus `/declined`; then the call's final outcome is kept under the memo key as any outcome is: the
 * retry's answer, or the gateway's final 'refused', which a step run again gets back word for word and asks nothing. A
 * step that runs again with only the decline kept (its earlier attempt ended during the retry: a crash, a timeout, a
 * stop) asks the gateway for the retry alone (operation.declinedEarlier). If byway did not start that retry (it is
 * stopping, or the step was stopped), the attempt ends with a plain error that Temporal tries again (DeclineRetryPending),
 * never as a failed image the asset step would try again under a new key. What is not covered: a worker that dies in the
 * moment between a provider's answer being settled and its keeping (the decline's, or the retry's outcome) leaves
 * nothing kept, and the next attempt buys that call again, as for any answer (ADR-0099).
 */
import { createHash, randomBytes } from 'node:crypto';
import { GatewayError, type CompletionResult, type DeclinedAttempt, type DeclineRecord, type Gateway, type SpendContext, type Store } from '@byway/contracts';
import { DeclineRetryPending, StepError } from './failures.ts';

/**
 * A paid call whose result byway could not keep (see the header): the provider was paid, as a GatewayError's `billed`
 * mark says. Still a StepError, so model, image and video calls fail as before; the mark lets the asset step add which
 * image it was and what that leaves (asset.ts billedStop).
 */
export class PaidNotKept extends StepError {
  readonly billed = true;
}

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
/** What a model declined, as the failure message names it (ADR-0102). */
const DECLINED: Record<string, string> = { complete: 'a request this step made', image: 'an image this step asked for' };

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The gateway's final decline (ADR-0102): 'refused', carrying the decline and what became of the retry. By name and code. */
const finalDecline = (e: unknown): (GatewayError & { declined: DeclineRecord }) | undefined => {
  const err = e as { name?: unknown; code?: unknown; declined?: { ledgerEntryId?: unknown } } | null;
  return err?.name === 'GatewayError' && err.code === 'refused' && typeof err.declined?.ledgerEntryId === 'string' ? (e as GatewayError & { declined: DeclineRecord }) : undefined;
};

/** A call byway did not start ('byway-failure', not billed: it is stopping, could not record it as sent, or the step was stopped). */
const notStarted = (e: unknown): e is GatewayError => {
  const err = e as { name?: unknown; code?: unknown; billed?: unknown } | null;
  return err?.name === 'GatewayError' && err.code === 'byway-failure' && err.billed === false;
};

/** A final decline as the memo keeps it, and as a step run again gets it back: the same error, word for word. */
interface DeclineMemo {
  declinedCall: { message: string; billed?: boolean; declined: DeclineRecord };
}

const declineMemo = (err: GatewayError & { declined: DeclineRecord }): string =>
  JSON.stringify({ declinedCall: { message: err.message, ...(err.billed !== undefined ? { billed: err.billed } : {}), declined: err.declined } } satisfies DeclineMemo);

/** The final decline a memo value holds, as the gateway threw it; undefined for an answer. */
function keptDecline(value: string): GatewayError | undefined {
  let memo: Partial<DeclineMemo> | null;
  try {
    memo = JSON.parse(value) as Partial<DeclineMemo> | null;
  } catch {
    return undefined;
  }
  const d = memo?.declinedCall;
  if (typeof d !== 'object' || d === null) return undefined;
  return new GatewayError('refused', d.message, false, { declined: d.declined, ...(d.billed !== undefined ? { billed: d.billed } : {}) });
}

/** A kept outcome: the answer, or the final decline the call ended with. */
type Kept<T> = { value: T } | { error: GatewayError };

const unwrap = <T>(kept: Kept<T>): T => {
  if ('error' in kept) throw kept.error;
  return kept.value;
};

/** The first sentence of a message, without its stop. */
const firstSentence = (message: string): string => (message.split(/(?<=[.!?])\s/)[0] ?? message).replace(/[\s.]+$/, '');

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
   * The call, or, while another attempt holds it (in-flight), that attempt's outcome once it is kept (an answer, or a final
   * decline): the memo is looked for every pollMs and the gateway asked again every recallMs, for at most limitMs. A
   * cancel of this attempt ends the wait at the next ask, which the invocation's gateway refuses as stopped. When the
   * gateway says an earlier attempt settled the call and has ended, the memo is looked for at once, after that answer: a
   * holder keeps its result before it ends, so a result that was kept is found, and only when there is none is the call
   * bought again (rebuy).
   */
  async function callOrWait<M, K>(kind: string, key: string, call: (rebuy: boolean) => Promise<M>, load: (v: string) => Promise<K>): Promise<{ made: M } | { kept: K }> {
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

  /**
   * Keeps a value under `key` (first write wins), retrying here (see the header), never by Temporal: what was saved, and
   * what is kept (another attempt's, when it wrote first). When it still cannot, `failed` is the step's failure.
   */
  async function persist(key: string, make: () => Promise<string>, failed: (reason: string) => Error): Promise<{ saved: string; kept: string }> {
    for (let n = 1; ; n++) {
      try {
        const saved = await make();
        return { saved, kept: await store.setMemo(scope.runId, key, saved) };
      } catch (e) {
        if (n >= attempts) throw failed((e as Error)?.message ?? String(e));
        await pause(delay * 2 ** (n - 1));
      }
    }
  }

  async function once<T>(kind: string, request: object, call: (req: never) => Promise<T>, save: (r: T) => Promise<string>, load: (v: string) => Promise<T>): Promise<T> {
    const key = keyOf(kind, request);
    // What is kept under the key: an answer, or the call's final decline, thrown again as the gateway threw it (ADR-0102).
    const loadKept = async (v: string): Promise<Kept<T>> => {
      const declined = keptDecline(v);
      return declined ? { error: declined } : { value: await load(v) };
    };
    const hit = await store.getMemo(scope.runId, key);
    if (hit !== undefined) return unwrap(await loadKept(hit));
    // A decline kept before its retry (ADR-0102): a later attempt asks the gateway for the retry alone.
    const declineKey = `${key}/declined`;
    const keepDecline = async (first: DeclinedAttempt): Promise<void> => {
      await persist(declineKey, async () => JSON.stringify(first), (reason) => new Error(reason));
    };
    // The operation joins the request after the memo key was made from it, so memo keys are unchanged.
    const sent = async (rebuy: boolean) => {
      if (!opts.operation) return request;
      const earlier = await store.getMemo(scope.runId, declineKey);
      const decline = earlier !== undefined ? { declinedEarlier: JSON.parse(earlier) as DeclinedAttempt } : { keepDecline };
      return { ...request, operation: { key: `${scope.runId}/${key}`, ...opts.operation, ...(rebuy ? { rebuy: true } : {}), ...decline } };
    };
    let outcome: { made: T } | { kept: Kept<T> };
    try {
      outcome = await callOrWait(kind, key, async (rebuy) => call((await sent(rebuy)) as never), loadKept);
    } catch (e) {
      const declined = finalDecline(e);
      if (declined) {
        // The call's outcome, as an answer would be: kept, so the step run again gets it back and asks nothing.
        const { saved, kept } = await persist(
          key,
          async () => declineMemo(declined),
          (reason) =>
            new StepError(`The model declined ${DECLINED[kind] ?? 'a call this step made'}, and byway could not keep that outcome (${reason}). The step stops here rather than run again, which could ask the model again.`),
        );
        if (kept === saved) throw declined;
        return unwrap(await loadKept(kept));
      }
      // The retry of a kept decline, not started: no outcome. The step's next attempt asks for the retry alone. The words
      // say what byway does, since no one can try a step of a run again: Temporal tries it while it has tries left, and
      // the person reads this only when none was (the run's failure is the last attempt's message).
      if (notStarted(e) && (await store.getMemo(scope.runId, declineKey)) !== undefined) {
        throw new DeclineRetryPending(
          `The model declined ${DECLINED[kind] ?? 'a call this step made'}, and this attempt of the step ended before byway could ask it once more (${firstSentence(e.message)}). byway tries the step again while it has tries left, and that try asks the model once more without buying the declined call again. If this was the step’s last try, the run stops here: start the run again.`,
          { cause: e },
        );
      }
      throw e;
    }
    if ('kept' in outcome) return unwrap(outcome.kept);
    const result = outcome.made;
    // From here on the call is paid for: keep its answer, retrying here (see the header), never by Temporal.
    const { saved, kept } = await persist(
      key,
      () => save(result),
      (reason) =>
        new PaidNotKept(
          `The ${PAID[kind] ?? 'AI call'} for this step was paid for and is recorded in the spending ledger, but byway could not keep it (${reason}). The step stops here rather than run again, which would pay for the call a second time.`,
        ),
    );
    // A racing attempt that kept its outcome first wins: every caller goes on with the one outcome that was kept.
    return kept === saved ? result : unwrap(await loadKept(kept));
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
