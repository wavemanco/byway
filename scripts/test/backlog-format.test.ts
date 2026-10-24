/**
 * The backlog format of 2026-10-23, held on docs/backlog.md and docs/playbook.md. The owner, 2026-10-23: "a single
 * version of what's pending. the route map artifact should be based on it in the future" and "nothing in this artifact
 * should be "artifact only" . everything has to flow from backlog file in Git". So every pending item is a row of a
 * table with the format's columns (scripts/route-map.ts's COLUMNS), the Route Map is generated from those rows
 * (scripts/route-map.ts; its page is tested in route-map.test.ts), and this test fails when a row could not be read
 * into it. The rules, one test each, on the real files and on fixtures (one good file pair, and a bad change of it for
 * each rule, so each rule is seen to fail):
 * - columns: every pending table has the 15 columns, in order (Priority after Status and Trigger type before Trigger,
 *   columns at the owner's word of 2026-10-23: "they should be columns because that helps make the Git files readable
 *   too no?"), and every row as many cells;
 * - not-in-table: a pending section holds no list item (each pending item is a row; the user, 2026-10-23: "that file
 *   can benefit from a tabular format instead of bullets in sections that are not checklists");
 * - id-form, id-unique, id-umbrella: every ID is B-001 or PB-01 shaped, or "<code> (<letters>)", is unique across both
 *   files, and its code is named by the row's title or Details, or by a Review checklist line of that code that names
 *   the row. A code is a capital, then capitals and digits, with lower-case letters only straight after a digit (H1c)
 *   or in a later part after a hyphen (B-BoN, B-Skill, C1-HITL), so beyond the review's codes and D1-D9 it takes the
 *   Study 1 and decision codes a title names (ST9, ST12, SM-5, C1-H, D10, D24). It tells such a code from B-### by
 *   what follows the hyphen: a code whose rest is all digits (B-001, PB-02), or B or PB alone, is a row number, and a
 *   row number never takes a letter (id-form fails "B-007 (a)"), while B-BoN's rest is not digits. An ADR number is
 *   not a code either;
 * - values: Status, Priority, Milestone, Who, Size, Kind, Trigger type and Filed in their sets (Filed a day or
 *   "before 2026-10-07"), and Item, Details and Files not empty;
 * - land-now, land-now-yes: Land now starts with "yes", "small choice: " or "no: ", and a yes row is the agent's and
 *   waits on nothing (the format's yes: no owner decision or action, nothing it waits on open);
 * - trigger: not empty, and at most 30 words;
 * - waits-on: every ID it names is a pending row, not the row itself, and no chain of them goes round a cycle;
 * - references: every ID a Launch or Review checklist line or the Plan names is a pending row or in the Done table,
 *   and every open checklist line names one.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKLOG, COLUMNS, formatProblems, idForm, idsIn, parseDocs, PLAYBOOK, PRIORITIES, RULES, TRIGGER_TYPES, type Docs, type Problem, type Rule } from '../route-map.ts';
import { read, REPO } from './docs.ts';

const FIXTURES = path.join(REPO, 'scripts', 'test', 'fixtures', 'backlog-sync');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n');
const GOOD: Docs = { backlog: fixture('backlog.md'), playbook: fixture('playbook.md') };

const problems = (docs: Docs) => formatProblems(parseDocs(docs));
const say = (ps: Problem[]) => ps.map((p) => `${p.file}:${p.line} [${p.rule}] ${p.message}`);

/** `text` with `from` replaced by `to`, where `from` must be there exactly once (so a bad fixture is what it says). */
function once(text: string, from: string, to: string): string {
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + 1) >= 0) throw new Error(`"${from}" is not in the fixture exactly once`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}
const inBacklog = (from: string, to: string): Docs => ({ ...GOOD, backlog: once(GOOD.backlog, from, to) });
const inPlaybook = (from: string, to: string): Docs => ({ ...GOOD, playbook: once(GOOD.playbook, from, to) });
const ROW_B007 = "| B-007 | Templates for the Study 1 research arms' prompt ids | open | low | none | agent | yes | S | build | now | Whenever an agent picks it up. | — |";
/** The PB-03 table's header and separator, which a bad fixture changes. */
const HEADER = `| ${COLUMNS.join(' | ')} |\n|${'---|'.repeat(COLUMNS.length)}\n| PB-03`;

/** Each bad fixture: the change, and the rules it must break (and only those). */
const BAD: { name: string; docs: () => Docs; rules: Rule[] }[] = [
  { name: 'a pending table with other columns', rules: ['columns'], docs: () => ({ ...GOOD, backlog: `${GOOD.backlog}\n## Before any distribution\n\n| Item | Why |\n|---|---|\n| An old row | Not in the format |\n` }) },
  { name: 'a pending table whose columns are out of order', rules: ['columns'], docs: () => inPlaybook(HEADER, HEADER.replace('| Status | Priority |', '| Priority | Status |')) },
  { name: 'a pending table in the 13 columns before Priority and Trigger type', rules: ['columns'], docs: () => inPlaybook(HEADER, `| ${COLUMNS.filter((c) => c !== 'Priority' && c !== 'Trigger type').join(' | ')} |\n|${'---|'.repeat(COLUMNS.length - 2)}\n| PB-03`) },
  { name: 'a cell with an unescaped pipe', rules: ['columns', 'values'], docs: () => inBacklog('(a \\| b)', '(a | b)') },
  { name: 'a pending item kept as a bullet', rules: ['not-in-table'], docs: () => inBacklog('Found while building v1; each row says when it is picked up.', 'Found while building v1; each row says when it is picked up.\n\n- An item kept as a bullet, not a row') },
  { name: 'an ID of neither form', rules: ['id-form'], docs: () => inBacklog('| B-007 |', '| B-7 |') },
  { name: 'an ADR number as an umbrella code', rules: ['id-form'], docs: () => inBacklog('| B-006 |', '| ADR-0064 (a) |') },
  { name: 'a backlog row number with a letter', rules: ['id-form'], docs: () => inBacklog('| B-007 |', '| B-007 (a) |') },
  { name: 'a playbook row number with a letter', rules: ['id-form'], docs: () => inPlaybook('| PB-03 |', '| PB-03 (a) |') },
  { name: 'B alone as an umbrella code', rules: ['id-form'], docs: () => inBacklog('| B-006 |', '| B (a) |') },
  { name: 'a word of prose as an umbrella code', rules: ['id-form'], docs: () => inBacklog('| B-006 |', '| Owner (a) |') },
  { name: "a backlog ID in the playbook", rules: ['id-form'], docs: () => inPlaybook('| PB-03 |', '| B-010 |') },
  { name: 'an ID used twice in one file', rules: ['id-unique'], docs: () => inBacklog('| B-007 |', '| B-001 |') },
  { name: 'an ID used in both files', rules: ['id-unique'], docs: () => inPlaybook('| D9 (a) | **Funding, patents and legal entity** (D9) |', '| D1 (a) | **Funding, patents and legal entity** (D1) |') },
  { name: 'an umbrella code its row does not name', rules: ['id-umbrella'], docs: () => inBacklog("| ST9 (a) | ST9's threshold", '| ST9 (a) | The threshold') },
  { name: 'a code with lower-case letters its row does not name', rules: ['id-umbrella'], docs: () => inBacklog('| B-BoN (a) | Compute-matched best-of-N arm (B-BoN) |', '| B-BoN (a) | Compute-matched best-of-N arm |') },
  { name: 'a code its row named only in the Details, taken out', rules: ['id-umbrella'], docs: () => inPlaybook(' **Decision:** D24 |', ' |') },
  { name: 'a Status outside its set', rules: ['values'], docs: () => inBacklog('| B-006 | Run byway inside coding agents, on the person\'s own subscription | open |', '| B-006 | Run byway inside coding agents, on the person\'s own subscription | pending |') },
  { name: 'a Priority outside its set', rules: ['values'], docs: () => inBacklog('| partly | high |', '| partly | urgent |') },
  { name: 'an empty Priority', rules: ['values'], docs: () => inBacklog('| open | low | agent-layer |', '| open |  | agent-layer |') },
  { name: 'a Milestone outside its set', rules: ['values'], docs: () => inBacklog('| open | low | agent-layer |', '| open | low | agent-layers |') },
  { name: 'none beside a milestone', rules: ['values'], docs: () => inBacklog('| low | none | agent | yes |', '| low | none, others-use | agent | yes |') },
  { name: 'a Trigger type outside its set', rules: ['values'], docs: () => inPlaybook('| outside-action | date |', '| outside-action | soon |') },
  { name: 'an empty Trigger type', rules: ['values'], docs: () => inBacklog('| build | now |', '| build |  |') },
  { name: 'a Filed "before" another day', rules: ['values'], docs: () => inBacklog('clause-scoped. | docs/study1/protocol-v1.1-draft.md | before 2026-10-07 |', 'clause-scoped. | docs/study1/protocol-v1.1-draft.md | before 2026-10-06 |') },
  { name: 'a Who outside its set', rules: ['values'], docs: () => inBacklog('| agent-layer | owner |', '| agent-layer | claude |') },
  { name: 'a Size outside its set', rules: ['values'], docs: () => inBacklog('| XL | research-decision |', '| XXL | research-decision |') },
  { name: 'a Kind outside its set', rules: ['values'], docs: () => inBacklog('| XL | research-decision |', '| XL | feature |') },
  { name: 'a Filed that is not a day', rules: ['values'], docs: () => inBacklog('| packages/prompts | 2026-10-07 |', '| packages/prompts | 2026-13-07 |') },
  { name: 'an empty Files', rules: ['values'], docs: () => inBacklog('| packages/prompts | 2026-10-07 |', '|  | 2026-10-07 |') },
  { name: 'an empty Item', rules: ['values'], docs: () => inBacklog("| B-007 | Templates for the Study 1 research arms' prompt ids |", '| B-007 |  |') },
  { name: 'a Land now with no known start', rules: ['land-now'], docs: () => inBacklog('| owner | no: a design brief and an ADR the owner schedules |', '| owner | maybe |') },
  { name: 'a small choice that names no choice', rules: ['land-now'], docs: () => inBacklog('| agent | small choice: whether the weekly run only reports an advisory or also fails on it |', '| agent | small choice: |') },
  { name: 'a no without its need', rules: ['land-now'], docs: () => inBacklog('| owner | no: a design brief and an ADR the owner schedules |', '| owner | no |') },
  { name: "a yes that is not the agent's alone", rules: ['land-now-yes'], docs: () => inBacklog('| high | first-live-use | agent | yes |', '| high | first-live-use | both | yes |') },
  { name: 'a yes that waits on an open row', rules: ['land-now-yes'], docs: () => inBacklog(ROW_B007, ROW_B007.replace(/\| — \|$/, '| B-003 |')) },
  { name: 'an empty Trigger', rules: ['trigger'], docs: () => inBacklog('| After each live run. |', '|  |') },
  { name: 'a Trigger over 30 words', rules: ['trigger'], docs: () => inBacklog('| After each live run. |', `| ${'After each live run, '.repeat(8)}and then again. |`) },
  { name: 'a Waits on that names no row', rules: ['waits-on'], docs: () => inBacklog('| After the first live run (ADR-0064). | B-003 |', '| After the first live run (ADR-0064). | B-099 |') },
  { name: 'a row that waits on itself', rules: ['waits-on'], docs: () => inBacklog('| After the first live run (ADR-0064). | B-003 |', '| After the first live run (ADR-0064). | B-006 |') },
  { name: 'a Waits on cycle', rules: ['waits-on'], docs: () => inBacklog('| The owner\'s steps before the first live run are done. | PB-02 |', '| The owner\'s steps before the first live run are done. | PB-02, B-005 |') },
  { name: 'an empty Waits on', rules: ['waits-on'], docs: () => inBacklog('| After the first live run (ADR-0064). | B-003 |', '| After the first live run (ADR-0064). |  |') },
  { name: 'a Launch checklist line naming no such row', rules: ['references'], docs: () => inBacklog('*Settles:* PB-02.', '*Settles:* PB-02, B-098.') },
  { name: 'an open Review checklist line naming no row', rules: ['references'], docs: () => inBacklog('*Row:* F01 (a). *When:*', '*Row:* the product-rules row. *When:*') },
  { name: 'the Plan naming no such row', rules: ['references'], docs: () => inBacklog('B-001 and F01 (a).', 'B-001, F01 (a) and F07 (a).') },
  { name: 'the Plan naming a code with lower-case letters that no row has', rules: ['references'], docs: () => inBacklog('B-BoN (a) and H1c (a).', 'B-BoN (a), B-Skill (a) and H1c (a).') },
];

describe('the backlog format, on fixtures', () => {
  it('the good fixture keeps every rule, and has rows of every kind the rules look at', () => {
    expect(say(problems(GOOD))).toEqual([]);
    const m = parseDocs(GOOD);
    expect(m.rows.map((r) => r.id)).toEqual(['B-001', 'F01 (a)', 'F03 (a)', 'B-002', 'B-003', 'B-005', 'B-006', 'ST9 (a)', 'B-BoN (a)', 'H1c (a)', 'D1 (a)', 'X-VAL-4 (a)', 'B-007', 'PB-01', 'PB-02', 'D9 (a)', 'D24 (a)', 'PB-03']);
    expect(m.rows.find((r) => r.id === 'B-001')!.cells.Details).toContain('(a | b)');
    expect(m.rows.find((r) => r.id === 'B-003')!.cells).toMatchObject({ Status: 'partly', Priority: 'high', 'Trigger type': 'other-row', Trigger: "The owner's steps before the first live run are done.", Filed: 'before 2026-10-07' });
    // Every Priority and Trigger type value is on some row; "before 2026-10-07" is a Filed the rules accept.
    expect(new Set(m.rows.map((r) => r.cells.Priority))).toEqual(new Set(PRIORITIES));
    expect(new Set(m.rows.map((r) => r.cells['Trigger type']))).toEqual(new Set(TRIGGER_TYPES));
    expect(m.rows.filter((r) => r.cells.Filed === 'before 2026-10-07').length).toBeGreaterThan(1);
    // The codes beyond the review's and D1-D9: in a title (B-BoN, H1c), in the Details (D24), or by a Review checklist line (X-VAL-4).
    expect(m.rows.find((r) => r.id === 'D24 (a)')!.cells.Item).not.toContain('D24');
    expect(m.rows.find((r) => r.id === 'X-VAL-4 (a)')!.cells.Item).not.toContain('X-VAL-4');
    expect(m.done.entries).toHaveLength(3);
    expect(m.launchList.map((l) => [l.checked, l.ids])).toEqual([[true, ['B-004']], [false, ['B-001', 'F03 (a)']], [false, ['PB-02']], [false, ['B-003', 'B-005']]]);
    expect(m.review.map((l) => l.code)).toEqual(['F01', 'F01', 'F03', 'X-VAL-4']);
    expect(m.planIds.map((p) => p.id)).toEqual(['B-004', 'B-001', 'F01 (a)', 'B-003', 'B-BoN (a)', 'H1c (a)']);
  });

  it('tells an umbrella code from a row number and from a word, in an ID and in prose', () => {
    for (const id of ['F01 (a)', 'R3 (a)', 'RS (b)', 'G07 (a)', 'X-VAL-4 (a)', 'SUB-EP-9 (aa)', 'D1 (a)', 'D10 (a)', 'D13 (a)', 'D24 (a)', 'ST9 (a)', 'ST12 (a)', 'SM-5 (a)', 'C1-H (a)', 'C1-HITL (a)', 'H1c (a)', 'B-BoN (a)', 'B-Skill (a)', 'B-Outside (a)'])
      for (const file of [BACKLOG, PLAYBOOK] as const) expect(idForm(file, id), `${id} in ${file}`).toBe(true);
    for (const id of ['B-001 (a)', 'PB-02 (a)', 'B-12 (a)', 'B (a)', 'PB (a)', 'ADR-0064 (a)', 'ADR (a)', 'Owner (a)', 'Follow-up (a)', 'Compute-matched (a)', 'h1c (a)', 'F01', 'F01 (A)', 'F01(a)', 'F01 (abc)', 'B-7', 'B-BoN'])
      expect(idForm(BACKLOG, id), id).toBe(false);
    expect(idForm(BACKLOG, 'B-001')).toBe(true);
    expect(idForm(PLAYBOOK, 'B-001')).toBe(false);
    expect(idsIn('B-BoN (a), H1c (b) and F01 (a) wait on B-001 and PB-02; not B-Skill + B-BoN, a Follow-up (a), Owner (b), X-F01, nor the B-001 (a) that is B-001.')).toEqual(['B-BoN (a)', 'H1c (b)', 'F01 (a)', 'B-001', 'PB-02']);
    // A code inside a longer one is not read apart: X-F01 (a) is not F01 (a).
    expect(idsIn('Only X-F01 (a).')).toEqual(['X-F01 (a)']);
  });

  it('has a bad fixture for every rule', () => {
    expect(new Set(BAD.flatMap((b) => b.rules))).toEqual(new Set(RULES));
  });

  for (const bad of BAD)
    it(`fails ${bad.rules.join(' and ')} on ${bad.name}`, () => {
      const found = problems(bad.docs());
      expect(found.length, 'the change broke no rule').toBeGreaterThan(0);
      expect([...new Set(found.map((p) => p.rule))].sort(), say(found).join('\n')).toEqual([...bad.rules].sort());
    });
});

describe('the backlog format, on docs/backlog.md and docs/playbook.md', () => {
  const REAL: Docs = { backlog: read('docs/backlog.md'), playbook: read('docs/playbook.md') };
  const found = problems(REAL);

  it('has pending rows in the format, and a Done table', () => {
    const m = parseDocs(REAL);
    expect(m.rows.length, 'no table of either file has the format\'s columns').toBeGreaterThan(0);
    expect(m.done.entries.length).toBeGreaterThan(0);
    expect(m.launchList.length).toBeGreaterThan(0);
    expect(m.review.length).toBeGreaterThan(0);
  });

  for (const rule of RULES)
    it(`keeps the rule ${rule}`, () => {
      expect(say(found.filter((p) => p.rule === rule))).toEqual([]);
    });
});
