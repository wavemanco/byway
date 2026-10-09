import { createHash, randomUUID } from 'node:crypto';
import { promises as nodeFs } from 'node:fs';
import { basename, dirname } from 'node:path';
import { CanonicalizationError, canonicalize, contentHash } from '@byway/canonical';
import { ledgerEntryProblem, type EntryLine, type LedgerBatch, type LedgerCursor, type LedgerEntry, type UnreadableLine } from '@byway/contracts';

/**
 * The gateway's entry is the contract's LedgerEntry, upstream host (OpenRouter) included; the name is kept for existing
 * imports. Every field, upstreamProvider too, is covered by the hash.
 */
export type GatewayLedgerEntry = LedgerEntry;

/** What the gateway supplies; the ledger assigns id, seq, time and the chain links. */
export type LedgerDraft = Omit<GatewayLedgerEntry, 'id' | 'seq' | 'at' | 'prevHash' | 'hash'>;

/** The previous-hash of the first entry. */
export const GENESIS_HASH = `sha256:${'0'.repeat(64)}`;

interface Head {
  seq: number;
  id: string;
  hash: string;
}

/** The file operations the ledger uses: node's promise API by default; tests replace single calls to inject failures. */
export type LedgerFs = Pick<typeof nodeFs, 'open' | 'stat' | 'rm' | 'mkdir' | 'appendFile' | 'writeFile' | 'rename' | 'readFile'>;

export interface LedgerOptions {
  /** The JSONL file. A sibling `<path>.head` records the last entry so a truncated tail is detectable. */
  path: string;
  now?: () => Date;
  /** How long to wait for the cross-process lock before failing. */
  lockTimeoutMs?: number;
  /** A lock older than this is presumed left by a crashed process and broken. */
  staleLockMs?: number;
  /** Replaces some of node's file operations (tests inject Windows' transient errors). */
  fs?: Partial<LedgerFs>;
}

/**
 * Errors that mean "someone else is using the lock file right now", so the right move is to wait and try again:
 * EEXIST (it is held) and, on Windows, EPERM, EBUSY and EACCES, which `open(…, 'wx')` returns while another process is
 * still deleting the lock file (the name stays taken until its last handle closes) or briefly holds it open to stat it.
 */
const LOCK_CONTENTION = new Set(['EEXIST', 'EPERM', 'EBUSY', 'EACCES']);
/** The transient subset of {@link LOCK_CONTENTION} that is not "held": the lock may not be judged stale from these. */
const WINDOWS_TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);

const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

/** Drop undefined-valued keys: canonical JSON has no undefined, and absent must hash the same as omitted. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The chain hash: SHA-256 of the RFC 8785 canonical form of the entry without its own hash (CR7). */
export function entryHash(entry: Omit<GatewayLedgerEntry, 'hash'>): string {
  return contentHash(defined(entry));
}

/**
 * The chain hash of a stored line read back, or undefined when it has none: a damaged line can hold text with no
 * canonical form (a lone surrogate written as a JSON \u escape, a number too large for JSON). verify() reports such a
 * line as broken; it does not throw on it (F19).
 */
function expectedHash(entry: Omit<GatewayLedgerEntry, 'hash'>): string | undefined {
  try {
    return entryHash(entry);
  } catch (e) {
    if (e instanceof CanonicalizationError) return undefined;
    throw e;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stored line read back as an entry the chain can continue from, or undefined (not JSON, not an entry). */
function chainable(line: string): GatewayLedgerEntry | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const e = parsed as Partial<GatewayLedgerEntry>;
    return Number.isSafeInteger(e.seq) && (e.seq as number) >= 1 && typeof e.hash === 'string' ? (parsed as GatewayLedgerEntry) : undefined;
  } catch {
    return undefined;
  }
}

/** A head record as append writes it, or undefined when the text is not one (not JSON, a seq below 1, a field missing). */
function headOf(text: string): Head | undefined {
  try {
    const h = JSON.parse(text) as Partial<Head> | null;
    if (h === null || typeof h !== 'object' || Array.isArray(h)) return undefined;
    return Number.isSafeInteger(h.seq) && (h.seq as number) >= 1 && typeof h.id === 'string' && typeof h.hash === 'string' ? (h as Head) : undefined;
  } catch {
    return undefined;
  }
}

/** Where the spend book starts reading a ledger it has never read. */
export const LEDGER_START: LedgerCursor = { offset: 0, tailStart: 0, tailSha256: null };

const lineHash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** How much of a line that is not an entry a fault keeps, for the person to recognise it. */
const EXCERPT_CHARS = 120;

/**
 * A stored line as the spend book absorbs it (ADR-0095): the entry, or why it is not one the book can count (not JSON,
 * or a field the book records missing or of the wrong type: ledgerEntryProblem in @byway/contracts). Stricter than
 * entries(), which sums any JSON line: what the book cannot count, it must not count as nothing, so it becomes a fault
 * that blocks paid calls until the person looks.
 */
export function readLedgerLine(line: string): { entry: GatewayLedgerEntry } | { problem: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { problem: 'it is not JSON' };
  }
  const problem = ledgerEntryProblem(parsed);
  return problem === undefined ? { entry: parsed as GatewayLedgerEntry } : { problem };
}

/** A stored line as an entry the spend book can count, or undefined (see readLedgerLine for why not). */
export function absorbable(line: string): GatewayLedgerEntry | undefined {
  const read = readLedgerLine(line);
  return 'entry' in read ? read.entry : undefined;
}

/** What the drain may do while it holds the ledger's lock (Ledger.exclusive). */
export interface LockedLedger {
  readFrom(cursor: LedgerCursor): Promise<LedgerBatch>;
  append(draft: LedgerDraft, opts?: { id?: string; at?: string }): Promise<GatewayLedgerEntry>;
}

/** A file name stamp without colons, which Windows refuses: 2026-10-08T12:13:14.123Z becomes 20261008T121314123Z. */
const fileStamp = (at: Date) => at.toISOString().replace(/[-:.]/g, '');

/**
 * On Windows a rename onto, or a delete of, a file another process has open fails briefly with EPERM, EBUSY or
 * EACCES; try again a bounded number of times.
 */
async function retryTransient(op: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      if (attempt >= 20 || !WINDOWS_TRANSIENT.has(errCode(e) ?? '')) throw e;
      await sleep(10 + attempt * 5);
    }
  }
}

/** Backoff between lock attempts: 5, 10, 20, 40, then 80 ms, each with up to 20 ms of jitter so waiters spread out. */
const lockBackoffMs = (attempt: number) => 5 * 2 ** Math.min(attempt, 4) + Math.floor(Math.random() * 20);

/**
 * Append-only, hash-chained JSONL ledger of every model call (spec §6, CR7-style). Each line is the canonical JSON of
 * one entry; `prevHash` links it to the line before, so an edit, a deletion or a reorder breaks the chain. The worker
 * and the web app may both append, so appends take an exclusive lock file and read the current tail under it.
 * Limits: the chain and head file detect tampering by anyone who does not also rewrite every later hash and the head;
 * anchoring the head outside the data directory is future work.
 */
export class Ledger {
  readonly path: string;
  private readonly headPath: string;
  private readonly lockPath: string;
  private readonly now: () => Date;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  private readonly fs: LedgerFs;
  /** Serializes this instance's appends so they do not contend for the file lock among themselves. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Incremental read cache for entries(). */
  private cache: { offset: number; entries: GatewayLedgerEntry[] } = { offset: 0, entries: [] };
  /**
   * Serializes this instance's reads: two overlapping entries() calls would otherwise both read from the same cache
   * offset, and the slower one (sized before the faster one advanced it) would ask for a negative number of bytes.
   */
  private reads: Promise<unknown> = Promise.resolve();
  /** The last verify() result, with the sizes and modification times of the ledger and its head it was computed from. */
  private verified: { key: string; result: string | null } | undefined;

  constructor(opts: LedgerOptions) {
    this.path = opts.path;
    this.headPath = `${opts.path}.head`;
    this.lockPath = `${opts.path}.lock`;
    this.now = opts.now ?? (() => new Date());
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 10_000;
    this.staleLockMs = opts.staleLockMs ?? 30_000;
    this.fs = { ...nodeFs, ...opts.fs };
  }

  /**
   * Appends one entry. `lockTimeoutMs` overrides the wait for the cross-process lock for this append: the gateway
   * appends only calls a provider has already billed, and waits long for those rather than lose one (ENG-3).
   */
  append(draft: LedgerDraft, opts: { lockTimeoutMs?: number } = {}): Promise<GatewayLedgerEntry> {
    const run = this.queue.then(() => this.withLock(() => this.appendLocked(draft), opts.lockTimeoutMs ?? this.lockTimeoutMs));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Runs `fn` holding the cross-process lock, after setting aside a torn tail, so the spend book's outbox can read what
   * is new and append entries with the ids it chose (ADR-0095) with nobody appending in between. `lockTimeoutMs` bounds
   * the wait for the lock.
   */
  exclusive<T>(fn: (ledger: LockedLedger) => Promise<T>, opts: { lockTimeoutMs?: number } = {}): Promise<T> {
    const locked: LockedLedger = { readFrom: (cursor) => this.readFrom(cursor), append: (draft, o) => this.appendLocked(draft, o) };
    const run = this.queue.then(() =>
      this.withLock(async () => {
        await this.repairTail();
        return fn(locked);
      }, opts.lockTimeoutMs ?? this.lockTimeoutMs),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async appendLocked(draft: LedgerDraft, opts: { id?: string; at?: string } = {}): Promise<GatewayLedgerEntry> {
    await this.repairTail();
    const last = await this.lastEntry();
    const body = defined({
      ...draft,
      id: opts.id ?? randomUUID(),
      seq: (last?.seq ?? 0) + 1,
      at: opts.at ?? this.now().toISOString(),
      prevHash: last?.hash ?? GENESIS_HASH,
    }) as Omit<GatewayLedgerEntry, 'hash'>;
    const entry: GatewayLedgerEntry = { ...body, hash: entryHash(body) };
    await this.fs.appendFile(this.path, `${canonicalize(entry)}\n`, 'utf8');
    // The line is the record: from here the entry is in the ledger. The head only lets verify() notice a truncated tail,
    // and verify() accepts a head that lags the file, so a head that cannot be rewritten now is caught up by the next
    // append. Failing here would tell the caller the entry is missing when it is not, and a retry would append it twice.
    const head: Head = { seq: entry.seq, id: entry.id, hash: entry.hash };
    const tmp = `${this.headPath}.${process.pid}.tmp`;
    try {
      await this.fs.writeFile(tmp, JSON.stringify(head), 'utf8');
      await retryTransient(() => this.fs.rename(tmp, this.headPath));
    } catch {
      await this.fs.rm(tmp, { force: true }).catch(() => undefined);
    }
    return entry;
  }

  /**
   * Runs `fn` holding the cross-process lock file. Contention (see {@link LOCK_CONTENTION}) is retried with backoff
   * until `lockTimeoutMs`, then fails with an error naming the last code; any other error fails at once. Only a lock
   * that exists and is older than `staleLockMs` is broken, never one that answered with a Windows transient error.
   */
  private async withLock<T>(fn: () => Promise<T>, lockTimeoutMs: number): Promise<T> {
    await this.fs.mkdir(dirname(this.path), { recursive: true });
    const deadline = Date.now() + lockTimeoutMs;
    for (let attempt = 0; ; attempt++) {
      try {
        const handle = await this.fs.open(this.lockPath, 'wx');
        await handle.close();
        break;
      } catch (e) {
        const code = errCode(e) ?? '';
        if (!LOCK_CONTENTION.has(code)) throw e;
        if (code === 'EEXIST') {
          const stat = await this.fs.stat(this.lockPath).catch(() => undefined);
          if (stat && Date.now() - stat.mtimeMs > this.staleLockMs) {
            await retryTransient(() => this.fs.rm(this.lockPath, { force: true }));
            continue;
          }
        }
        if (Date.now() > deadline) {
          const why = code === 'EEXIST' ? 'it is held by another process' : `the file system kept answering ${code} (Windows does while another process deletes or reads the lock)`;
          throw new Error(`ledger lock ${this.lockPath} could not be taken within ${lockTimeoutMs} ms: ${why}`, { cause: e });
        }
        await sleep(lockBackoffMs(attempt));
      }
    }
    try {
      return await fn();
    } finally {
      await retryTransient(() => this.fs.rm(this.lockPath, { force: true }));
    }
  }

  /**
   * Run under the lock, before an append (F03, ADR-0091). A file that does not end in a newline has a torn last line:
   * an OS crash, power loss or a full disk cut an append short (a killed process cannot: an entry is one small append).
   * Appending after it would weld the new entry onto the fragment, and lastEntry() used to throw on it, so every later
   * billed call failed to be ledgered and went uncounted. The fragment is copied to
   * `<ledger>.damaged-<yyyyMMddTHHmmssSSSZ>-<pid>` (no colons: Windows refuses them), and only once that copy is written
   * is the file cut back to its last newline, so the bytes are never lost. A last line that is a whole entry and only
   * lost its newline (an editor strips it) is not damage: it is ended with a newline instead, and kept.
   */
  private async repairTail(): Promise<void> {
    let handle: Awaited<ReturnType<LedgerFs['open']>>;
    try {
      handle = await this.fs.open(this.path, 'r+');
    } catch (e) {
      if (errCode(e) === 'ENOENT') return;
      throw e;
    }
    try {
      const { size } = await handle.stat();
      if (size === 0) return;
      const lastByte = Buffer.alloc(1);
      await handle.read(lastByte, 0, 1, size - 1);
      if (lastByte[0] === 0x0a) return;
      let cut = 0;
      for (let end = size; end > 0; ) {
        const start = Math.max(0, end - 64 * 1024);
        const buf = Buffer.alloc(end - start);
        await handle.read(buf, 0, buf.length, start);
        const nl = buf.lastIndexOf(0x0a);
        if (nl >= 0) {
          cut = start + nl + 1;
          break;
        }
        end = start;
      }
      const tail = Buffer.alloc(size - cut);
      await handle.read(tail, 0, tail.length, cut);
      if (chainable(tail.toString('utf8'))) {
        await handle.write('\n', size, 'utf8');
        return;
      }
      await this.fs.writeFile(`${this.path}.damaged-${fileStamp(this.now())}-${process.pid}`, tail, { flag: 'wx' });
      await handle.truncate(cut);
    } finally {
      await handle.close();
    }
  }

  /**
   * The last line that is an entry, read from the end of the file so appends stay cheap as the ledger grows. A complete
   * line that is not one (damage verify() reports) is passed over, so the chain continues from the last entry there is
   * and a billed call is still ledgered and counted.
   */
  private async lastEntry(): Promise<GatewayLedgerEntry | undefined> {
    let handle: Awaited<ReturnType<LedgerFs['open']>>;
    try {
      handle = await this.fs.open(this.path, 'r');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
    try {
      const { size } = await handle.stat();
      for (let chunk = 64 * 1024; ; chunk *= 4) {
        const start = Math.max(0, size - chunk);
        const buf = Buffer.alloc(size - start);
        await handle.read(buf, 0, buf.length, start);
        const lines = buf.toString('utf8').split('\n');
        // A chunk that does not start at the beginning of the file may start mid-line.
        if (start > 0) lines.shift();
        for (let i = lines.length - 1; i >= 0; i--) {
          const entry = chainable(lines[i] as string);
          if (entry) return entry;
        }
        if (start === 0) return undefined;
      }
    } finally {
      await handle.close();
    }
  }

  /**
   * The complete lines after `cursor`, for the spend book (ADR-0095): entries it can count, and lines it cannot, by byte
   * offset. The line that ended at the cursor must still be there (the bytes from `tailStart` hash to `tailSha256`);
   * when it is not, or the file is now shorter (a torn tail set aside, a restore), reading starts again from the
   * beginning, which is safe because absorbing is idempotent. A last line without its newline is not read yet: an
   * append may be under way, or a crash cut it short, which the next append sets aside.
   */
  async readFrom(cursor: LedgerCursor): Promise<LedgerBatch> {
    let handle: Awaited<ReturnType<LedgerFs['open']>>;
    try {
      handle = await this.fs.open(this.path, 'r');
    } catch (e) {
      if (errCode(e) === 'ENOENT') return { entries: [], unreadable: [], cursor: { ...LEDGER_START } };
      throw e;
    }
    try {
      const { size } = await handle.stat();
      let start = cursor.offset;
      if (start > size || (start > 0 && (cursor.tailSha256 === null || cursor.tailStart >= start))) start = 0;
      if (start > 0) {
        const tail = Buffer.alloc(start - 1 - cursor.tailStart);
        await handle.read(tail, 0, tail.length, cursor.tailStart);
        const ended = Buffer.alloc(1);
        await handle.read(ended, 0, 1, start - 1);
        if (ended[0] !== 0x0a || lineHash(tail) !== cursor.tailSha256) start = 0;
      }
      const buf = Buffer.alloc(size - start);
      if (buf.length > 0) await handle.read(buf, 0, buf.length, start);
      const entries: EntryLine[] = [];
      const unreadable: UnreadableLine[] = [];
      let next: LedgerCursor = start === 0 ? { ...LEDGER_START } : { offset: start, tailStart: cursor.tailStart, tailSha256: cursor.tailSha256 };
      for (let pos = 0; ; ) {
        const nl = buf.indexOf(0x0a, pos);
        if (nl < 0) break;
        const bytes = buf.subarray(pos, nl);
        const text = bytes.toString('utf8');
        if (text.trim()) {
          const at = { offset: start + pos, sha256: lineHash(bytes), excerpt: text.slice(0, EXCERPT_CHARS) };
          const read = readLedgerLine(text);
          if ('entry' in read) entries.push({ ...at, entry: read.entry });
          else unreadable.push({ ...at, problem: read.problem });
        }
        next = { offset: start + nl + 1, tailStart: start + pos, tailSha256: lineHash(bytes) };
        pos = nl + 1;
      }
      return { entries, unreadable, cursor: next };
    } finally {
      await handle.close();
    }
  }

  /** All entries, read incrementally: only bytes appended since the last call are parsed. Unparseable lines are skipped. */
  entries(): Promise<GatewayLedgerEntry[]> {
    const run = this.reads.then(() => this.readNew());
    this.reads = run.catch(() => undefined);
    return run;
  }

  private async readNew(): Promise<GatewayLedgerEntry[]> {
    let size: number;
    try {
      size = (await this.fs.stat(this.path)).size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    // The file shrank (rewritten, or tampered with): start over.
    if (size < this.cache.offset) this.cache = { offset: 0, entries: [] };
    if (size > this.cache.offset) {
      const handle = await this.fs.open(this.path, 'r');
      try {
        const buf = Buffer.alloc(size - this.cache.offset);
        await handle.read(buf, 0, buf.length, this.cache.offset);
        const text = buf.toString('utf8');
        const end = text.lastIndexOf('\n');
        if (end >= 0) {
          for (const line of text.slice(0, end).split('\n')) {
            if (!line.trim()) continue;
            try {
              this.cache.entries.push(JSON.parse(line) as GatewayLedgerEntry);
            } catch {
              // verify() reports the broken line; spending sums skip it.
            }
          }
          this.cache.offset += Buffer.byteLength(text.slice(0, end + 1), 'utf8');
        }
      } finally {
        await handle.close();
      }
    }
    return [...this.cache.entries];
  }

  /**
   * Re-read the whole file and check every link. Returns the id of the first entry that breaks the chain (an edited,
   * moved or missing predecessor, or one with no canonical form), `line:<n>` for an unparseable line or one that is not
   * an entry object (or an entry without an id), `head` for a head record that is not one (not JSON, a seq below 1, a
   * field missing), or null when the ledger is intact. It reports damage; it does not throw on it (ADR-0083).
   * The result is kept with the size and modification time of the ledger and of its head, and reused while neither has
   * changed, so it can be asked for on demand (Settings) without re-reading a large ledger each time (ADR-0091). An edit
   * that keeps both a file's size and its modification time is therefore not seen until the file next changes.
   */
  async verify(): Promise<string | null> {
    const key = await this.filesKey();
    if (this.verified?.key === key) return this.verified.result;
    const result = await this.verifyNow();
    this.verified = { key, result };
    return result;
  }

  /** The ledger's and the head's size and modification time, which a cached verify() result is valid for. */
  private async filesKey(): Promise<string> {
    const part = async (file: string) => {
      try {
        const st = await this.fs.stat(file);
        return `${st.size}:${st.mtimeMs}`;
      } catch (e) {
        if (errCode(e) === 'ENOENT') return 'none';
        throw e;
      }
    };
    return `${await part(this.path)}|${await part(this.headPath)}`;
  }

  private async verifyNow(): Promise<string | null> {
    let text = '';
    try {
      text = await this.fs.readFile(this.path, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const raw = text.split('\n');
    if (raw.at(-1) === '') raw.pop();
    let prev: GatewayLedgerEntry | undefined;
    for (let i = 0; i < raw.length; i++) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw[i] as string);
      } catch {
        return `line:${i + 1}`;
      }
      // A line that is not an entry object at all (null, an array, a bare value) is broken in its own right.
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return `line:${i + 1}`;
      const entry = parsed as GatewayLedgerEntry;
      const { hash, ...rest } = entry;
      const expected = expectedHash(rest);
      // An entry with no canonical form is broken explicitly, never by comparing hashes: a line whose hash field was
      // removed would otherwise compare undefined with undefined and pass.
      if (expected === undefined || entry.seq !== i + 1 || entry.prevHash !== (prev?.hash ?? GENESIS_HASH) || hash !== expected) {
        return entry.id ?? `line:${i + 1}`;
      }
      prev = entry;
    }
    const head = await this.readHead();
    if (head === 'damaged') return 'head';
    if (head) {
      const lastSeq = prev?.seq ?? 0;
      // The head may lag the file by one after a crash between the two writes; it may never run ahead of it.
      if (lastSeq < head.seq) return head.id;
      const atHead = JSON.parse(raw[head.seq - 1] as string) as GatewayLedgerEntry;
      if (atHead.hash !== head.hash) return atHead.id;
    }
    return null;
  }

  /** The head record; undefined when there is none, 'damaged' when the file is not one. */
  private async readHead(): Promise<Head | 'damaged' | undefined> {
    let text: string;
    try {
      text = await this.fs.readFile(this.headPath, 'utf8');
    } catch (e) {
      if (errCode(e) === 'ENOENT') return undefined;
      throw e;
    }
    return headOf(text) ?? 'damaged';
  }
}

/**
 * The torn tails set aside beside a ledger (`<ledger>.damaged-<stamp>-<pid>`, ADR-0091), by file name, oldest first.
 * Settings and the start-up report name them as a note: they are kept for inspection, never read, and block nothing.
 */
export async function setAsideTails(ledgerPath: string): Promise<string[]> {
  const prefix = `${basename(ledgerPath)}.damaged-`;
  try {
    return (await nodeFs.readdir(dirname(ledgerPath))).filter((name) => name.startsWith(prefix)).sort();
  } catch (e) {
    if (errCode(e) === 'ENOENT') return [];
    throw e;
  }
}
