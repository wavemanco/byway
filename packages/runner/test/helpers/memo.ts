/**
 * Contracts v5 added an idempotency memo to the Store (getMemo/setMemo, first write wins). Tests build the real
 * SqliteStore; until @byway/store implements the memo itself, `withMemo` gives that store an in-memory one with the
 * contract's semantics, so it satisfies `Store`. Once the store has its own memo, that one is used unchanged.
 */
import type { Store } from '@byway/contracts';
import { createStore, type SqliteStore, type StoreOptions } from '@byway/store';

export type MemoStore = SqliteStore & Pick<Store, 'getMemo' | 'setMemo'>;

export function withMemo(store: SqliteStore): MemoStore {
  const own = store as Partial<Pick<Store, 'getMemo' | 'setMemo'>>;
  if (typeof own.getMemo === 'function' && typeof own.setMemo === 'function') return store as MemoStore;
  const memo = new Map<string, string>();
  const keyOf = (runId: string, key: string) => `${runId}\u0000${key}`;
  const added: Pick<Store, 'getMemo' | 'setMemo'> = {
    async getMemo(runId, key) {
      return memo.get(keyOf(runId, key));
    },
    async setMemo(runId, key, value) {
      const k = keyOf(runId, key);
      if (!memo.has(k)) memo.set(k, value);
      return memo.get(k) as string;
    },
  };
  return Object.assign(store, added);
}

/** A temp-dir SqliteStore that satisfies the v5 Store contract. */
export const createTestStore = (opts: StoreOptions): MemoStore => withMemo(createStore(opts));
