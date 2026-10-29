import { existsSync, mkdtempSync, promises as fsp, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, contentHash } from '@byway/canonical';
import { beforeEach, describe, expect, it } from 'vitest';
import { entryHash, GENESIS_HASH, Ledger, type LedgerDraft } from '../src/ledger.ts';

const draft = (n: number, over: Partial<LedgerDraft> = {}): LedgerDraft => ({
  workspaceId: 'ws-1',
  runId: n % 2 ? 'run-a' : 'run-b',
  stepId: `step-${n}`,
  purpose: 'build:web-page',
  kind: 'completion',
  provider: 'mock',
  requestedModel: 'mock-mid',
  servedModel: 'mock-mid',
  requestSha256: `sha256:${'a'.repeat(64)}`,
  responseSha256: `sha256:${'b'.repeat(64)}`,
  usage: { inputTokens: 100 * n, outputTokens: 10 * n },
  costUsd: 0.01 * n,
  latencyMs: 5,
  ...over,
});

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-ledger-'));
  path = join(dir, 'ledger.jsonl');
});

const lines = () => readFileSync(path, 'utf8').split('\n').filter(Boolean);
/**
 * Rewrite the ledger as a tamperer would. The mtime is moved on past any filesystem's resolution, so that verify()'s
 * cache (ADR-0091) sees a same-size edit made in the mtime tick of the last append (Windows).
 */
const rewrite = (ls: string[]) => {
  writeFileSync(path, ls.map((l) => `${l}\n`).join(''));
  utimesSync(path, new Date(), new Date(Date.now() + 2000));
};

async function seed(n: number): Promise<Ledger> {
  const ledger = new Ledger({ path });
  for (let i = 1; i <= n; i++) await ledger.append(draft(i));
  return ledger;
}

describe('Ledger', () => {
  it('appends hash-chained entries with sequence numbers', async () => {
    const ledger = await seed(3);
    const entries = await ledger.entries();
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(entries[0]?.prevHash).toBe(GENESIS_HASH);
    expect(entries[1]?.prevHash).toBe(entries[0]?.hash);
    expect(entries[2]?.prevHash).toBe(entries[1]?.hash);
    for (const e of entries) {
      const { hash, ...rest } = e;
      expect(hash).toBe(contentHash(rest));
    }
    expect(await ledger.verify()).toBeNull();
  });

  it('omits absent optional fields instead of writing undefined', async () => {
    const ledger = new Ledger({ path });
    const { runId: _r, stepId: _s, ...noRun } = draft(1);
    const e = await ledger.append(noRun);
    expect(e.runId).toBeUndefined();
    expect(lines()[0]).not.toContain('runId');
    expect(await ledger.verify()).toBeNull();
  });

  it('detects an edited entry', async () => {
    const ledger = await seed(3);
    const ls = lines();
    rewrite([ls[0] as string, (ls[1] as string).replace('"costUsd":0.02', '"costUsd":0.0001'), ls[2] as string]);
    const second = JSON.parse(ls[1] as string);
    expect(await ledger.verify()).toBe(second.id);
  });

  it('detects an edit whose hash was recomputed, at the next link', async () => {
    const ledger = await seed(3);
    const ls = lines();
    const second = JSON.parse(ls[1] as string);
    const { hash: _h, ...rest } = { ...second, costUsd: 0 };
    const forged = { ...rest, hash: contentHash(rest) };
    rewrite([ls[0] as string, JSON.stringify(forged), ls[2] as string]);
    expect(await ledger.verify()).toBe(JSON.parse(ls[2] as string).id);
  });

  it('detects a deleted entry in the middle', async () => {
    const ledger = await seed(4);
    const ls = lines();
    rewrite([ls[0] as string, ls[2] as string, ls[3] as string]);
    expect(await ledger.verify()).toBe(JSON.parse(ls[2] as string).id);
  });

  it('detects a deleted last entry through the head record', async () => {
    const ledger = await seed(3);
    const ls = lines();
    rewrite([ls[0] as string, ls[1] as string]);
    expect(await ledger.verify()).toBe(JSON.parse(ls[2] as string).id);
  });

  it('detects reordered entries', async () => {
    const ledger = await seed(4);
    const ls = lines();
    rewrite([ls[0] as string, ls[2] as string, ls[1] as string, ls[3] as string]);
    expect(await ledger.verify()).toBe(JSON.parse(ls[2] as string).id);
  });

  it('reports an unparseable line by its line number', async () => {
    const ledger = await seed(2);
    const ls = lines();
    rewrite([ls[0] as string, '{not json', ls[1] as string]);
    expect(await ledger.verify()).toBe('line:2');
  });

  it('keeps the chain intact under concurrent appends from one and from several instances', async () => {
    const a = new Ledger({ path });
    const b = new Ledger({ path });
    await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? a : b).append(draft(i + 1))));
    const entries = await a.entries();
    expect(entries.map((e) => e.seq)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(await a.verify()).toBeNull();
    expect(await b.verify()).toBeNull();
  });

  it('sees entries appended by another instance', async () => {
    const a = await seed(2);
    expect((await a.entries()).length).toBe(2);
    await new Ledger({ path }).append(draft(3));
    expect((await a.entries()).length).toBe(3);
  });

  it('starts empty and verifies an empty ledger', async () => {
    const ledger = new Ledger({ path });
    expect(await ledger.entries()).toEqual([]);
    expect(await ledger.verify()).toBeNull();
  });
});

/**
 * F19: verify() reports damage, it does not throw on it. A stored line can hold text that has no canonical form (a
 * lone surrogate written as a JSON \u escape, a number too large for JSON) or not be an entry at all.
 */
describe('Ledger.verify on lines that cannot be hashed', () => {
  const id = (line: string | undefined) => JSON.parse(line as string).id as string;

  it('names an entry whose value was changed to hold a lone surrogate', async () => {
    const ledger = await seed(2);
    const ls = lines();
    rewrite([ls[0] as string, (ls[1] as string).replace('"purpose":"build:web-page"', '"purpose":"probe\\ud800"')]);
    expect(lines()[1]).toContain('probe\\ud800');
    expect(await ledger.verify()).toBe(id(ls[1]));
  });

  it('names an entry that was given a property name holding a lone surrogate', async () => {
    const ledger = await seed(2);
    const ls = lines();
    rewrite([ls[0] as string, `{"\\ud800":1,${(ls[1] as string).slice(1)}`]);
    expect(await ledger.verify()).toBe(id(ls[1]));
  });

  it.each([
    ['the last', 1],
    ['the first', 0],
  ])('names %s entry when its hash was removed and a value made unhashable (no head record)', async (_label, at) => {
    const ledger = await seed(2);
    const ls = lines();
    const edited = JSON.parse(ls[at] as string) as Record<string, unknown>;
    delete edited.hash;
    edited.purpose = 'p\ud800';
    ls[at] = JSON.stringify(edited);
    rewrite(ls);
    await fsp.rm(`${path}.head`);
    // Never judged by hash equality: an absent hash and an uncomputable one must not compare as equal.
    expect(await ledger.verify()).toBe(edited.id);
  });

  it.each([
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['a string', '"entry"'],
    ['a number', '7'],
  ])('reports a line that is %s, not an entry, by its line number', async (_label, line) => {
    const ledger = await seed(2);
    const ls = lines();
    rewrite([line, ls[1] as string]);
    expect(await ledger.verify()).toBe('line:1');
  });

  it('names an entry nested too deeply to hash, instead of overflowing the stack (ADR-0083)', async () => {
    const ledger = await seed(2);
    const ls = lines();
    // Ten thousand arrays deep: JSON.parse reads it, and canonicalize, which recurses, would throw a RangeError on it.
    const deep = `${'['.repeat(10_000)}${']'.repeat(10_000)}`;
    rewrite([ls[0] as string, `${(ls[1] as string).slice(0, -1)},"note":${deep}}`]);
    expect(() => canonicalize(JSON.parse(deep))).toThrow(RangeError);
    expect(await ledger.verify()).toBe(id(ls[1]));
  });

  it.each([
    ['an array nested ten thousand deep', `${'['.repeat(10_000)}${']'.repeat(10_000)}`],
    ['an array nested a hundred deep', `${'['.repeat(100)}${']'.repeat(100)}`],
    ['a number', '7'],
    ['an object', '{"a":1}'],
    ['empty text', '""'],
  ])('names a broken line by its number when its id is %s, so the result is always text', async (_label, value) => {
    const ledger = await seed(2);
    const ls = lines();
    rewrite([ls[0] as string, (ls[1] as string).replace(`"id":"${id(ls[1])}"`, `"id":${value}`)]);
    expect(lines()[1]).toContain(`"id":${value.slice(0, 20)}`);
    expect(await ledger.verify()).toBe('line:2');
  });

  it('names the entry at the head by its line number when its id is not text, even with its hash made to match', async () => {
    const ledger = await seed(2);
    const ls = lines();
    // The line hashes as it should, so only the head record (written before the edit) can tell it was changed.
    const edited: Record<string, unknown> = { ...(JSON.parse(ls[1] as string) as Record<string, unknown>), id: 7 };
    const { hash: _h, ...rest } = edited;
    rewrite([ls[0] as string, JSON.stringify({ ...rest, hash: contentHash(rest) })]);
    expect(await ledger.verify()).toBe('line:2');
  });

  // RB1-F1-3 (the re-check of block 1's fix round): `line:3` named a line the file does not have, which the ledger check
  // then called unreadable, perhaps cut short by a crash; what is wrong is that the entry the head records is missing.
  it('names a head that runs ahead of the file by the entry it records: its id, or its number when the id is empty', async () => {
    const ledger = await seed(2);
    writeFileSync(`${path}.head`, JSON.stringify({ seq: 3, id: '', hash: `sha256:${'c'.repeat(64)}` }));
    utimesSync(`${path}.head`, new Date(), new Date(Date.now() + 2000));
    expect(await ledger.verify()).toBe('3');
    writeFileSync(`${path}.head`, JSON.stringify({ seq: 3, id: 'le_gone', hash: `sha256:${'c'.repeat(64)}` }));
    utimesSync(`${path}.head`, new Date(), new Date(Date.now() + 4000));
    expect(await ledger.verify()).toBe('le_gone');
  });

  it('still hashes an entry nested well below that limit', async () => {
    const ledger = await seed(1);
    const { hash: _h, ...rest } = JSON.parse(lines()[0] as string) as Record<string, unknown>;
    const nested = { ...rest, note: JSON.parse(`${'['.repeat(40)}${']'.repeat(40)}`) as unknown };
    rewrite([JSON.stringify({ ...nested, hash: contentHash(nested) })]);
    await fsp.rm(`${path}.head`);
    expect(await ledger.verify()).toBeNull();
  });

  it('names an entry whose cost was changed to a number too large for JSON', async () => {
    const ledger = await seed(2);
    const ls = lines();
    rewrite([ls[0] as string, (ls[1] as string).replace('"costUsd":0.02', '"costUsd":1e400')]);
    expect(await ledger.verify()).toBe(id(ls[1]));
  });
});

describe('Ledger: prompt provenance (contracts v4, CR14)', () => {
  const prompt = { id: 'product.c3.critic', version: 4, hash: `sha256:${'c'.repeat(64)}`, fidelity: 'paraphrase' as const };

  it('records the prompt ref inside the hash chain', async () => {
    const ledger = new Ledger({ path });
    const e = await ledger.append(draft(1, { prompt }));
    expect(e.prompt).toEqual(prompt);
    const { hash, ...rest } = e;
    expect(hash).toBe(contentHash(rest));
    expect(JSON.parse(lines()[0] as string).prompt).toEqual(prompt);
    expect(await ledger.verify()).toBeNull();
    // Editing the provenance breaks the chain like any other field.
    rewrite([(lines()[0] as string).replace('"version":4', '"version":3')]);
    expect(await ledger.verify()).toBe(e.id);
  });

  it('still verifies older entries written before the prompt field existed, followed by newer ones', async () => {
    // An entry exactly as the pre-v4 gateway wrote it: no prompt key at all, hashed without it.
    const body = { ...draft(1), id: 'old-entry', seq: 1, at: '2026-10-06T12:00:00.000Z', prevHash: GENESIS_HASH };
    const old = { ...body, hash: entryHash(body) };
    writeFileSync(path, `${canonicalize(old)}\n`);
    writeFileSync(`${path}.head`, JSON.stringify({ seq: 1, id: old.id, hash: old.hash }));
    const ledger = new Ledger({ path });
    const next = await ledger.append(draft(2, { prompt }));
    expect(next).toMatchObject({ seq: 2, prevHash: old.hash, prompt });
    expect(await ledger.verify()).toBeNull();
  });
});

/** An fs error as Node raises it. */
const fsError = (code: string) => Object.assign(new Error(`${code}: operation failed`), { code });

describe('Ledger: the lock file on Windows', () => {
  it('retries EPERM, EBUSY and EACCES from opening the lock like EEXIST (a lock being deleted), then appends', async () => {
    const failures = ['EPERM', 'EPERM', 'EBUSY', 'EACCES', 'EPERM'];
    let lockOpens = 0;
    const ledger = new Ledger({
      path,
      fs: {
        open: (async (file: string, flags?: string) => {
          if (flags === 'wx') {
            lockOpens++;
            const code = failures.shift();
            if (code) throw fsError(code);
          }
          return fsp.open(file, flags);
        }) as typeof fsp.open,
      },
    });
    const e = await ledger.append(draft(1));
    expect(e.seq).toBe(1);
    expect(lockOpens).toBe(6);
    expect(existsSync(`${path}.lock`)).toBe(false);
    expect(await ledger.verify()).toBeNull();
  });

  it('gives up with a clear error naming the code when the lock keeps failing past the bound', async () => {
    const ledger = new Ledger({
      path,
      lockTimeoutMs: 60,
      fs: {
        open: (async (file: string, flags?: string) => {
          if (flags === 'wx') throw fsError('EPERM');
          return fsp.open(file, flags);
        }) as typeof fsp.open,
      },
    });
    await expect(ledger.append(draft(1))).rejects.toThrow(/ledger lock .*EPERM/);
    expect(existsSync(path)).toBe(false);
  });

  it('waits longer for one append when asked (a billed call must not lose its entry to a busy lock; ENG-3)', async () => {
    let lockOpens = 0;
    const started = Date.now();
    const ledger = new Ledger({
      path,
      lockTimeoutMs: 20,
      fs: {
        open: (async (file: string, flags?: string) => {
          // Held for about 150 ms, far past the ledger's ordinary 20 ms wait.
          if (flags === 'wx' && Date.now() - started < 150) {
            lockOpens++;
            throw fsError('EPERM');
          }
          return fsp.open(file, flags);
        }) as typeof fsp.open,
      },
    });
    await expect(ledger.append(draft(1))).rejects.toThrow(/within 20 ms/);
    const e = await ledger.append(draft(1), { lockTimeoutMs: 5_000 });
    expect(e.seq).toBe(1);
    expect(lockOpens).toBeGreaterThan(1);
  });

  it('keeps an appended entry when only the head record could not be rewritten (the next append catches it up)', async () => {
    let failHead = true;
    const ledger = new Ledger({
      path,
      fs: {
        rename: (async (from: string, to: string) => {
          if (failHead && to.endsWith('.head')) throw fsError('EIO');
          return fsp.rename(from, to);
        }) as typeof fsp.rename,
      },
    });
    // The line is written, so the call is in the ledger: failing here would invite a retry that pays and appends again.
    const first = await ledger.append(draft(1));
    expect(first.seq).toBe(1);
    expect((await ledger.entries()).map((e) => e.id)).toEqual([first.id]);
    failHead = false;
    await ledger.append(draft(2));
    expect(await ledger.verify()).toBeNull();
  });

  it('fails at once on an error that is not contention', async () => {
    let lockOpens = 0;
    const ledger = new Ledger({
      path,
      fs: {
        open: (async (file: string, flags?: string) => {
          if (flags === 'wx') {
            lockOpens++;
            throw fsError('EROFS');
          }
          return fsp.open(file, flags);
        }) as typeof fsp.open,
      },
    });
    await expect(ledger.append(draft(1))).rejects.toMatchObject({ code: 'EROFS' });
    expect(lockOpens).toBe(1);
  });

  it('retries releasing the lock when Windows briefly refuses the delete', async () => {
    const failures = ['EPERM', 'EBUSY'];
    const ledger = new Ledger({
      path,
      fs: {
        rm: (async (file: string, opts?: Parameters<typeof fsp.rm>[1]) => {
          if (file.endsWith('.lock')) {
            const code = failures.shift();
            if (code) throw fsError(code);
          }
          return fsp.rm(file, opts);
        }) as typeof fsp.rm,
      },
    });
    await ledger.append(draft(1));
    expect(failures).toEqual([]);
    expect(existsSync(`${path}.lock`)).toBe(false);
    await ledger.append(draft(2));
    expect(await ledger.verify()).toBeNull();
  });
});

describe('Ledger: concurrent reads in one process', () => {
  it('serializes entries() so a slower read cannot rewind the cache past a faster one (negative read size)', async () => {
    const writer = await seed(2);
    // The first read stops at open() until a second read, started after more appends, has finished.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let readOpens = 0;
    const ledger = new Ledger({
      path,
      fs: {
        open: (async (file: string, flags?: string) => {
          if (file === path && flags === 'r' && ++readOpens === 1) await held;
          return fsp.open(file, flags);
        }) as typeof fsp.open,
      },
    });
    const slow = ledger.entries();
    await new Promise((r) => setTimeout(r, 10));
    await writer.append(draft(3));
    await writer.append(draft(4));
    const fast = ledger.entries();
    setTimeout(release, 10);
    const [a, b] = await Promise.all([slow, fast]);
    expect(a.map((e) => e.seq)).toEqual([1, 2]);
    expect(b.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect((await ledger.entries()).map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });
});

/**
 * F03: a torn tail (an OS crash, power loss or a full disk during an append leaves a partial last line) used to make
 * lastEntry() throw, so every later billed call failed to be ledgered and went uncounted. The next append now sets the
 * torn bytes aside under a name Windows accepts, cuts the file back to its last complete line and continues the chain.
 */
describe('Ledger: a torn tail', () => {
  const TORN = '{"workspaceId":"ws-1","purpose":"build:web-pa';
  const damagedFiles = () => readdirSync(dir).filter((n) => n.startsWith('ledger.jsonl.damaged-'));

  it('sets the torn bytes aside, continues the chain from the last complete entry, and verifies clean', async () => {
    const ledger = await seed(2);
    const before = lines();
    writeFileSync(path, `${readFileSync(path, 'utf8')}${TORN}`);
    const e = await ledger.append(draft(3));
    expect(e).toMatchObject({ seq: 3, prevHash: JSON.parse(before[1] as string).hash });
    expect(lines()).toEqual([...before, expect.any(String)]);
    const [kept, ...more] = damagedFiles();
    expect(more).toEqual([]);
    // ledger.jsonl.damaged-<yyyyMMddTHHmmssSSSZ>-<pid>: no colons, which Windows refuses in a file name.
    expect(kept).toMatch(/^ledger\.jsonl\.damaged-\d{8}T\d{9}Z-\d+$/);
    expect(readFileSync(join(dir, kept as string), 'utf8')).toBe(TORN);
    expect(await ledger.verify()).toBeNull();
    expect((await new Ledger({ path }).entries()).map((x) => x.seq)).toEqual([1, 2, 3]);
  });

  it('sets aside a file that is nothing but a torn first line, and starts the chain afresh', async () => {
    writeFileSync(path, TORN);
    const e = await new Ledger({ path }).append(draft(1));
    expect(e).toMatchObject({ seq: 1, prevHash: GENESIS_HASH });
    expect(damagedFiles()).toHaveLength(1);
    expect(await new Ledger({ path }).verify()).toBeNull();
  });

  it('ends a complete last entry that only lost its newline (an editor) instead of setting it aside', async () => {
    const ledger = await seed(2);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n$/, ''));
    const e = await ledger.append(draft(3));
    expect(e.seq).toBe(3);
    expect(damagedFiles()).toEqual([]);
    expect(await ledger.verify()).toBeNull();
  });

  it('continues from the last line that parses when the last complete line is damaged, and verify still names it', async () => {
    const ledger = await seed(2);
    writeFileSync(path, `${readFileSync(path, 'utf8')}{"not":"an entry"\n`);
    const e = await ledger.append(draft(3));
    expect(e).toMatchObject({ seq: 3, prevHash: JSON.parse(lines()[1] as string).hash });
    expect(await ledger.verify()).toBe('line:3');
  });
});

/**
 * Wave-1 follow-up (ADR-0083 left it open): verify() reports a damaged head record as broken, as it does for lines,
 * instead of throwing a SyntaxError or reading the line before the first.
 */
describe('Ledger.verify on a damaged head record', () => {
  it.each([
    ['not JSON', '{"seq":2,'],
    ['null', 'null'],
    ['a seq of 0', JSON.stringify({ seq: 0, id: 'x', hash: 'y' })],
    ['a negative seq', JSON.stringify({ seq: -1, id: 'x', hash: 'y' })],
    ['a fractional seq', JSON.stringify({ seq: 1.5, id: 'x', hash: 'y' })],
    ['no hash', JSON.stringify({ seq: 1, id: 'x' })],
    ['no id', JSON.stringify({ seq: 1, hash: 'y' })],
  ])('reports a head that is %s as "head"', async (_label, text) => {
    const ledger = await seed(2);
    writeFileSync(`${path}.head`, text);
    expect(await ledger.verify()).toBe('head');
  });
});

describe('Ledger.verify is cached by the files it reads', () => {
  it('reads the file again only when the ledger or its head changed', async () => {
    let reads = 0;
    const ledger = new Ledger({
      path,
      fs: {
        readFile: (async (file: string, opts?: unknown) => {
          if (file === path) reads++;
          return fsp.readFile(file, opts as BufferEncoding);
        }) as typeof fsp.readFile,
      },
    });
    for (let i = 1; i <= 2; i++) await ledger.append(draft(i));
    expect(await ledger.verify()).toBeNull();
    expect(await ledger.verify()).toBeNull();
    expect(reads).toBe(1);
    await ledger.append(draft(3));
    expect(await ledger.verify()).toBeNull();
    expect(reads).toBe(2);
    // A damaged head alone (the ledger unchanged) is noticed too.
    writeFileSync(`${path}.head`, 'garbage');
    expect(await ledger.verify()).toBe('head');
  });
});
