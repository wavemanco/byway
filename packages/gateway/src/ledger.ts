import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalize, contentHash } from '@byway/canonical';
import type { LedgerEntry } from '@byway/contracts';

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

export interface LedgerOptions {
  /** The JSONL file. A sibling `<path>.head` records the last entry so a truncated tail is detectable. */
  path: string;
  now?: () => Date;
  /** How long to wait for the cross-process lock before failing. */
  lockTimeoutMs?: number;
  /** A lock older than this is presumed left by a crashed process and broken. */
  staleLockMs?: number;
}

/** Drop undefined-valued keys: canonical JSON has no undefined, and absent must hash the same as omitted. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The chain hash: SHA-256 of the RFC 8785 canonical form of the entry without its own hash (CR7). */
export function entryHash(entry: Omit<GatewayLedgerEntry, 'hash'>): string {
  return contentHash(defined(entry));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** On Windows a rename onto a file another process is reading fails briefly with EPERM or EBUSY; try again. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 20 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e;
      await sleep(10 + attempt * 5);
    }
  }
}

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
  /** Serializes this instance's appends so they do not contend for the file lock among themselves. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Incremental read cache for entries(). */
  private cache: { offset: number; entries: GatewayLedgerEntry[] } = { offset: 0, entries: [] };

  constructor(opts: LedgerOptions) {
    this.path = opts.path;
    this.headPath = `${opts.path}.head`;
    this.lockPath = `${opts.path}.lock`;
    this.now = opts.now ?? (() => new Date());
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 10_000;
    this.staleLockMs = opts.staleLockMs ?? 30_000;
  }

  append(draft: LedgerDraft): Promise<GatewayLedgerEntry> {
    const run = this.queue.then(() => this.withLock(() => this.appendLocked(draft)));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async appendLocked(draft: LedgerDraft): Promise<GatewayLedgerEntry> {
    const last = await this.lastEntry();
    const body = defined({
      ...draft,
      id: randomUUID(),
      seq: (last?.seq ?? 0) + 1,
      at: this.now().toISOString(),
      prevHash: last?.hash ?? GENESIS_HASH,
    }) as Omit<GatewayLedgerEntry, 'hash'>;
    const entry: GatewayLedgerEntry = { ...body, hash: entryHash(body) };
    await fs.appendFile(this.path, `${canonicalize(entry)}\n`, 'utf8');
    const head: Head = { seq: entry.seq, id: entry.id, hash: entry.hash };
    const tmp = `${this.headPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(head), 'utf8');
    await renameWithRetry(tmp, this.headPath);
    return entry;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      try {
        const handle = await fs.open(this.lockPath, 'wx');
        await handle.close();
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const stat = await fs.stat(this.lockPath).catch(() => undefined);
        if (stat && Date.now() - stat.mtimeMs > this.staleLockMs) {
          await fs.rm(this.lockPath, { force: true });
          continue;
        }
        if (Date.now() > deadline) throw new Error(`ledger lock ${this.lockPath} is held by another process`);
        await sleep(5 + Math.floor(Math.random() * 20));
      }
    }
    try {
      return await fn();
    } finally {
      await fs.rm(this.lockPath, { force: true });
    }
  }

  /** The last complete line, read from the end of the file so appends stay cheap as the ledger grows. */
  private async lastEntry(): Promise<GatewayLedgerEntry | undefined> {
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(this.path, 'r');
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
        const text = buf.toString('utf8').replace(/\n+$/, '');
        const nl = text.lastIndexOf('\n');
        if (nl >= 0 || start === 0) {
          const line = text.slice(nl + 1);
          return line ? (JSON.parse(line) as GatewayLedgerEntry) : undefined;
        }
      }
    } finally {
      await handle.close();
    }
  }

  /** All entries, read incrementally: only bytes appended since the last call are parsed. Unparseable lines are skipped. */
  async entries(): Promise<GatewayLedgerEntry[]> {
    let size: number;
    try {
      size = (await fs.stat(this.path)).size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    // The file shrank (rewritten, or tampered with): start over.
    if (size < this.cache.offset) this.cache = { offset: 0, entries: [] };
    if (size > this.cache.offset) {
      const handle = await fs.open(this.path, 'r');
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
   * moved or missing predecessor), `line:<n>` for an unparseable line, or null when the ledger is intact.
   */
  async verify(): Promise<string | null> {
    let text = '';
    try {
      text = await fs.readFile(this.path, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const raw = text.split('\n');
    if (raw.at(-1) === '') raw.pop();
    let prev: GatewayLedgerEntry | undefined;
    for (let i = 0; i < raw.length; i++) {
      let entry: GatewayLedgerEntry;
      try {
        entry = JSON.parse(raw[i] as string) as GatewayLedgerEntry;
      } catch {
        return `line:${i + 1}`;
      }
      const { hash, ...rest } = entry;
      if (entry.seq !== i + 1 || entry.prevHash !== (prev?.hash ?? GENESIS_HASH) || hash !== entryHash(rest)) return entry.id ?? `line:${i + 1}`;
      prev = entry;
    }
    const head = await this.readHead();
    if (head) {
      const lastSeq = prev?.seq ?? 0;
      // The head may lag the file by one after a crash between the two writes; it may never run ahead of it.
      if (lastSeq < head.seq) return head.id;
      const atHead = JSON.parse(raw[head.seq - 1] as string) as GatewayLedgerEntry;
      if (atHead.hash !== head.hash) return atHead.id;
    }
    return null;
  }

  private async readHead(): Promise<Head | undefined> {
    try {
      return JSON.parse(await fs.readFile(this.headPath, 'utf8')) as Head;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
  }
}
