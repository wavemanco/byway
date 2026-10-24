/**
 * The Route Map, generated from the backlog. The owner, 2026-10-23: "a single version of what's pending. the route map
 * artifact should be based on it in the future", and "nothing in this artifact should be "artifact only" . everything
 * has to flow from backlog file in Git". So the page holds nothing but what docs/backlog.md and docs/playbook.md say,
 * and git's head commit for its date: every item is a row of one of their tables, every number counts those rows or
 * the lines of the two checklists, and nothing is kept beside them.
 *
 * What it reads, in the format of the backlog sync of 2026-10-23 (the columns and the ID rule are in COLUMNS and
 * ID_FORM below, and scripts/test/backlog-format.test.ts holds the two files to them):
 * - every row of every table whose header is COLUMNS, in either file: the pending rows;
 * - the rows of the table in docs/backlog.md's "Done since the route map of 2026-10-18": the closed entries;
 * - every line of the Launch checklist and the Review checklist, ticked or not, with the row IDs it names.
 *
 * What it writes: scripts/route-map/page.html with window.DATA filled in. Its views are the routes (one per milestone,
 * each the milestone's open rows, a row after what it waits on), Land now (the "yes" rows by main milestone), your
 * queue (the "small choice" rows with their choice, and the rows whose Who is owner or both), Waiting on (the "no" rows
 * by what they need), every row with a filter per column, the Launch checklist, the Review checklist and the Done
 * table. Every row shows its Priority, and within a group the higher priority comes first (in a route, after what it
 * waits on and after the rows that can land now). Its headline numbers partition: rows in all = closed + open, and
 * open = land now yes + small choice + no; every other number is labelled as a subset of the open rows or as checklist
 * lines.
 *
 * Run with plain Node, which strips the types: `node scripts/route-map.ts <out.html> [--link-base <url>]`. With
 * --link-base (a URL that a repository path is appended to, such as a blob URL at a commit), the page links each row
 * to its line and the review to its file; without it, it names them as paths, so it carries no URL of its own.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKLOG = 'docs/backlog.md';
export const PLAYBOOK = 'docs/playbook.md';
export const REVIEW_DOC = 'docs/reviews/2026-10-08-external-review-verification.md';
export type DocFile = typeof BACKLOG | typeof PLAYBOOK;

/**
 * The columns of every pending table, in this order. Priority and Trigger type are columns at the owner's word of
 * 2026-10-23: "they should be columns because that helps make the Git files readable too no?".
 */
export const COLUMNS = ['ID', 'Item', 'Status', 'Priority', 'Milestone', 'Who', 'Land now', 'Size', 'Kind', 'Trigger type', 'Trigger', 'Waits on', 'Details', 'Files', 'Filed'] as const;
export type Column = (typeof COLUMNS)[number];

export const STATUSES = ['open', 'partly'] as const;
/** Highest first: the order the page sorts rows in within a group. */
export const PRIORITIES = ['high', 'medium', 'low'] as const;
/** What kind of thing a row's Trigger waits for, in the order the page lists them. */
export const TRIGGER_TYPES = ['now', 'event', 'other-row', 'owner-decision', 'milestone', 'date'] as const;
/** The milestones in the order the page shows them; `none` is a follow-up that waits only for its trigger. */
export const MILESTONES = ['first-live-use', 'others-use', 'linux-desktop', 'agent-layer', 'hosted', 'macos', 'distribution', 'study1-stage0', 'pilot', 'confirmatory', 'none'] as const;
export const WHO = ['agent', 'owner', 'both'] as const;
export const SIZES = ['S', 'M', 'L', 'XL'] as const;
export const KINDS = ['fix', 'build', 'test', 'docs', 'chore', 'measure', 'research-decision', 'owner-decision', 'outside-action', 'parked'] as const;
/** The cell of a Waits on or Files that has nothing in it. */
export const NOTHING = '—';
/** The most words a Trigger may have. */
export const TRIGGER_WORDS = 30;

/**
 * What each milestone value means, as the page names it: the backlog format's definitions, shortened. They are labels
 * for the values the rows carry, not data about the rows.
 */
export const MILESTONE_LABELS: Readonly<Record<(typeof MILESTONES)[number], string>> = {
  'first-live-use': "First live use: the owner's first live runs (C4, then C3 on Balanced)",
  'others-use': 'Before anyone besides the owner uses byway with real keys',
  'linux-desktop': 'Linux desktop confirmed beyond CI',
  'agent-layer': 'byway inside coding agents (the agent layer)',
  hosted: 'A hosted byway',
  macos: 'macOS support',
  distribution: 'Before any distribution (a package, the kit, a plugin)',
  'study1-stage0': 'Study 1 Stage 0 registration',
  pilot: 'The Study 1 pilot',
  confirmatory: 'The Study 1 confirmatory study and Stage 2',
  none: 'No milestone: follow-ups that wait only for their trigger',
};

/**
 * The shape of an umbrella code: a capital, then capitals and digits; lower-case letters only straight after a digit
 * (`H1c`) or in a hyphen's later part that starts with a capital or a digit (`B-BoN`, `B-Skill`, `C1-HITL`). So the
 * review's codes (`F01`, `R3`, `RS`, `G07`, `X-VAL-4`, `SUB-EP-9`), the owner's (`D1`, `D24`) and Study 1's (`ST9`,
 * `ST12`, `SM-5`, `C1-H`, `H1c`, `B-BoN`) have it, and a word of prose (`Owner`, `Follow-up`) does not.
 */
const CODE = String.raw`[A-Z][A-Z0-9]*(?:\d[a-z]+)?(?:-[A-Z0-9][A-Za-z0-9]*)*`;
/**
 * A row's ID: `B-001` in docs/backlog.md, `PB-01` in docs/playbook.md, or an umbrella code with a letter, `F01 (a)`.
 * Whether that code really is the row's umbrella is the id-umbrella rule's (its title, its Details or a Review
 * checklist line names it).
 */
export const UMBRELLA_ID = new RegExp(String.raw`^(?<code>${CODE}) \((?<letter>[a-z]{1,2})\)$`);
/**
 * Codes of the umbrella shape that are not umbrella codes: an ADR number, and a row number of the two files (`B-001`,
 * `PB-02`, or `B` or `PB` alone), which never takes a letter. A code that starts `B-` but whose rest is not all digits
 * (`B-BoN`, `B-Skill`) is a code, not a row number.
 */
const NOT_UMBRELLA = /^(?:ADR(?:-|$)|(?:B|PB)(?:-\d+)?$)/;
export const isUmbrellaCode = (code: string): boolean => !NOT_UMBRELLA.test(code);
export const ID_FORM: Readonly<Record<DocFile, RegExp>> = { [BACKLOG]: /^B-\d{3}$/, [PLAYBOOK]: /^PB-\d{2}$/ };
/**
 * Every ID-shaped token in a line of prose (a checklist line, the plan, the Done table). A row number is read before
 * an umbrella code, so `B-001 (a)` in prose is B-001.
 */
const ID_IN_TEXT = new RegExp(String.raw`(?<![\w-])(?:B-\d{3}|PB-\d{2}|${CODE} \([a-z]{1,2}\))(?![\w-])`, 'g');

export const idsIn = (text: string): string[] => [...new Set(text.match(ID_IN_TEXT) ?? [])];

/** Whether `id` has the form of a row ID of `file`. */
export function idForm(file: DocFile, id: string): boolean {
  if (ID_FORM[file].test(id)) return true;
  const code = UMBRELLA_ID.exec(id)?.groups?.code;
  return code !== undefined && isUmbrellaCode(code);
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading the two files.

export interface Docs {
  backlog: string;
  playbook: string;
}

interface Table {
  file: DocFile;
  section: string;
  subsection: string;
  line: number;
  header: string[];
  rows: { line: number; cells: string[] }[];
}

interface ListLine {
  file: DocFile;
  section: string;
  subsection: string;
  line: number;
  /** Ticked or not, for a checklist line; undefined for a plain list item. */
  checked: boolean | undefined;
  text: string;
}

interface Scan {
  file: DocFile;
  tables: Table[];
  lists: ListLine[];
  /** Each `##` section's lines, by heading. */
  sections: { section: string; line: number; text: string }[];
}

/** A Markdown table line's cells, split on pipes that are not escaped, with `\|` read as a pipe. */
export function cellsOf(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  const s = line.trim();
  for (let i = s.startsWith('|') ? 1 : 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const CHECK_ITEM = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/;

function scan(file: DocFile, text: string): Scan {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const tables: Table[] = [];
  const lists: ListLine[] = [];
  const sections: Scan['sections'] = [];
  let section = '';
  let subsection = '';
  let table: Table | undefined;
  let list: ListLine | undefined;
  let fenced = false;
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (/^\s*(?:```|~~~)/.test(raw)) fenced = !fenced;
    const h2 = fenced ? null : /^##\s+(.*?)\s*$/.exec(raw);
    const h3 = fenced ? null : /^###\s+(.*?)\s*$/.exec(raw);
    if (h2) {
      section = h2[1] ?? '';
      subsection = '';
      sections.push({ section, line: n, text: '' });
    } else if (h3) subsection = h3[1] ?? '';
    const current = sections[sections.length - 1];
    if (current) current.text += `${raw}\n`;
    if (fenced || h2 || h3) {
      table = undefined;
      list = undefined;
      return;
    }
    if (raw.trimStart().startsWith('|')) {
      list = undefined;
      if (table) {
        if (!SEPARATOR.test(raw)) table.rows.push({ line: n, cells: cellsOf(raw) });
      } else if (SEPARATOR.test(lines[i + 1] ?? '')) {
        table = { file, section, subsection, line: n, header: cellsOf(raw), rows: [] };
        tables.push(table);
      }
      return;
    }
    table = undefined;
    const check = CHECK_ITEM.exec(raw);
    if (check || LIST_ITEM.test(raw)) {
      list = { file, section, subsection, line: n, checked: check ? check[1] !== ' ' : undefined, text: check ? (check[2] ?? '').trim() : raw.replace(LIST_ITEM, '').trim() };
      lists.push(list);
      return;
    }
    if (list && /^\s+\S/.test(raw)) list.text += ` ${raw.trim()}`;
    else list = undefined;
  });
  return { file, tables, lists, sections };
}

const isPlan = (s: string) => s.startsWith('Plan to all clear');
const isLaunch = (s: string) => s.startsWith('Launch checklist');
const isReview = (s: string) => s.startsWith('Review checklist');
const isDone = (s: string) => s.startsWith('Done since');
// The section that states the format itself: its table lists the columns, not pending rows.
const isFormat = (s: string) => s.startsWith('How this file is kept');
const PLAYBOOK_PENDING = ['1. People and roles', '2. Outside actions', '3. Milestones'];

/** Whether a `##` section of `file` holds pending rows (the backlog format's "Where pending items live"). */
export function pendingSection(file: DocFile, section: string): boolean {
  if (file === PLAYBOOK) return PLAYBOOK_PENDING.some((p) => section.startsWith(p));
  return section !== '' && !isPlan(section) && !isFormat(section) && !isLaunch(section) && !isReview(section) && !isDone(section);
}

const isSpecHeader = (header: readonly string[]) => header.length === COLUMNS.length && COLUMNS.every((c, i) => header[i] === c);

export interface Row {
  id: string;
  file: DocFile;
  line: number;
  /** The `##` section, and its `###` subsection when there is one. */
  section: string;
  cells: Record<Column, string>;
}

export interface CheckLine {
  file: DocFile;
  line: number;
  group: string;
  checked: boolean;
  text: string;
  /** The code a Review checklist line leads with (`**F01**`), if any. */
  code: string | undefined;
  ids: string[];
}

export interface DoneEntry {
  line: number;
  cells: string[];
}

export interface Model {
  rows: Row[];
  done: { headers: string[]; entries: DoneEntry[] };
  /** Every ID the Done section names: the closed rows that kept their ID. */
  doneIds: string[];
  launchList: CheckLine[];
  review: CheckLine[];
  /** The IDs the Plan to all clear names, with the line of each. */
  planIds: { id: string; line: number }[];
  scans: Scan[];
}

/** The two files read into rows, closed entries and checklist lines. It never throws on a malformed row. */
export function parseDocs(docs: Docs): Model {
  const scans = [scan(BACKLOG, docs.backlog), scan(PLAYBOOK, docs.playbook)];
  const rows: Row[] = [];
  for (const s of scans)
    for (const t of s.tables) {
      if (!isSpecHeader(t.header)) continue;
      for (const r of t.rows) {
        const cells = Object.fromEntries(COLUMNS.map((c, i) => [c, r.cells[i] ?? ''])) as Record<Column, string>;
        rows.push({ id: cells.ID, file: s.file, line: r.line, section: t.subsection ? `${t.section} / ${t.subsection}` : t.section, cells });
      }
    }
  const backlog = scans[0]!;
  const doneTables = backlog.tables.filter((t) => isDone(t.section));
  const done = { headers: doneTables[0]?.header ?? [], entries: doneTables.flatMap((t) => t.rows.map((r) => ({ line: r.line, cells: r.cells }))) };
  const doneIds = idsIn(backlog.sections.filter((s) => isDone(s.section)).map((s) => s.text).join('\n'));
  const checks = (pick: (s: string) => boolean): CheckLine[] =>
    backlog.lists
      .filter((l) => pick(l.section) && l.checked !== undefined)
      .map((l) => ({ file: l.file, line: l.line, group: l.subsection, checked: Boolean(l.checked), text: l.text, code: /^\*\*([^*]+)\*\*/.exec(l.text)?.[1]?.trim(), ids: idsIn(l.text) }));
  const planIds: Model['planIds'] = [];
  for (const s of backlog.sections.filter((x) => isPlan(x.section)))
    s.text.split('\n').forEach((l, i) => {
      for (const id of idsIn(l)) planIds.push({ id, line: s.line + i });
    });
  return { rows, done, doneIds, launchList: checks(isLaunch), review: checks(isReview), planIds, scans };
}

// ---------------------------------------------------------------------------------------------------------------------
// The format check (scripts/test/backlog-format.test.ts runs it on the real files and on fixtures).

export const RULES = ['columns', 'not-in-table', 'id-form', 'id-unique', 'id-umbrella', 'values', 'land-now', 'land-now-yes', 'trigger', 'waits-on', 'references'] as const;
export type Rule = (typeof RULES)[number];

export interface Problem {
  rule: Rule;
  file: string;
  line: number;
  message: string;
}

export const listOf = (cell: string): string[] =>
  cell === NOTHING
    ? []
    : cell
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

/** What a Land now cell says: `yes`, `small choice: <choice>` or `no: <need>`; undefined when it is neither. */
export function landNowOf(cell: string): { land: 'yes' | 'maybe' | 'no'; why: string } | undefined {
  if (cell === 'yes') return { land: 'yes', why: '' };
  const m = /^(small choice|no): (\S.*)$/.exec(cell);
  if (!m) return undefined;
  return { land: m[1] === 'no' ? 'no' : 'maybe', why: (m[2] ?? '').trim() };
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const escapeRe = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
/** The code as a whole word (not part of a longer code: F01 is not in F010 or X-F01). */
const wordRe = (code: string) => new RegExp(`(?<![\\w-])${escapeRe(code)}(?![\\w-])`);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** Every way the two files depart from the backlog format, by rule. Empty when they keep it. */
export function formatProblems(model: Model): Problem[] {
  const out: Problem[] = [];
  const add = (rule: Rule, file: string, line: number, message: string) => out.push({ rule, file, line, message });
  const ids = new Set(model.rows.map((r) => r.id));

  // columns, not-in-table
  for (const s of model.scans) {
    for (const t of s.tables) {
      if (!pendingSection(s.file, t.section)) continue;
      if (!isSpecHeader(t.header)) {
        add('columns', s.file, t.line, `a table in "${t.section}" has the columns ${t.header.join(' | ')}, not the backlog format's ${COLUMNS.join(' | ')}`);
        continue;
      }
      for (const r of t.rows) if (r.cells.length !== COLUMNS.length) add('columns', s.file, r.line, `a row has ${r.cells.length} cells, not ${COLUMNS.length} (an unescaped | in a cell?)`);
    }
    for (const l of s.lists) if (pendingSection(s.file, l.section)) add('not-in-table', s.file, l.line, `a list item in "${l.section}" is not a row of a table: ${l.text.slice(0, 80)}`);
  }

  const seen = new Map<string, Row>();
  for (const r of model.rows) {
    const c = r.cells;
    const at = (rule: Rule, message: string) => add(rule, r.file, r.line, `${r.id || '(no ID)'}: ${message}`);
    // id-form, id-unique
    if (!idForm(r.file, r.id)) at('id-form', `the ID is not ${r.file === BACKLOG ? 'B-001' : 'PB-01'}-shaped or an umbrella code with a letter, such as "F01 (a)"`);
    const first = seen.get(r.id);
    if (first) at('id-unique', `the ID is also on ${first.file}:${first.line}`);
    else seen.set(r.id, r);
    // id-umbrella
    const code = UMBRELLA_ID.exec(r.id)?.groups?.code;
    if (code && isUmbrellaCode(code)) {
      const re = wordRe(code);
      const carried = model.review.some((l) => l.code === code && l.ids.includes(r.id));
      // A section can name the code once in its lead, above its table ("Research prerequisites (RS)").
      const lead = model.scans.find((s) => s.file === r.file)?.sections.find((s) => r.section === s.section || r.section.startsWith(`${s.section} / `))?.text.split('\n|')[0] ?? '';
      if (!re.test(c.Item) && !re.test(c.Details) && !re.test(lead) && !carried) at('id-umbrella', `its umbrella code ${code} is not in its Item, its Details or its section's lead, and no Review checklist line of ${code} names it`);
    }
    // values
    if (c.Item === '') at('values', 'the Item is empty');
    if (!(STATUSES as readonly string[]).includes(c.Status)) at('values', `Status "${c.Status}" is not one of ${STATUSES.join(', ')}`);
    if (!(PRIORITIES as readonly string[]).includes(c.Priority)) at('values', `Priority "${c.Priority}" is not one of ${PRIORITIES.join(', ')}`);
    if (!(TRIGGER_TYPES as readonly string[]).includes(c['Trigger type'])) at('values', `Trigger type "${c['Trigger type']}" is not one of ${TRIGGER_TYPES.join(', ')}`);
    const ms = listOf(c.Milestone);
    if (ms.length === 0) at('values', 'Milestone is empty');
    for (const m of ms) if (!(MILESTONES as readonly string[]).includes(m)) at('values', `Milestone "${m}" is not one of ${MILESTONES.join(', ')}`);
    if (new Set(ms).size !== ms.length) at('values', `Milestone "${c.Milestone}" repeats a value`);
    if (ms.includes('none') && ms.length > 1) at('values', `Milestone "${c.Milestone}" pairs none with a milestone`);
    if (!(WHO as readonly string[]).includes(c.Who)) at('values', `Who "${c.Who}" is not one of ${WHO.join(', ')}`);
    if (!(SIZES as readonly string[]).includes(c.Size)) at('values', `Size "${c.Size}" is not one of ${SIZES.join(', ')}`);
    if (!(KINDS as readonly string[]).includes(c.Kind)) at('values', `Kind "${c.Kind}" is not one of ${KINDS.join(', ')}`);
    if (c.Details === '') at('values', 'Details is empty');
    if (c.Files === '') at('values', `Files is empty (it is ${NOTHING} when the row names none)`);
    if (!isDay(c.Filed) && c.Filed !== 'before 2026-10-07') at('values', `Filed "${c.Filed}" is not a day (YYYY-MM-DD) or "before 2026-10-07"`);
    // land-now, land-now-yes
    const land = landNowOf(c['Land now']);
    if (!land) at('land-now', `Land now "${c['Land now'].slice(0, 60)}" does not start with "yes", "small choice: " or "no: " (with what follows)`);
    else if (land.land === 'yes') {
      if (c.Who !== 'agent') at('land-now-yes', `Land now is yes but Who is ${c.Who}: yes means no owner decision or action`);
      if (c['Waits on'] !== NOTHING) at('land-now-yes', `Land now is yes but it waits on ${c['Waits on']}: yes means nothing it waits on is open`);
    }
    // trigger
    if (c.Trigger === '') at('trigger', 'the Trigger is empty');
    else if (words(c.Trigger) > TRIGGER_WORDS) at('trigger', `the Trigger has ${words(c.Trigger)} words, more than ${TRIGGER_WORDS}`);
    // waits-on
    if (c['Waits on'] === '') at('waits-on', `Waits on is empty (it is ${NOTHING} when the row waits on none)`);
    for (const w of listOf(c['Waits on'])) {
      if (w === r.id) at('waits-on', 'it waits on itself');
      else if (!ids.has(w)) at('waits-on', `it waits on ${w}, which is not a pending row`);
    }
  }
  // waits-on: no cycle
  const waits = new Map(model.rows.map((r) => [r.id, listOf(r.cells['Waits on']).filter((w) => ids.has(w) && w !== r.id)]));
  const state = new Map<string, 1 | 2>();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const cycle = trail.slice(trail.indexOf(id));
      const key = [...cycle].sort().join(',');
      const row = seen.get(id);
      if (!reported.has(key) && row) add('waits-on', row.file, row.line, `${id}: Waits on goes round a cycle: ${[...cycle, id].join(' -> ')}`);
      reported.add(key);
      return;
    }
    state.set(id, 1);
    for (const w of waits.get(id) ?? []) visit(w, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of waits.keys()) visit(id, []);

  // references
  const closed = new Set(model.doneIds);
  for (const [where, lines] of [['Launch', model.launchList], ['Review', model.review]] as const)
    for (const l of lines) {
      for (const id of l.ids) if (!ids.has(id) && !closed.has(id)) add('references', l.file, l.line, `the ${where} checklist line names ${id}, which is neither a pending row nor in the Done table`);
      if (!l.checked && l.ids.length === 0) add('references', l.file, l.line, `the open ${where} checklist line names no row ID: ${l.text.slice(0, 80)}`);
    }
  for (const p of model.planIds) if (!ids.has(p.id) && !closed.has(p.id)) add('references', BACKLOG, p.line, `the Plan names ${p.id}, which is neither a pending row nor in the Done table`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The page's data.

export interface Head {
  commit: string;
  date: string;
  /** The docs differ from the commit (generated from a working tree). */
  dirty: boolean;
}

export interface Item {
  id: string;
  title: string;
  section: string;
  file: DocFile;
  line: number;
  status: string;
  priority: string;
  milestones: string[];
  who: string;
  ownerNeeded: boolean;
  landNow: 'yes' | 'maybe' | 'no';
  /** The small choice, or what it needs; empty for yes. */
  landNowWhy: string;
  size: string;
  kind: string;
  triggerType: string;
  trigger: string;
  waitsOn: string[];
  /** The rows that wait on this one (the inverse of Waits on). */
  unlocks: string[];
  details: string;
  files: string;
  filed: string;
}

export interface RouteMapData {
  title: string;
  lede: string;
  asOf: string;
  commit: string;
  date: string;
  dirty: boolean;
  sources: string[];
  generatedBy: string;
  linkBase: string | null;
  reviewDoc: string;
  milestones: { id: string; label: string }[];
  /** The format's Priority values, highest first, and its Trigger type values, for the page's filters and sorting. */
  priorities: string[];
  triggerTypes: string[];
  counts: {
    total: number;
    closed: number;
    open: number;
    land: { yes: number; maybe: number; no: number };
    needYou: number;
    waitsOnRow: number;
    noMilestone: number;
    queue: number;
    launchList: { lines: number; ticked: number; open: number };
    review: { lines: number; ticked: number; open: number };
  };
  items: Item[];
  routes: { id: string; label: string; stops: string[] }[];
  landNow: { milestone: string; label: string; ids: string[] }[];
  queue: { smallChoice: string[]; needYou: string[] };
  waiting: { need: string; ids: string[] }[];
  launchList: { group: string; lines: Omit<CheckLine, 'file' | 'group' | 'code'>[] }[];
  review: { group: string; lines: Omit<CheckLine, 'file' | 'group'>[] }[];
  done: { headers: string[]; entries: DoneEntry[] };
  doneIds: string[];
}

const LAND_ORDER = { yes: 0, maybe: 1, no: 2 } as const;
const msRank = (m: string | undefined) => {
  const i = (MILESTONES as readonly string[]).indexOf(m ?? '');
  return i < 0 ? MILESTONES.length : i;
};
/** high 0, medium 1, low 2; a value outside the set (the format test flags it) after low. */
export const priorityRank = (p: string): number => {
  const i = (PRIORITIES as readonly string[]).indexOf(p);
  return i < 0 ? PRIORITIES.length : i;
};

/** Each check line grouped under its `###` heading, in file order. */
function groups<T extends { group: string }>(lines: T[]): { group: string; lines: Omit<T, 'group'>[] }[] {
  const out: { group: string; lines: Omit<T, 'group'>[] }[] = [];
  for (const l of lines) {
    const { group, ...rest } = l;
    let g = out[out.length - 1];
    if (!g || g.group !== group) out.push((g = { group, lines: [] }));
    g.lines.push(rest);
  }
  return out;
}

/** The page's data, from the two files' rows and checklists and the head commit, and nothing else. */
export function routeMapData(model: Model, head: Head, linkBase: string | null = null): RouteMapData {
  const known = new Set(model.rows.map((r) => r.id));
  const items: Item[] = model.rows.map((r) => {
    const c = r.cells;
    const land = landNowOf(c['Land now']) ?? { land: 'no' as const, why: c['Land now'] };
    return {
      id: r.id,
      title: c.Item,
      section: r.section,
      file: r.file,
      line: r.line,
      status: c.Status,
      priority: c.Priority,
      milestones: listOf(c.Milestone),
      who: c.Who,
      ownerNeeded: c.Who === 'owner' || c.Who === 'both',
      landNow: land.land,
      landNowWhy: land.why,
      size: c.Size,
      kind: c.Kind,
      triggerType: c['Trigger type'],
      trigger: c.Trigger,
      waitsOn: listOf(c['Waits on']),
      unlocks: [],
      details: c.Details,
      files: c.Files,
      filed: c.Filed,
    };
  });
  const byId = new Map<string, Item>();
  for (const i of items) if (!byId.has(i.id)) byId.set(i.id, i);
  for (const i of items) for (const w of i.waitsOn) if (known.has(w) && w !== i.id) byId.get(w)!.unlocks.push(i.id);
  const order = new Map(items.map((i, n) => [i, n]));
  const fileOrder = (a: Item, b: Item) => order.get(a)! - order.get(b)!;
  /** Within a group, the higher priority first. */
  const byPriority = (a: Item, b: Item) => priorityRank(a.priority) - priorityRank(b.priority);
  const priorityThenFile = (a: Item, b: Item) => byPriority(a, b) || fileOrder(a, b);

  // What each row waits on, transitively, and how many rows it opens, transitively.
  const reach = (start: Item, next: (i: Item) => string[]) => {
    const seen = new Set<string>();
    const stack = [...next(start)];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || id === start.id) continue;
      seen.add(id);
      const it = byId.get(id);
      if (it) stack.push(...next(it));
    }
    return seen;
  };
  const before = new Map(items.map((i) => [i, reach(i, (x) => x.waitsOn.filter((w) => known.has(w)))]));
  const opens = new Map(items.map((i) => [i, reach(i, (x) => x.unlocks).size]));

  /**
   * Rows in an order where each comes after what it waits on (directly or through other rows); among the rows free to
   * come next, the ones that can land first, then the higher priority.
   */
  const ordered = (rows: Item[]): Item[] => {
    const left = [...rows].sort((a, b) => LAND_ORDER[a.landNow] - LAND_ORDER[b.landNow] || priorityThenFile(a, b));
    const inRoute = new Set(rows.map((r) => r.id));
    const placed = new Set<string>();
    const out: Item[] = [];
    while (left.length) {
      const k = left.findIndex((r) => [...before.get(r)!].every((w) => !inRoute.has(w) || placed.has(w)));
      const [r] = left.splice(k < 0 ? 0 : k, 1);
      out.push(r!);
      placed.add(r!.id);
    }
    return out;
  };

  const routes = MILESTONES.filter((m) => m !== 'none').map((m) => ({ id: m, label: MILESTONE_LABELS[m], stops: ordered(items.filter((i) => i.milestones.includes(m))).map((i) => i.id) }));
  const main = (i: Item) => i.milestones[0] ?? 'none';
  const landNow: RouteMapData['landNow'] = MILESTONES.map((m) => ({ milestone: m, label: MILESTONE_LABELS[m], ids: items.filter((i) => i.landNow === 'yes' && main(i) === m).sort(priorityThenFile).map((i) => i.id) })).filter((g) => g.ids.length);
  // A "yes" row whose main milestone is not a value of the format still shows, in a group of its own (the format test flags the value).
  const strays = items.filter((i) => i.landNow === 'yes' && !(MILESTONES as readonly string[]).includes(main(i))).sort(priorityThenFile).map((i) => i.id);
  if (strays.length) landNow.push({ milestone: 'unknown', label: 'A milestone the backlog format does not name', ids: strays });
  const byReach = (a: Item, b: Item) => opens.get(b)! - opens.get(a)! || msRank(a.milestones[0]) - msRank(b.milestones[0]) || fileOrder(a, b);
  // The small choices: the higher priority first, then the ones that open more rows. The others that need you: by main
  // milestone, and within one the higher priority first, then the ones that open more rows.
  const smallChoice = items.filter((i) => i.landNow === 'maybe').sort((a, b) => byPriority(a, b) || byReach(a, b));
  const needYou = items.filter((i) => i.ownerNeeded && i.landNow !== 'maybe').sort((a, b) => msRank(a.milestones[0]) - msRank(b.milestones[0]) || byPriority(a, b) || byReach(a, b));
  const needs = new Map<string, { need: string; ids: string[] }>();
  for (const i of items.filter((x) => x.landNow === 'no').sort(priorityThenFile)) {
    const need = i.landNowWhy.replace(/\s+/g, ' ').replace(/[.;]\s*$/, '').trim();
    const key = need.toLowerCase();
    if (!needs.has(key)) needs.set(key, { need, ids: [] });
    needs.get(key)!.ids.push(i.id);
  }
  const waiting = [...needs.values()].sort((a, b) => b.ids.length - a.ids.length || a.need.localeCompare(b.need));

  const count = (f: (i: Item) => boolean) => items.filter(f).length;
  const land = { yes: count((i) => i.landNow === 'yes'), maybe: count((i) => i.landNow === 'maybe'), no: count((i) => i.landNow === 'no') };
  const open = items.length;
  const closed = model.done.entries.length;
  const lines = (ls: CheckLine[]) => ({ lines: ls.length, ticked: ls.filter((l) => l.checked).length, open: ls.filter((l) => !l.checked).length });
  const at = `commit ${head.commit} (${head.date})${head.dirty ? ', with changes to those files not yet committed' : ''}`;
  return {
    title: 'byway Route Map',
    lede: `byway's backlog as a route map. Every row and every number here comes from docs/backlog.md and docs/playbook.md, the single version of what is pending; nothing is kept apart from them. Of the ${open} open rows, ${land.yes} can land now, ${land.maybe} wait on one small choice of yours and ${land.no} need something that is not there today.`,
    asOf: `Generated by scripts/route-map.ts from docs/backlog.md and docs/playbook.md at ${at}`,
    commit: head.commit,
    date: head.date,
    dirty: head.dirty,
    sources: [BACKLOG, PLAYBOOK],
    generatedBy: 'scripts/route-map.ts',
    linkBase,
    reviewDoc: REVIEW_DOC,
    milestones: MILESTONES.map((m) => ({ id: m, label: MILESTONE_LABELS[m] })),
    priorities: [...PRIORITIES],
    triggerTypes: [...TRIGGER_TYPES],
    counts: {
      total: closed + open,
      closed,
      open,
      land,
      needYou: count((i) => i.ownerNeeded),
      waitsOnRow: count((i) => i.waitsOn.some((w) => known.has(w) && w !== i.id)),
      noMilestone: count((i) => i.milestones.length === 1 && i.milestones[0] === 'none'),
      queue: smallChoice.length + needYou.length,
      launchList: lines(model.launchList),
      review: lines(model.review),
    },
    items,
    routes,
    landNow,
    queue: { smallChoice: smallChoice.map((i) => i.id), needYou: needYou.map((i) => i.id) },
    waiting,
    launchList: groups(model.launchList.map(({ file: _f, code: _c, ...l }) => l)),
    review: groups(model.review.map(({ file: _f, ...l }) => l)),
    done: model.done,
    doneIds: model.doneIds,
  };
}

/** Where the template takes the data. */
export const PLACEHOLDER = '/*DATA*/null';

/**
 * The data as a script literal: JSON with `<` and every character outside ASCII escaped, so a cell holding
 * `</script>` cannot end the script and the page reads the same whatever encoding a browser guesses.
 */
export const dataLiteral = (data: RouteMapData): string => JSON.stringify(data).replace(/[<>&\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function renderPage(template: string, data: RouteMapData): string {
  const at = template.indexOf(PLACEHOLDER);
  if (at < 0 || template.indexOf(PLACEHOLDER, at + 1) >= 0) throw new Error(`the template must hold ${PLACEHOLDER} exactly once`);
  return template.slice(0, at) + dataLiteral(data) + template.slice(at + PLACEHOLDER.length);
}

/** The page for two files' texts, the template and the head commit. */
export const generate = (docs: Docs, template: string, head: Head, linkBase: string | null = null): string => renderPage(template, routeMapData(parseDocs(docs), head, linkBase));

/** The JSON a generated page holds, parsed (for the tests and for anyone checking a page). */
export function pageData(html: string): RouteMapData {
  const m = /^window\.DATA = (.*);\r?$/m.exec(html);
  if (!m?.[1]) throw new Error('no window.DATA line in the page');
  return JSON.parse(m[1]) as RouteMapData;
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE = path.join(ROOT, 'scripts', 'route-map', 'page.html');

/** The head commit's short id and day, and whether the two files differ from it. */
export function gitHead(root = ROOT): Head {
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const [commit = '', date = ''] = git('log', '-1', '--format=%h%x09%cs').split('\t');
  return { commit, date, dirty: git('status', '--porcelain', '--', BACKLOG, PLAYBOOK) !== '' };
}

export const readDocs = (root = ROOT): Docs => ({ backlog: readFileSync(path.join(root, BACKLOG), 'utf8'), playbook: readFileSync(path.join(root, PLAYBOOK), 'utf8') });

function main(argv: string[]): number {
  const args = [...argv];
  let linkBase: string | null = null;
  const k = args.indexOf('--link-base');
  if (k >= 0) {
    linkBase = (args[k + 1] ?? '').replace(/\/+$/, '') || null;
    args.splice(k, 2);
  }
  const out = args[0];
  if (!out || args.length > 1 || (k >= 0 && !linkBase)) {
    console.error('usage: node scripts/route-map.ts <out.html> [--link-base <url>]');
    return 2;
  }
  const model = parseDocs(readDocs());
  const data = routeMapData(model, gitHead(), linkBase);
  writeFileSync(out, renderPage(readFileSync(TEMPLATE, 'utf8'), data));
  const c = data.counts;
  console.log(`${out}: ${c.total} rows in all = ${c.closed} closed + ${c.open} open; open = ${c.land.yes} land now + ${c.land.maybe} small choice + ${c.land.no} not now (${data.asOf})`);
  const problems = formatProblems(model);
  if (problems.length) console.warn(`The two files depart from the backlog format in ${problems.length} places (pnpm exec vitest run scripts/test/backlog-format.test.ts lists them).`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
