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
 */
import { createHash, randomBytes } from 'node:crypto';
import type { CompletionResult, Gateway, Store } from '@byway/contracts';

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

/** The gateway one activity invocation sees: provider calls memoized under its scope, everything else passed through. */
export function memoGateway(inner: Gateway, store: MemoStore, scope: MemoScope): Gateway {
  const repeats = new Map<string, number>();
  const keyOf = (kind: string, request: unknown): string => {
    const at = `${kind}/${hashOf(request)}`;
    const n = (repeats.get(at) ?? 0) + 1;
    repeats.set(at, n);
    return `${scope.key}/${at}/${n}`;
  };
  async function once<T>(kind: string, request: unknown, call: () => Promise<T>, save: (r: T) => Promise<string>, load: (v: string) => Promise<T>): Promise<T> {
    const key = keyOf(kind, request);
    const hit = await store.getMemo(scope.runId, key);
    if (hit !== undefined) return load(hit);
    const result = await call();
    const saved = await save(result);
    const kept = await store.setMemo(scope.runId, key, saved);
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
        () => inner.complete(req),
        (r) => saveCompletion(store, r),
        (v) => loadCompletion(store, v),
      ),
    image: (req) => once('image', req, () => inner.image(req), asJson, fromJson),
    video: (req) => once('video', req, () => inner.video(req), asJson, fromJson),
    spend: (id) => inner.spend(id),
    providers: () => inner.providers(),
    profiles: () => inner.profiles(),
    profileStatus: () => inner.profileStatus(),
    verifyLedger: () => inner.verifyLedger(),
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
