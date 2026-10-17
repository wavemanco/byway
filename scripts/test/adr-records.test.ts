/**
 * The decision log's rule (ADR-0103; CR14, ADR-0057), checked against git history (adr-log.ts):
 *
 * - An ADR's Context and Decision are final once it reaches main's first-parent history as Accepted. The commit that
 *   changes a record from Proposed to Accepted may finalise its Decision. Branches merge with --no-ff, so a branch's
 *   own commits are drafts.
 * - From ADR-0103 on, a record that corrects, supersedes, amends or extends an Accepted one reaches main in the same
 *   commit as the index's "changed by" link to it.
 * - An Accepted record's Decision does not open as a proposal ("Proposed, not decided.").
 * - The index agrees with the records: each row's status with its record's header, each "changed by" link names a
 *   later record that names the one it changes, and each record on main has a row.
 *
 * The known exceptions are named below with their reasons. A temporary git repository proves the rule itself: an
 * edited Decision fails and an appended note passes.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ADR_DIR, checkLog, describeBreach, describeLinkBreach, INDEX, isAccepted, opensAsProposal, parseIndex, parseRecord, recordNumber, statusWord, WORKING_TREE, type Exception } from './adr-log.ts';
import { read, REPO } from './docs.ts';

/** The record that made the rule; the same-commit link rule applies from it on. */
const LINKS_FROM = '0103';

/**
 * Edits to a fixed section that the log keeps. Each is the one change let through; the text after it is fixed again.
 */
const EXCEPTIONS: readonly Exception[] = [
  {
    record: '0100',
    commit: 'f69b3da3b0ede042a34e739fe9006d6a16eeb88e',
    part: 'Decision',
    reason:
      "A merge race, corrected 56 seconds after the merge. The code fix 730ebc7 reached main in 4559fe8 (05:53:13), and ADR-0100 reached main 14 seconds later in 1cef8d0 (05:53:27), so its item 7 was already false when it arrived. f69b3da (05:54:23) rewrote item 7 to say what 730ebc7 made true. Both commits reached GitHub in the same push. Restoring the original text would put a false sentence back on main, so the edit stays and is named here (ADR-0103).",
  },
];

/**
 * Accepted records whose Decision still opens as a proposal. Each names the record that explains it, which must say so.
 */
const PROPOSAL_WORDING: ReadonlyArray<{ record: string; note: string; reason: string }> = [
  {
    record: '0041',
    note: '0103',
    reason:
      'ADR-0041 was accepted as part of design section 1, revision 2, on 2026-10-07, but its Decision still opens "Proposed, not decided." ADR-0103 adds a note: the note is not a ratification, and "ADR-0041 rule 3" (cited in six files) means the third rule in its list of five rules and one default.',
  },
];

const log = checkLog(REPO, { exceptions: EXCEPTIONS, linksFrom: LINKS_FROM });

describe('the decision log on main (ADR-0103, CR14)', () => {
  it('reads main’s first-parent history', () => {
    expect(log.line.commits.length).toBeGreaterThan(50);
    expect(log.acceptedIn.size).toBeGreaterThan(90);
  });

  it('no Accepted record’s Context or Decision changed after it reached main, except the edits named here', () => {
    expect(log.breaches.map(describeBreach)).toEqual([]);
  });

  it('each named exception matches an edit in main’s history (none is out of date)', () => {
    for (const e of EXCEPTIONS) {
      expect(e.reason.length, `ADR-${e.record}`).toBeGreaterThan(40);
      expect(log.used, `the exception for ADR-${e.record} at ${e.commit} matched no edit`).toContain(e);
    }
  });

  it(`from ADR-${LINKS_FROM} on, a record that changes another reaches main in the same commit as the index's "changed by" link`, () => {
    expect(log.linkBreaches.map(describeLinkBreach)).toEqual([]);
  });
});

describe('the records and the index agree', () => {
  const files = new Map(readdirSync(path.join(REPO, ADR_DIR)).flatMap((name) => (recordNumber(`${ADR_DIR}/${name}`) ? [[recordNumber(`${ADR_DIR}/${name}`) ?? '', `${ADR_DIR}/${name}`] as const] : [])));
  const rows = parseIndex(read(INDEX));
  const record = (n: string) => parseRecord(read(files.get(n) ?? `${ADR_DIR}/missing-${n}.md`));

  it('every record has a Status row, a Context and a Decision', () => {
    expect(files.size).toBeGreaterThan(100);
    for (const [n, file] of files) {
      const r = record(n);
      expect(statusWord(r.status), file).toMatch(/^(Accepted|Proposed|Superseded)$/);
      expect(r.Context, file).toBeDefined();
      expect(r.Decision, file).toBeDefined();
    }
  });

  it('an Accepted record’s Decision does not open as a proposal, except the records named here, whose note says why', () => {
    const opening = [...files.keys()].filter((n) => isAccepted(record(n).status) && opensAsProposal(record(n).Decision));
    expect(opening).toEqual(PROPOSAL_WORDING.map((p) => p.record));
    for (const p of PROPOSAL_WORDING) {
      expect(files.has(p.note), `ADR-${p.note}, which explains ADR-${p.record}`).toBe(true);
      const note = read(files.get(p.note) ?? '');
      expect(note, `ADR-${p.note} names ADR-${p.record}`).toContain(`ADR-${p.record}`);
      expect(note).toMatch(/not a ratification/);
    }
  });

  it('each index row links its record, and its status is the record’s', () => {
    expect(rows.length).toBeGreaterThan(90);
    for (const row of rows) {
      expect(`${ADR_DIR}/${row.file}`, `ADR-${row.number}'s row`).toBe(files.get(row.number));
      expect(statusWord(row.status), `ADR-${row.number}: index "${row.status}", header "${record(row.number).status}"`).toBe(statusWord(record(row.number).status));
    }
  });

  it('each "changed by" link names a record that reached main no earlier, and that record names the one it changes', () => {
    // Numbers are not always in order of acceptance (ADR-0097 was accepted after ADR-0098 and changes it), so the
    // order is main's.
    const position = new Map(log.line.commits.map((c, i) => [c.sha, i]));
    const reached = (n: string) => position.get(log.acceptedIn.get(n) ?? '') ?? Infinity;
    const links = rows.flatMap((row) => row.changedBy.map((by) => ({ changed: row.number, by })));
    expect(links.length).toBeGreaterThan(25);
    for (const { changed, by } of links) {
      expect(files.has(by), `ADR-${changed} changed by ADR-${by}`).toBe(true);
      expect(by, `ADR-${changed} changed by itself`).not.toBe(changed);
      expect(reached(by), `ADR-${changed} changed by ADR-${by}, which reached main before it`).toBeGreaterThanOrEqual(reached(changed));
      expect(read(files.get(by) ?? ''), `ADR-${by} names ADR-${changed}`).toContain(`ADR-${changed}`);
    }
  });

  it('each record that has reached main has an index row', () => {
    const listed = new Set(rows.map((r) => r.number));
    expect([...log.onMain].filter((n) => !listed.has(n)).map((n) => `ADR-${n}`)).toEqual([]);
  });
});

// ——— the rule itself, on temporary repositories ———

const temp = mkdtempSync(path.join(tmpdir(), 'byway-adr-log-'));
afterAll(() => rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
let repos = 0;

/** A fresh repository on branch main, isolated from the person's git configuration (no hooks, no signing). */
function fixture() {
  const dir = path.join(temp, `repo-${++repos}`);
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true });
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
  const git = (...args: string[]): string => {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git('init', '--quiet', '--initial-branch=main');
  const file = (n: string) => path.join(dir, 'docs', 'adr', `${n}-a-decision.md`);
  return {
    dir,
    git,
    write(n: string, status: string, decision: string, context = 'Why it came up.') {
      writeFileSync(file(n), adr(n, status, context, decision));
    },
    append(n: string, text: string) {
      appendFileSync(file(n), text);
    },
    index(rows: string[]) {
      writeFileSync(path.join(dir, 'docs', 'adr', 'README.md'), `# Index\n\n| # | Decision | Status | Decided by | Date |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
    },
    commit(message: string): string {
      git('add', '--all');
      git('commit', '--quiet', '--no-verify', '-m', message);
      return git('rev-parse', 'HEAD');
    },
    check: (exceptions: Exception[] = [], linksFrom = '0001') => checkLog(dir, { exceptions, linksFrom }),
  };
}

const adr = (n: string, status: string, context: string, decision: string) =>
  `# ADR-${n}: A decision\n\n| | |\n|---|---|\n| **Status** | ${status} |\n| **Decided by** | User |\n\n## Context\n\n${context}\n\n## Decision\n\n${decision}\n\n## Consequences\n\nSome.\n`;

const row = (n: string, status: string) => `| [ADR-${n}](${n}-a-decision.md) | A decision | ${status} | User | 2026-10-16 |`;

describe('the rule, on a temporary repository', { timeout: 60_000 }, () => {
  it('an edited Decision fails, and so does an edit not yet committed', () => {
    const r = fixture();
    r.write('0001', 'Accepted', 'We do X.');
    const accepted = r.commit('accept 0001');
    r.write('0001', 'Accepted', 'We do Y.');
    const edit = r.commit('edit 0001');
    expect(r.check().breaches).toEqual([{ record: '0001', part: 'Decision', acceptedIn: accepted.slice(0, 12), changedIn: edit.slice(0, 12) }]);

    const s = fixture();
    s.write('0001', 'Accepted', 'We do X.', 'First context.');
    s.commit('accept 0001');
    s.write('0001', 'Accepted', 'We do X.', 'Second context.');
    expect(s.check().breaches.map((b) => [b.part, b.changedIn])).toEqual([['Context', WORKING_TREE]]);
  });

  it('an appended note passes, and so does a header change', () => {
    const r = fixture();
    r.write('0001', 'Accepted', 'We do X.');
    r.commit('accept 0001');
    r.append('0001', '\n## Note (2026-10-16)\n\nADR-0002 restates this decision.\n');
    r.commit('note on 0001');
    expect(r.check().breaches).toEqual([]);
    r.write('0001', 'Superseded by ADR-0002', 'We do X.');
    r.append('0001', '\n## Note (2026-10-16)\n\nADR-0002 restates this decision.\n');
    r.commit('0001 superseded');
    expect(r.check().breaches).toEqual([]);
  });

  it('the commit that accepts a record may finalise its Decision; the next edit fails', () => {
    const r = fixture();
    r.write('0001', 'Proposed', 'Proposed, not decided.\n\nWe might do X.');
    r.commit('propose 0001');
    r.write('0001', 'Proposed', 'Proposed, not decided.\n\nWe might do X or Y.');
    r.commit('revise the proposal');
    r.write('0001', 'Accepted', 'We do X.');
    const accepted = r.commit('accept 0001');
    expect(r.check().breaches).toEqual([]);
    expect(r.check().acceptedIn.get('0001')).toBe(accepted);
    r.write('0001', 'Accepted', 'We do X and Y.');
    r.commit('edit 0001');
    expect(r.check().breaches.map((b) => b.part)).toEqual(['Decision']);
  });

  it('a draft revised on its branch passes when the branch is merged with --no-ff, and fails when it is fast-forwarded', () => {
    for (const merge of ['--no-ff', '--ff-only']) {
      const r = fixture();
      r.write('0001', 'Accepted', 'We do X.');
      r.commit('accept 0001');
      r.git('switch', '--quiet', '-c', 'fix/draft');
      r.write('0002', 'Accepted', 'First draft.');
      r.commit('draft 0002');
      r.write('0002', 'Accepted', 'Second draft.');
      const revised = r.commit('revise 0002');
      // On the branch, before the merge, its commits are drafts.
      expect(r.check().breaches).toEqual([]);
      r.git('switch', '--quiet', 'main');
      r.git('merge', '--quiet', '--no-edit', merge, 'fix/draft');
      const breaches = r.check().breaches;
      if (merge === '--no-ff') expect(breaches).toEqual([]);
      else expect(breaches.map((b) => [b.record, b.part, b.changedIn])).toEqual([['0002', 'Decision', revised.slice(0, 12)]]);
    }
  });

  it('a branch is held to main’s fixed text before it merges', () => {
    const r = fixture();
    r.write('0001', 'Accepted', 'We do X.');
    r.commit('accept 0001');
    r.git('switch', '--quiet', '-c', 'fix/edit');
    r.write('0001', 'Accepted', 'We do Y.');
    r.commit('edit 0001 on a branch');
    // On the branch, main's first-parent history ends where the branch left it; the edit is in the checked-out files.
    expect(r.check().breaches.map((b) => [b.part, b.changedIn])).toEqual([['Decision', WORKING_TREE]]);
    r.git('switch', '--quiet', 'main');
    r.git('merge', '--quiet', '--no-edit', '--no-ff', 'fix/edit');
    expect(r.check().breaches.map((b) => b.changedIn)).toEqual([r.git('rev-parse', 'HEAD').slice(0, 12)]);
  });

  it('a named exception lets its one edit through; the text after it is fixed again', () => {
    const r = fixture();
    r.write('0001', 'Accepted', 'We do X.');
    r.commit('accept 0001');
    r.write('0001', 'Accepted', 'We do X, as 730ebc7 made true.');
    const corrected = r.commit('correct 0001');
    const exception: Exception = { record: '0001', commit: corrected.slice(0, 7), part: 'Decision', reason: 'a merge race' };
    expect(r.check([exception])).toMatchObject({ breaches: [], used: [exception] });
    r.write('0001', 'Accepted', 'We do Z.');
    const again = r.commit('edit 0001 again');
    expect(r.check([exception]).breaches.map((b) => b.changedIn)).toEqual([again.slice(0, 12)]);
  });

  it('a removed record fails', () => {
    const r = fixture();
    r.write('0001', 'Accepted', 'We do X.');
    r.commit('accept 0001');
    r.git('rm', '--quiet', 'docs/adr/0001-a-decision.md');
    const removed = r.commit('remove 0001');
    expect(r.check().breaches.map((b) => [b.part, b.changedIn])).toEqual([['record', removed.slice(0, 12)]]);
  });

  it('a changing record and its "changed by" link reach main in the same commit, or the check fails', () => {
    const together = fixture();
    together.write('0001', 'Accepted', 'We do X.');
    together.index([row('0001', 'Accepted')]);
    together.commit('accept 0001');
    together.git('switch', '--quiet', '-c', 'fix/next');
    together.write('0002', 'Accepted', 'ADR-0001 is amended: we do X twice.');
    together.commit('0002 on its branch');
    together.git('switch', '--quiet', 'main');
    together.git('merge', '--quiet', '--no-ff', '--no-commit', 'fix/next');
    together.index([row('0001', 'Accepted; changed by [ADR-0002](0002-a-decision.md)'), row('0002', 'Accepted')]);
    together.commit('Merge fix/next, with its index row and link');
    expect(together.check().linkBreaches).toEqual([]);
    // Before linksFrom the rule does not apply.
    const late = fixture();
    late.write('0001', 'Accepted', 'We do X.');
    late.index([row('0001', 'Accepted')]);
    late.commit('accept 0001');
    late.write('0002', 'Accepted', 'ADR-0001 is amended: we do X twice.');
    const record = late.commit('0002');
    late.index([row('0001', 'Accepted; changed by [ADR-0002](0002-a-decision.md)'), row('0002', 'Accepted')]);
    const link = late.commit('index: 0002');
    expect(late.check().linkBreaches).toEqual([{ changed: '0001', by: '0002', recordIn: record.slice(0, 12), linkIn: link.slice(0, 12) }]);
    expect(late.check([], '0003').linkBreaches).toEqual([]);
  });
});

describe('reading records and the index', () => {
  it('reads the status, the Context and the Decision, up to the next section', () => {
    const r = parseRecord(adr('0007', 'Accepted (as a direction)', 'Why.', 'What.\n\n### 1. A part\n\nMore.'));
    expect(r).toEqual({ status: 'Accepted (as a direction)', Context: '## Context\n\nWhy.', Decision: '## Decision\n\nWhat.\n\n### 1. A part\n\nMore.' });
    expect(parseRecord(adr('0007', 'Accepted', 'Why.', 'What.').replace(/\n/g, '\r\n'))).toEqual(parseRecord(adr('0007', 'Accepted', 'Why.', 'What.')));
  });

  it('knows a Decision that opens as a proposal', () => {
    expect(opensAsProposal('## Decision\n\nProposed, not decided.\n\nWe might.')).toBe(true);
    expect(opensAsProposal('## Decision\n\nProposed (r_ux), not decided. Lab never shows')).toBe(true);
    expect(opensAsProposal('## Decision\n\nWe do X. Proposed changes go to a new record.')).toBe(false);
  });

  it('reads an index row’s status from the end, so a "|" in a title does not move it', () => {
    expect(parseIndex('| [ADR-0066](0066-x.md) | A | B | Accepted; changed by [ADR-0094](0094-y.md), [ADR-0100](0100-z.md) | Delegated | 2026-10-07 10:48 |')).toEqual([
      { number: '0066', file: '0066-x.md', status: 'Accepted; changed by [ADR-0094](0094-y.md), [ADR-0100](0100-z.md)', changedBy: ['0094', '0100'] },
    ]);
  });
});
