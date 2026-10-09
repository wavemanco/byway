/**
 * The Run screen's owner of the person's unsent answers (F06, ADR-0082). RunScreen creates one per run, above every
 * conditional render, so opening a step, the run ending or a stale snapshot can unmount a panel without losing what was
 * typed. Drafts are keyed by checkpoint id, mirrored per checkpoint to sessionStorage (the kinds view/drafts.ts
 * persists), and settled only by server state.
 *
 * Lifecycle, written for StrictMode (which in development runs every effect's setup, cleanup and setup again, and calls
 * useState initializers twice):
 * - creating a store has no side effects (no storage read, no listener, no timer), so a discarded instance is harmless;
 * - load() is idempotent; attach() adds the pagehide flush and returns its removal;
 * - an unmount only flushes and detaches. There is no terminal dispose: the next setup attaches again and every later
 *   write still persists.
 *
 * put() does not notify: a keystroke must not re-render the run screen. Sending, settling and discarding do.
 */
import type { CheckpointRecord, RunStatus } from '@byway/contracts';
import type { CheckpointDraft } from '../../view/checkpoints.ts';
import { decodeStoredDraft, isDirty, persisted, sanitize, settle, startingDraft, unsentText, type StoredDraft } from '../../view/drafts.ts';
import { keysWithPrefix, sessionSlot, type StorageSource } from '../sessionSlot.ts';

const PREFIX = 'byway.draft.';
/** How long typing pauses before a draft is written; pagehide and unmount write at once. */
const DEBOUNCE_MS = 400;

export interface Unsent {
  cp: CheckpointRecord;
  text: string;
}

export interface DraftStore {
  /** Reads this run's kept drafts, once; the store is ready afterwards. */
  load(): void;
  isReady(): boolean;
  /** Flushes on pagehide (reload, closing, leaving the site); returns the removal. */
  attach(target?: EventTarget): () => void;
  /** Writes pending drafts now. The store stays usable. */
  flush(): void;
  /** The draft to open this question's panel with: the kept one, or the untouched starting state. */
  get(cp: CheckpointRecord): CheckpointDraft;
  /** Keeps a change to an unsent draft; ignored while the draft is sent. */
  put(cp: CheckpointRecord, draft: CheckpointDraft): void;
  /** The answer was accepted: lock the turn until a snapshot shows its question closed. Any kind, confirm included. */
  markSent(cp: CheckpointRecord): void;
  isSent(id: string): boolean;
  /**
   * Applies a snapshot byway has just served: drops what is settled, unlocks what the server still shows open. The
   * caller passes only snapshots its refresher applied, never a server-rendered or Back-cached one, which can be older.
   */
  settle(checkpoints: CheckpointRecord[], runStatus: RunStatus): void;
  /** Words left on questions that closed unsent, oldest question first. */
  unsent(checkpoints: CheckpointRecord[], runStatus: RunStatus): Unsent[];
  discard(id: string): void;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
}

export interface DraftStoreOptions {
  storage?: StorageSource;
  debounceMs?: number;
}

export function createDraftStore(runId: string, opts: DraftStoreOptions = {}): DraftStore {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const slot = (id: string) => sessionSlot(`${PREFIX}${id}`, decodeStoredDraft, opts.storage);
  const memory = new Map<string, StoredDraft>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  let loaded = false;
  let version = 0;

  const notify = () => {
    version++;
    for (const l of listeners) l();
  };
  const cancel = (id: string) => {
    const timer = pending.get(id);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(id);
  };
  const write = (id: string) => {
    cancel(id);
    const entry = memory.get(id);
    if (entry && persisted(entry.kind)) slot(id).save(entry);
    else slot(id).clear();
  };
  const remove = (id: string) => {
    cancel(id);
    memory.delete(id);
    slot(id).clear();
  };
  const flush = () => {
    for (const id of [...pending.keys()]) write(id);
  };

  return {
    load() {
      if (loaded) return;
      loaded = true;
      for (const key of keysWithPrefix(`${PREFIX}${runId}/`, opts.storage)) {
        const id = key.slice(PREFIX.length);
        const entry = slot(id).load();
        // What this page already holds is newer than what an earlier page kept.
        if (entry && entry.id === id && !memory.has(id)) memory.set(id, entry);
      }
      notify();
    },
    isReady: () => loaded,
    attach(target?: EventTarget) {
      const on = target ?? (typeof window === 'undefined' ? undefined : window);
      if (!on) return () => undefined;
      on.addEventListener('pagehide', flush);
      return () => on.removeEventListener('pagehide', flush);
    },
    flush,
    get(cp) {
      const entry = memory.get(cp.id);
      return (entry && sanitize(cp, entry)) ?? startingDraft(cp);
    },
    put(cp, draft) {
      // A sent answer is what byway accepted: it stays as sent (and locked) until server state settles it. Otherwise an
      // edit would clear the lock, and once byway confirmed the original the edit would be listed as never sent.
      if (memory.get(cp.id)?.sent) return;
      if (!isDirty(cp, draft)) {
        if (memory.has(cp.id)) remove(cp.id);
        return;
      }
      memory.set(cp.id, { id: cp.id, kind: cp.kind, draft });
      if (!persisted(cp.kind)) return;
      cancel(cp.id);
      pending.set(
        cp.id,
        setTimeout(() => write(cp.id), debounceMs),
      );
    },
    markSent(cp) {
      const entry = memory.get(cp.id) ?? { id: cp.id, kind: cp.kind, draft: startingDraft(cp) };
      memory.set(cp.id, { ...entry, sent: true });
      write(cp.id);
      notify();
    },
    isSent: (id) => memory.get(id)?.sent === true,
    settle(checkpoints, runStatus) {
      const byId = new Map(checkpoints.map((c) => [c.id, c]));
      let changed = false;
      for (const [id, entry] of [...memory]) {
        const outcome = settle(entry, byId.get(id), runStatus);
        if (outcome === 'drop') {
          remove(id);
          changed = true;
        } else if (outcome === 'unlock') {
          const { sent: _sent, ...unlocked } = entry;
          memory.set(id, unlocked);
          write(id);
          changed = true;
        }
      }
      if (changed) notify();
    },
    unsent(checkpoints, runStatus) {
      const out: Unsent[] = [];
      for (const cp of [...checkpoints].sort((a, b) => a.openedAt.localeCompare(b.openedAt))) {
        const entry = memory.get(cp.id);
        if (entry && settle(entry, cp, runStatus) === 'unsent') out.push({ cp, text: unsentText(cp, entry.draft) });
      }
      return out;
    },
    discard(id) {
      remove(id);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}
