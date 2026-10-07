import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentHash } from '@byway/canonical';
import { beforeEach, describe, expect, it } from 'vitest';
import { GENESIS_HASH, Ledger, type LedgerDraft } from '../src/ledger.ts';

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
