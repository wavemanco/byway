import { existsSync, mkdtempSync, promises as fsp, readFileSync, writeFileSync } from 'node:fs';
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
const rewrite = (ls: string[]) => writeFileSync(path, ls.map((l) => `${l}\n`).join(''));

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
