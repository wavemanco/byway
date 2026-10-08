/**
 * Content-addressed artifact files (spec §2 "Data", ADR-0066). The bytes live at
 * `<dataDir>/artifacts/sha256/<first 2 hex>/<remaining 62 hex>` and their id is `sha256:<hex>`, so identical outputs
 * dedupe for free and any change to a file is detectable: every read re-hashes the bytes and refuses a mismatch. The
 * media type and size are recorded in SQLite, which is what makes an artifact "exist" for the store.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ArtifactRecord, ArtifactStore } from '@byway/contracts';
import { ArtifactCorruptError, StoreError } from './errors.ts';
import { toArtifact } from './rows.ts';
import { invalid } from './validate.ts';

const ID = /^sha256:([0-9a-f]{64})$/;

/**
 * A media type as it will later be sent in a Content-Type header by the artifact route: `type/subtype` plus optional
 * parameters, with no control characters (a newline here would be header injection).
 */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;[^\x00-\x1f\x7f]*)?$/i;

function hexOf(id: string): string {
  const m = typeof id === 'string' ? ID.exec(id) : null;
  if (!m?.[1]) throw invalid(`malformed artifact id ${JSON.stringify(id)}; expected "sha256:" and 64 lowercase hex digits`);
  return m[1];
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function shardPath(dataDir: string, hex: string): string {
  return path.join(dataDir, 'artifacts', 'sha256', hex.slice(0, 2), hex.slice(2));
}

/** Where the bytes of artifact `id` live under `dataDir`. Throws on a malformed id (no path tricks via the id). */
export function artifactPath(dataDir: string, id: string): string {
  return shardPath(dataDir, hexOf(id));
}

function isMissing(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export class FileArtifactStore implements ArtifactStore {
  readonly #dataDir: string;
  readonly #tmpDir: string;
  readonly #now: () => Date;
  readonly #ensureOpen: () => void;
  readonly #select: StatementSync;
  readonly #insert: StatementSync;

  constructor(dataDir: string, db: DatabaseSync, now: () => Date, ensureOpen: () => void) {
    this.#dataDir = dataDir;
    // Temporary files sit on the same volume as their destination so the final rename is atomic.
    this.#tmpDir = path.join(dataDir, 'artifacts', 'tmp');
    mkdirSync(this.#tmpDir, { recursive: true });
    this.#now = now;
    this.#ensureOpen = ensureOpen;
    this.#select = db.prepare('SELECT * FROM artifacts WHERE id = ?');
    // First writer wins: an id is the hash of the bytes alone, so a later put of the same bytes gets the first record.
    this.#insert = db.prepare('INSERT INTO artifacts (id, media_type, bytes, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING');
  }

  async put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord> {
    this.#ensureOpen();
    if (!(bytes instanceof Uint8Array)) throw invalid('artifact content must be a Uint8Array');
    if (typeof mediaType !== 'string' || !MEDIA_TYPE.test(mediaType)) throw invalid(`malformed media type ${JSON.stringify(mediaType)}`);
    const hex = sha256Hex(bytes);
    const id = `sha256:${hex}`;
    const file = shardPath(this.#dataDir, hex);
    // Rewriting also heals a file that was damaged after it was first stored.
    if (!(await this.#fileHolds(file, hex))) await this.#writeAtomically(file, bytes, hex);
    this.#ensureOpen();
    this.#insert.run(id, mediaType, bytes.byteLength, this.#now().toISOString());
    const row = this.#select.get(id);
    if (!row) throw new StoreError('not-found', `artifact ${id} vanished right after it was recorded`);
    return toArtifact(row);
  }

  async putText(text: string, mediaType: string): Promise<ArtifactRecord> {
    if (typeof text !== 'string') throw invalid('artifact text must be a string');
    // UTF-8 cannot carry a lone surrogate; encoding would silently store U+FFFD instead of the text that was given.
    if (!text.isWellFormed()) throw invalid('artifact text contains a lone surrogate and is not valid Unicode');
    return this.put(new TextEncoder().encode(text), mediaType);
  }

  async get(id: string): Promise<{ record: ArtifactRecord; bytes: Uint8Array }> {
    this.#ensureOpen();
    const hex = hexOf(id);
    const row = this.#select.get(id);
    if (!row) throw new StoreError('not-found', `no artifact ${id}`);
    const file = shardPath(this.#dataDir, hex);
    let buf: Buffer;
    try {
      buf = await readFile(file);
    } catch (e) {
      if (isMissing(e)) throw new ArtifactCorruptError(id, `artifact ${id} is recorded but its file ${file} is missing`);
      throw e;
    }
    if (sha256Hex(buf) !== hex) {
      throw new ArtifactCorruptError(id, `artifact ${id} is corrupt: the file ${file} does not match its content address`);
    }
    return { record: toArtifact(row), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  }

  async getText(id: string): Promise<string> {
    const { bytes } = await this.get(id);
    try {
      // fatal: binary content is an error, not mojibake. ignoreBOM: return exactly the text that was put.
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (e) {
      throw new StoreError('invalid', `artifact ${id} is not UTF-8 text`, { cause: e });
    }
  }

  /** True when the artifact is recorded and its file is present. Does not re-hash; `get` does. */
  async has(id: string): Promise<boolean> {
    this.#ensureOpen();
    const m = typeof id === 'string' ? ID.exec(id) : null;
    if (!m?.[1] || !this.#select.get(id)) return false;
    try {
      return (await stat(shardPath(this.#dataDir, m[1]))).isFile();
    } catch (e) {
      if (isMissing(e)) return false;
      throw e;
    }
  }

  async #fileHolds(file: string, hex: string): Promise<boolean> {
    try {
      return sha256Hex(await readFile(file)) === hex;
    } catch (e) {
      if (isMissing(e)) return false;
      throw e;
    }
  }

  /** Write to a temporary file, flush it, then rename it into place: readers see the whole file or none of it. */
  async #writeAtomically(file: string, bytes: Uint8Array, hex: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(this.#tmpDir, `${hex.slice(0, 16)}-${randomUUID()}`);
    const handle = await open(tmp, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(tmp, file);
    } catch (e) {
      await rm(tmp, { force: true });
      // A concurrent writer may have placed the same bytes first; Windows then refuses to replace a file that another
      // reader holds open. Identical content already in place is success.
      if (await this.#fileHolds(file, hex)) return;
      throw e;
    }
  }
}
