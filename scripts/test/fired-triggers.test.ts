/**
 * The fired-triggers script (scripts/fired-triggers.ts; backlog row B-091, the owner's "Build the script and make it a
 * step (Recommended)", 2026-10-23 08:58): it lists the pending rows whose Trigger names a file the branch's diff
 * touches, or a code name on a line the diff adds or removes, and no other; and it reads the diff from where the branch
 * left main to the working tree, uncommitted and untracked files included.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { branchDiff, firedTriggers, namedIn, touches } from '../fired-triggers.ts';
import { COLUMNS, parseDocs, readDocs, type Row } from '../route-map.ts';

const row = (id: string, trigger: string): Row => ({
  id,
  file: 'docs/backlog.md',
  line: 1,
  section: 'A section',
  cells: { ...(Object.fromEntries(COLUMNS.map((c) => [c, ''])) as Row['cells']), ID: id, Trigger: trigger },
});

describe('which triggers a diff fires', () => {
  it('reads the paths and code names a Trigger names, and not ordinary words', () => {
    expect(namedIn("At the next change to fal.ts's start deadline or to packages/advisor, whichever comes first.")).toEqual({ paths: ['fal.ts', 'packages/advisor'], code: [] });
    expect(namedIn('At the next change to redactMessage, SpendBook.abandon, PRICES_CHECKED or apps/web/src/view/RunScreen.tsx.')).toEqual({
      paths: ['apps/web/src/view/RunScreen.tsx'],
      code: ['redactMessage', 'SpendBook.abandon', 'PRICES_CHECKED'],
    });
    expect(namedIn('With macOS support, before the first live run (ADR-0110), or on 2026-11-05.')).toEqual({ paths: [], code: [] });
  });

  it('a named path is touched by the same file, a file of that name, or a file under that folder', () => {
    expect(touches('packages/gateway/src/providers/fal.ts', 'fal.ts')).toBe(true);
    expect(touches('packages/gateway/src/providers/fal.ts', 'providers/fal.ts')).toBe(true);
    expect(touches('packages/advisor/src/estimate.ts', 'packages/advisor')).toBe(true);
    expect(touches('scripts/playwright-pin.ts', 'scripts/playwright-pin.ts')).toBe(true);
    expect(touches('packages/gateway/src/providers/openfal.ts', 'fal.ts')).toBe(false);
    expect(touches('packages/advisor-extra/x.ts', 'packages/advisor')).toBe(false);
  });

  it('lists the rows whose Trigger the diff fires, with what it matched, and no other', () => {
    const rows = [
      row('B-001', 'At the next change to fal.ts or redactMessage.'),
      row('B-002', 'At the next change to packages/advisor.'),
      row('B-003', 'At the next change to toFailure.'),
      row('B-004', 'Before the first live run.'),
      row('B-005', 'At the next change to questionCost.'),
    ];
    const diff = { files: ['packages/gateway/src/providers/fal.ts', 'docs/backlog.md'], lines: '-  return toFailure(e);\n+  return this.toFailureOf(e, questionCostly);' };
    // A removed line counts; a longer name that starts with the one named (toFailureOf, questionCostly) does not.
    expect(firedTriggers(rows, diff).map((f) => [f.row.id, f.matched])).toEqual([
      ['B-001', ['fal.ts']],
      ['B-003', ['toFailure']],
    ]);
    expect(firedTriggers(rows, { files: [], lines: '+  redactMessage(x); toFailure(y)' }).map((f) => [f.row.id, f.matched])).toEqual([
      ['B-001', ['redactMessage']],
      ['B-003', ['toFailure']],
    ]);
  });

  it('reads the real backlog’s triggers: many name a path or a code name', () => {
    const named = parseDocs(readDocs()).rows.map((r) => namedIn(r.cells.Trigger));
    expect(named.filter((n) => n.paths.length > 0).length).toBeGreaterThan(10);
    expect(named.filter((n) => n.code.length > 0).length).toBeGreaterThan(10);
  });
});

const temp = mkdtempSync(path.join(tmpdir(), 'byway-fired-'));
afterAll(() => rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

describe('the branch’s diff', { timeout: 60_000 }, () => {
  it('runs from where the branch left main to the working tree, with uncommitted and untracked files, and not main’s later commits', () => {
    const dir = path.join(temp, 'repo');
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    const config = path.join(temp, 'gitconfig');
    writeFileSync(config, '');
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: config,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    };
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    const write = (rel: string, text: string) => writeFileSync(path.join(dir, rel), text);
    git('init', '--quiet', '--initial-branch=main');
    write('src/a.ts', 'export const a = 1;\n');
    write('src/b.ts', 'export const b = 1;\n');
    git('add', '--all');
    git('commit', '--quiet', '--no-verify', '-m', 'start');
    git('switch', '--quiet', '-c', 'fix/x');
    write('src/a.ts', 'export const a = redactMessage(1);\n');
    git('commit', '--quiet', '--no-verify', '-am', 'a on the branch');
    git('switch', '--quiet', 'main');
    write('src/main-only.ts', 'export const m = 1;\n');
    git('add', '--all');
    git('commit', '--quiet', '--no-verify', '-m', 'main moves on');
    git('switch', '--quiet', 'fix/x');
    write('src/b.ts', 'export const b = toFailure(2);\n');
    write('src/new.ts', 'export const n = markSent(1);\n');
    // A record that names a code name changes no code.
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    write('docs/note.md', 'A note on keepsVoice.\n');
    write('NOTES.md', 'And on falFailure.\n');
    const diff = branchDiff('main', dir);
    expect(diff.files.sort()).toEqual(['NOTES.md', 'docs/note.md', 'src/a.ts', 'src/b.ts', 'src/new.ts']);
    expect(diff.lines).toContain('+export const a = redactMessage(1);');
    expect(diff.lines).toContain('+export const b = toFailure(2);');
    expect(diff.lines).toContain('+export const n = markSent(1);');
    expect(diff.lines).not.toMatch(/keepsVoice|falFailure/);
    expect(diff.lines).not.toMatch(/^(?:\+\+\+|---) /m);
  });
});
