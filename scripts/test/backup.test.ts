/**
 * R4 (2026-10-08 external review, verified) and ADR-0094: the backup unit is the whole data directory, copied while
 * byway is stopped.
 *
 * ADR-0066 said the product had "one file to back up". It never had: the store runs SQLite in WAL mode, so recent
 * commits live in `byway.sqlite-wal` until SQLite folds them into the main file, and the data directory also holds the
 * artifact files, the spend ledger and its head, the exposure register and the engine's own database. These tests use
 * the real store, ledger and exposure register: they show why a single-file copy is not a backup, that a whole-directory
 * copy taken after the store closes comes back intact, and that the README names every file byway writes there and
 * says how to back up and restore.
 *
 * What a partial restore does to spend is F03's to fix: the ledger treats a missing file as no spend. Until it does, the
 * README states that caveat, and this test requires it; remove both in the change that makes spend fail closed.
 */
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EXPOSURE_FILENAME, ExposureRegister, Ledger, readExposure, type LedgerDraft } from '../../packages/gateway/src/index.ts';
import { TEMPORAL_BIN_DIR, TEMPORAL_DB_FILENAME } from '../../packages/runner/src/dev-engine.ts';
import { createStore, DB_FILENAME } from '../../packages/store/src/index.ts';
import { brokenLink, read, relativeLinks, section } from './docs.ts';

/** The ledger's name in the data directory, as scripts/serve.ts and the web app (LEDGER_FILENAME) give it. */
const LEDGER = 'ledger.jsonl';

const temps: string[] = [];
const tempDir = (label: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), `byway-backup-${label}-`));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const draft: LedgerDraft = {
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'step-1',
  purpose: 'critic:web-page',
  kind: 'completion',
  provider: 'openai',
  requestedModel: 'gpt-x',
  servedModel: 'gpt-x',
  requestSha256: `sha256:${'a'.repeat(64)}`,
  responseSha256: `sha256:${'b'.repeat(64)}`,
  usage: { inputTokens: 100, outputTokens: 10 },
  costUsd: 0.42,
  latencyMs: 900,
};

/** A data directory with the store open and one of everything written: a workspace, an artifact, a call and its exposure. */
async function liveDataDir() {
  const dir = tempDir('live');
  const store = createStore({ dataDir: dir });
  const workspace = await store.ensureDefaultWorkspace();
  const artifact = await store.artifacts.putText('<p>kept</p>', 'text/html');
  const ledger = new Ledger({ path: path.join(dir, LEDGER) });
  await ledger.append(draft);
  await new ExposureRegister(path.join(dir, EXPOSURE_FILENAME)).record({ provider: 'openai', model: 'gpt-x' }, draft.purpose, draft.workspaceId, new Date());
  return { dir, store, workspace, artifact, ledger };
}

/** Whether the database file at `file`, opened on its own, holds the workspace row. */
function holdsWorkspace(file: string, id: string): boolean {
  const db = new DatabaseSync(file);
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'").get();
    return table !== undefined && db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id) !== undefined;
  } finally {
    db.close();
  }
}

describe('the backup unit is the whole data directory (R4, ADR-0094)', () => {
  it('a copy of byway.sqlite alone, taken while byway runs, lacks what the store has committed', async () => {
    const { dir, store, workspace } = await liveDataDir();
    try {
      expect(readdirSync(dir)).toContain(`${DB_FILENAME}-wal`);
      const copy = path.join(tempDir('one-file'), DB_FILENAME);
      cpSync(path.join(dir, DB_FILENAME), copy);
      expect(holdsWorkspace(copy, workspace.id)).toBe(false);
    } finally {
      store.close();
    }
  });

  it('a copy of the whole directory, taken after byway stops, reopens with the same records, artifacts, spend and exposure', async () => {
    const { dir, store, workspace, artifact, ledger } = await liveDataDir();
    const entries = await ledger.entries();
    store.close();
    const restored = path.join(tempDir('restored'), 'byway');
    cpSync(dir, restored, { recursive: true });

    const reopened = createStore({ dataDir: restored });
    try {
      expect(await reopened.getWorkspace(workspace.id)).toEqual(workspace);
      expect(await reopened.artifacts.getText(artifact.id)).toBe('<p>kept</p>');
    } finally {
      reopened.close();
    }
    expect(await new Ledger({ path: path.join(restored, LEDGER) }).entries()).toEqual(entries);
    expect(await readExposure(path.join(restored, EXPOSURE_FILENAME))).toEqual(await readExposure(path.join(dir, EXPOSURE_FILENAME)));
  });
});

describe('README: data and backup (R4)', () => {
  const readme = read('README.md');

  it("the Data table names every file byway writes in the data directory, the store's WAL sidecars and the ledger head included", async () => {
    const { dir, store } = await liveDataDir();
    let written: string[];
    try {
      written = readdirSync(dir);
    } finally {
      store.close();
    }
    // The engine's database and its CLI copy are written by the dev engine, which this test does not start.
    const names = [...new Set([...written, TEMPORAL_DB_FILENAME, TEMPORAL_BIN_DIR])].filter((n) => !n.endsWith('.lock')).sort();
    expect(names).toEqual(expect.arrayContaining([DB_FILENAME, `${DB_FILENAME}-wal`, `${DB_FILENAME}-shm`, 'artifacts', LEDGER, `${LEDGER}.head`, EXPOSURE_FILENAME]));
    const data = section(readme, '## Data') ?? '';
    expect(names.filter((n) => !data.includes(`\`${n}`))).toEqual([]);
  });

  it('a "Back up and restore" section gives the whole-directory procedure, its engine check and what each kind of mix does', () => {
    const backup = section(readme, '## Back up and restore') ?? '';
    expect(backup).toMatch(/whole data directory/i);
    expect(backup).toMatch(/BYWAY_TEMPORAL_PORT/);
    expect(backup).toMatch(/7233/);
    expect(backup).toMatch(/not a backup/);
    expect(backup).toMatch(/Mixing files from different backups is not supported/);
    for (const mix of [/older or missing `ledger\.jsonl`/, /`byway\.sqlite` older than `temporal\.sqlite`/, /`temporal\.sqlite` older than `byway\.sqlite`/, /`artifacts\/`/, /`exposure\.jsonl`/]) expect(backup).toMatch(mix);
  });

  it('states the ledger caveat until spend fails closed after a restore (F03)', () => {
    const caveat = (section(readme, '## Back up and restore') ?? '').split('\n').find((l) => l.startsWith('**Spend after a restore')) ?? '';
    expect(caveat).toMatch(/caps?/);
    expect(caveat).toMatch(/provider/i);
  });

  it('points to ADR-0094, which corrects ADR-0066', () => {
    const links = relativeLinks(section(readme, '## Back up and restore') ?? '').map((l) => l.target);
    const adr = links.find((t) => t.startsWith('docs/adr/0094-')) ?? '';
    expect(adr).not.toBe('');
    expect(brokenLink('README.md', adr)).toBeUndefined();
    const record = read(adr);
    expect(record).toMatch(/^\| \*\*Status\*\* \| Accepted \|$/m);
    expect(record).toMatch(/corrects \[ADR-0066\]/);
  });
});
