/**
 * The Route Map generator (scripts/route-map.ts), at the owner's words of 2026-10-23: "the route map artifact should be
 * based on it [the single version of what's pending] in the future" and "nothing in this artifact should be "artifact
 * only" . everything has to flow from backlog file in Git". On the format's fixtures and on the real files, the page it
 * writes holds its data as JSON that parses, every item is a row of the two files (found again at its line, by a
 * reading of the files that is not the generator's), every row is an item, and the headline numbers partition:
 * rows in all = closed (the Done table) + open, and open = Land now yes + small choice + no. Each view holds exactly
 * the rows it says: a route a milestone's rows, each after what it waits on; Land now the yes rows; the queue the small
 * choices and the rows whose Who is owner or both; Waiting on the no rows; the checklists their lines. Each item
 * carries its row's Priority and Trigger type (columns at the owner's word of 2026-10-23: "they should be columns
 * because that helps make the Git files readable too no?"), every view shows the priority, the higher priority comes
 * first within a group, and All open rows filters on both.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generate, MILESTONES, PLACEHOLDER, pageData, PRIORITIES, TEMPLATE, TRIGGER_TYPES, type Docs, type RouteMapData } from '../route-map.ts';
import { read, REPO } from './docs.ts';

const FIXTURES = path.join(REPO, 'scripts', 'test', 'fixtures', 'backlog-sync');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n');
const GOOD: Docs = { backlog: fixture('backlog.md'), playbook: fixture('playbook.md') };
const TEMPLATE_TEXT = readFileSync(TEMPLATE, 'utf8');
const HEAD = { commit: 'abc1234', date: '2026-10-23', dirty: false };

/**
 * The rows of a file as a plain reading finds them, not the generator's: each line of a table whose header line is
 * the format's columns, by its first cell, with its Priority and Trigger type cells (the 4th and the 10th).
 */
function rowsOf(text: string): { id: string; line: number; priority: string; triggerType: string }[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: { id: string; line: number; priority: string; triggerType: string }[] = [];
  let inTable = false;
  lines.forEach((l, i) => {
    if (l.startsWith('| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |')) inTable = true;
    else if (!l.startsWith('|')) inTable = false;
    else if (inTable && !/^\|[-| ]+\|$/.test(l)) {
      const cells = l.split(/(?<!\\)\|/).map((c) => c.trim());
      out.push({ id: cells[1]!, line: i + 1, priority: cells[4]!, triggerType: cells[10]! });
    }
  });
  return out;
}
const rank = (p: string) => ((PRIORITIES as readonly string[]).includes(p) ? (PRIORITIES as readonly string[]).indexOf(p) : PRIORITIES.length);
/** Whether the rows `ids` go the higher priority first. */
const byPriority = (items: Map<string, { priority: string }>, ids: string[]) => ids.every((id, k) => k === 0 || rank(items.get(ids[k - 1]!)!.priority) <= rank(items.get(id)!.priority));

/** The entries of the Done table, by a plain reading: the table lines of its section, past its header. */
function doneEntries(text: string): number {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.startsWith('## Done since'));
  if (start < 0) return 0;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  const table = lines.slice(start, end < 0 ? undefined : end).filter((l) => l.startsWith('|'));
  return Math.max(0, table.length - 2);
}

/** Checks that hold for any page the generator writes, on whatever files it was given. */
function holds(D: RouteMapData, docs: Docs) {
  const c = D.counts;
  // The partition.
  expect(c.total).toBe(c.closed + c.open);
  expect(c.open).toBe(c.land.yes + c.land.maybe + c.land.no);
  expect(D.items).toHaveLength(c.open);
  expect(D.done.entries).toHaveLength(c.closed);
  expect(c.closed).toBe(doneEntries(docs.backlog));
  for (const k of ['yes', 'maybe', 'no'] as const) expect(D.items.filter((i) => i.landNow === k)).toHaveLength(c.land[k]);

  // No item without a row, and no row without an item.
  const rows = [...rowsOf(docs.backlog).map((r) => ({ ...r, file: 'docs/backlog.md' })), ...rowsOf(docs.playbook).map((r) => ({ ...r, file: 'docs/playbook.md' }))];
  expect(D.items.map((i) => `${i.file}:${i.line} ${i.id}`)).toEqual(rows.map((r) => `${r.file}:${r.line} ${r.id}`));
  expect(D.items.map((i) => [i.id, i.priority, i.triggerType])).toEqual(rows.map((r) => [r.id, r.priority, r.triggerType]));
  expect(D.priorities).toEqual([...PRIORITIES]);
  expect(D.triggerTypes).toEqual([...TRIGGER_TYPES]);
  const text = { 'docs/backlog.md': docs.backlog.replace(/\r\n/g, '\n').split('\n'), 'docs/playbook.md': docs.playbook.replace(/\r\n/g, '\n').split('\n') };
  for (const i of D.items) expect(text[i.file][i.line - 1]!.startsWith(`| ${i.id} | `), `${i.file}:${i.line}`).toBe(true);
  const items = new Map(D.items.map((i) => [i.id, i]));

  // Within a group, the higher priority first: each Land now group, each Waiting on group, the small choices, and the
  // other rows that need you within each main milestone.
  for (const g of D.landNow) expect(byPriority(items, g.ids), `Land now ${g.milestone}`).toBe(true);
  for (const w of D.waiting) expect(byPriority(items, w.ids), `Waiting on ${w.need}`).toBe(true);
  expect(byPriority(items, D.queue.smallChoice), 'the small choices').toBe(true);
  for (const m of new Set(D.queue.needYou.map((id) => items.get(id)!.milestones[0])))
    expect(byPriority(items, D.queue.needYou.filter((id) => items.get(id)!.milestones[0] === m)), `need you, ${m}`).toBe(true);

  // Unlocks is the inverse of Waits on.
  for (const i of D.items) for (const u of i.unlocks) expect(items.get(u)!.waitsOn).toContain(i.id);
  for (const i of D.items) for (const w of i.waitsOn) if (items.has(w) && w !== i.id) expect(items.get(w)!.unlocks).toContain(i.id);

  // Routes: one per milestone but none; each the milestone's rows, each after the rows it waits on that are on it.
  expect(D.routes.map((r) => r.id)).toEqual(MILESTONES.filter((m) => m !== 'none'));
  for (const r of D.routes) {
    expect([...r.stops].sort()).toEqual(D.items.filter((i) => i.milestones.includes(r.id)).map((i) => i.id).sort());
    const at = new Map(r.stops.map((id, k) => [id, k]));
    for (const id of r.stops) for (const w of items.get(id)!.waitsOn) if (at.has(w) && w !== id) expect(at.get(w)!, `${w} before ${id} on ${r.id}`).toBeLessThan(at.get(id)!);
  }
  expect(c.noMilestone).toBe(D.items.filter((i) => i.milestones.join() === 'none').length);

  // Land now, the queue and Waiting on.
  expect(D.landNow.flatMap((g) => g.ids).sort()).toEqual(D.items.filter((i) => i.landNow === 'yes').map((i) => i.id).sort());
  for (const g of D.landNow) for (const id of g.ids) expect(items.get(id)!.milestones[0] ?? 'none').toBe(g.milestone);
  expect([...D.queue.smallChoice].sort()).toEqual(D.items.filter((i) => i.landNow === 'maybe').map((i) => i.id).sort());
  expect([...D.queue.needYou].sort()).toEqual(D.items.filter((i) => (i.who === 'owner' || i.who === 'both') && i.landNow !== 'maybe').map((i) => i.id).sort());
  expect(c.queue).toBe(new Set([...D.queue.smallChoice, ...D.queue.needYou]).size);
  expect(c.needYou).toBe(D.items.filter((i) => i.ownerNeeded).length);
  expect(D.waiting.flatMap((w) => w.ids).sort()).toEqual(D.items.filter((i) => i.landNow === 'no').map((i) => i.id).sort());

  // The checklists, line by line.
  const checkLines = (heading: string) => {
    const lines = docs.backlog.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
    const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
    return lines.slice(start, end < 0 ? undefined : end).filter((l) => /^- \[[ xX]\] /.test(l));
  };
  expect(D.launchList.flatMap((g) => g.lines)).toHaveLength(checkLines('Launch checklist').length);
  expect(D.review.flatMap((g) => g.lines)).toHaveLength(checkLines('Review checklist').length);
  expect(c.launchList.lines).toBe(c.launchList.ticked + c.launchList.open);
  expect(c.review.lines).toBe(c.review.ticked + c.review.open);
  expect(D.reviewDoc).toBe('docs/reviews/2026-10-08-external-review-verification.md');
}

/**
 * The page's own script, run on a stand-in for the few DOM calls it makes (no browser): every tab shown, every button,
 * marker and table row in it clicked, every select changed to each of its options. It returns what the drawer showed
 * and the text of every view, so a script error on some data, which would leave the page blank, fails here.
 */
function renderAll(html: string): { opened: Set<string>; text: Map<string, string>; filtered: Map<string, string>; table: string[]; drawer: Map<string, string>; errors: string[]; markers: string; went: { n: string; label: string; tab: string; view: string }[] } {
  type Node = El | { nodeType: 3; data: string };
  class El {
    nodeType = 1;
    attrs: Record<string, string> = {};
    kids: Node[] = [];
    on: Record<string, ((e: unknown) => void)[]> = {};
    className = '';
    hidden = false;
    selected = false;
    value = '';
    style = {};
    tag: string;
    constructor(tag: string) {
      this.tag = tag;
    }
    get id() { return this.attrs.id ?? ''; }
    get children() { return this.kids.filter((k): k is El => k instanceof El); }
    set textContent(s: string) { this.kids = [{ nodeType: 3, data: s }]; }
    get textContent(): string { return this.kids.map((k) => (k instanceof El ? k.textContent : k.data)).join(''); }
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); if (k === 'value') this.value = String(v); if (k === 'selected') this.selected = true; }
    addEventListener(k: string, f: (e: unknown) => void) { (this.on[k] ??= []).push(f); }
    append(...n: Node[]) { this.kids.push(...n); }
    replaceChildren(...n: Node[]) { this.kids = n; }
    focus() {}
    fire(k: string, e: unknown = { key: 'Enter', target: this }) { for (const f of this.on[k] ?? []) f(e); }
    all(): El[] { return [this, ...this.children.flatMap((c) => c.all())]; }
  }
  const byId = new Map(['lede', 'asof', 'markers', 'tabs', 'views', 'scrim', 'drawer', 'dkind', 'dtitle', 'dclose', 'dbody'].map((id) => { const e = new El('div'); e.attrs.id = id; return [id, e]; }));
  const opened = new Set<string>();
  // What the drawer's body showed for each row it opened.
  const drawer = new Map<string, string>();
  let openedId = '';
  const dkind = byId.get('dkind')!;
  Object.defineProperty(dkind, 'textContent', { set(s: string) { openedId = s.split(' · ')[0]!; opened.add(openedId); } });
  const dbody = byId.get('dbody')!;
  const append = dbody.append.bind(dbody);
  dbody.append = (...n: Node[]) => { append(...n); drawer.set(openedId, dbody.textContent); };
  const document = { createElement: (t: string) => new El(t), createTextNode: (s: string) => ({ nodeType: 3, data: s }), querySelector: (s: string) => byId.get(s.replace(/^#/, '')) ?? null, addEventListener: () => {}, activeElement: null };
  const location = { hash: '' };
  const history = { replaceState: (_s: unknown, _t: string, h: string) => { location.hash = h; } };
  const localStorage = { getItem: () => { throw new Error('no storage'); }, setItem: () => { throw new Error('no storage'); } };
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const window: { DATA?: unknown } = {};
  const errors: string[] = [];
  const run = (code: string) => new Function('window', 'document', 'location', 'history', 'localStorage', code)(window, document, location, history, localStorage);
  for (const s of scripts) run(s);
  const text = new Map<string, string>();
  // The view after each select is set to each of its options, by "<label>=<value>".
  const filtered = new Map<string, string>();
  let table: string[] = [];
  const views = byId.get('views')!;
  const tabs = byId.get('tabs')!.children;
  const markers = byId.get('markers')!.all().filter((e) => e.on.click);
  for (const tab of tabs) {
    try {
      tab.fire('click');
      text.set(tab.id, views.textContent);
      if (tab.id === 'tab-items') table = views.all().filter((e) => e.tag === 'tr' && e.on.click).map((tr) => tr.children[0]!.textContent);
      // Each select alone (set back to its label before the next), so a filter's view is that filter's.
      for (const sel of views.all().filter((e) => e.tag === 'select')) {
        for (const o of sel.children) { sel.fire('change', { target: { value: o.value } }); filtered.set(`${sel.attrs['aria-label']}=${o.value}`, views.textContent); }
        sel.fire('change', { target: { value: '' } });
      }
      for (const e of views.all()) { if (e !== tab) { e.fire('click'); e.fire('keydown'); } }
    } catch (err) {
      errors.push(`${tab.id}: ${String(err)}`);
    }
  }
  const went: { n: string; label: string; tab: string; view: string }[] = [];
  for (const m of markers)
    try {
      m.fire('click');
      const tab = tabs.find((t) => t.attrs['aria-selected'] === 'true')?.id ?? '';
      went.push({ n: m.children[0]!.textContent, label: m.children[1]!.textContent, tab, view: views.textContent });
    } catch (err) {
      errors.push(`marker: ${String(err)}`);
    }
  return { opened, text, filtered, table, drawer, errors, markers: byId.get('markers')!.textContent, went };
}

describe('the Route Map, on the format fixtures', () => {
  const html = generate(GOOD, TEMPLATE_TEXT, HEAD);
  const D = pageData(html);

  it('fills the template once, keeps its title, and writes only ASCII, the data escaped', () => {
    expect(html).not.toContain(PLACEHOLDER);
    expect(html.startsWith('<title>byway Route Map</title>')).toBe(true);
    expect(html.split('</script>')).toHaveLength(TEMPLATE_TEXT.split('</script>').length);
    expect(/^[\x00-\x7f]*$/.test(TEMPLATE_TEXT), 'the template is ASCII').toBe(true);
    expect(/^[\x00-\x7f]*$/.test(html), 'the page is ASCII').toBe(true);
    const literal = /^window\.DATA = (.*);$/m.exec(html)![1]!;
    expect(literal).not.toMatch(/[<>]/);
    expect(() => JSON.parse(literal)).not.toThrow();
  });

  it('keeps every cell word for word, a script tag, $& and characters outside ASCII included', () => {
    const b005 = D.items.find((i) => i.id === 'B-005')!;
    expect(b005.details).toBe('**Why:** prices.ts is copied by hand; a cell may hold </script><script>alert(1)</script>, $& and $1, and naïve “quotes”.');
    expect(D.items.find((i) => i.id === 'B-001')!.details).toContain('(a | b)');
    expect(D.items.find((i) => i.id === 'PB-02')!).toMatchObject({ title: "**Protect the product's provider keys before the first live run**", files: '`.env.agents`', who: 'owner', ownerNeeded: true, landNow: 'no', landNowWhy: "the owner's step in each provider's console", unlocks: ['B-003'], priority: 'high', triggerType: 'milestone' });
    expect(D.items.find((i) => i.id === 'F03 (a)')!).toMatchObject({ milestones: ['first-live-use', 'others-use'], status: 'open', priority: 'medium', size: 'M', kind: 'fix', triggerType: 'event', filed: '2026-10-18', waitsOn: [], section: 'Product follow-ups (found while building v1)' });
    expect(D.items.find((i) => i.id === 'D9 (a)')!).toMatchObject({ landNow: 'maybe', landNowWhy: 'whether any patent is filed', who: 'owner', priority: 'medium', triggerType: 'owner-decision' });
    expect(D.items.find((i) => i.id === 'B-BoN (a)')!).toMatchObject({ title: 'Compute-matched best-of-N arm (B-BoN)', priority: 'low', triggerType: 'event', filed: 'before 2026-10-07' });
    expect(D.items.find((i) => i.id === 'PB-01')!.unlocks).toEqual(['H1c (a)', 'PB-03']);
  });

  it('has the partitioned numbers, and every view holds the rows it says', () => {
    expect(D.counts).toMatchObject({ total: 21, closed: 3, open: 18, land: { yes: 2, maybe: 3, no: 13 }, needYou: 9, waitsOnRow: 6, noMilestone: 1, queue: 11, launchList: { lines: 4, ticked: 1, open: 3 }, review: { lines: 4, ticked: 1, open: 3 } });
    holds(D, GOOD);
  });

  it('orders a route so each row comes after what it waits on, the rows that can land first, then the higher priority', () => {
    const stops = (m: string) => D.routes.find((r) => r.id === m)!.stops;
    // F03 (a) (medium) comes after the high rows, though it is filed before them; B-003 after PB-02, which it waits on.
    expect(stops('first-live-use')).toEqual(['B-001', 'PB-02', 'B-003', 'B-005', 'F03 (a)']);
    // D1 (a) (medium) before ST9 (a) (low), filed before it; PB-03 after PB-01 and D1 (a), which it waits on.
    expect(stops('study1-stage0')).toEqual(['D9 (a)', 'D1 (a)', 'ST9 (a)', 'PB-01', 'PB-03']);
    expect(stops('others-use')).toEqual(['F01 (a)', 'B-002', 'F03 (a)']);
    expect(stops('pilot')).toEqual(['B-BoN (a)', 'PB-01']);
    expect(stops('confirmatory')).toEqual(['H1c (a)', 'D24 (a)']);
    expect(stops('linux-desktop')).toEqual([]);
  });

  it('groups Land now by main milestone and Waiting on by what the rows need, and sorts the queue, the higher priority first', () => {
    expect(D.landNow.map((g) => [g.milestone, g.ids])).toEqual([['first-live-use', ['B-001']], ['none', ['B-007']]]);
    expect(D.waiting.find((w) => w.need === 'the research track resumes')!.ids).toEqual(['D1 (a)', 'ST9 (a)', 'B-BoN (a)', 'PB-01', 'D24 (a)', 'PB-03']);
    // F01 (a) is high; B-002 and D9 (a) are medium, and B-002 opens a row (X-VAL-4 (a)) where D9 (a) opens none.
    expect(D.queue.smallChoice).toEqual(['F01 (a)', 'B-002', 'D9 (a)']);
    // By main milestone; within first-live-use all are high, so the one that opens most rows (PB-02) first; within study1-stage0 D1 (a) (medium) first.
    expect(D.queue.needYou).toEqual(['PB-02', 'B-003', 'B-005', 'B-006', 'D1 (a)', 'PB-01', 'PB-03', 'D24 (a)']);
  });

  it('names the commit and day it was generated at, and says when the files were not committed', () => {
    expect(D.asOf).toContain('commit abc1234 (2026-10-23)');
    expect(D.asOf).not.toContain('not yet committed');
    expect(pageData(generate(GOOD, TEMPLATE_TEXT, { ...HEAD, dirty: true })).asOf).toContain('not yet committed');
    expect(D.linkBase).toBeNull();
    expect(pageData(generate(GOOD, TEMPLATE_TEXT, HEAD, 'https://example.test/blob/abc1234')).linkBase).toBe('https://example.test/blob/abc1234');
  });

  it("renders every view with the page's own script, and opens every row from them", () => {
    const { opened, text, errors, markers } = renderAll(html);
    expect(errors).toEqual([]);
    expect([...opened].sort()).toEqual(D.items.map((i) => i.id).sort());
    expect([...text.keys()]).toEqual(['tab-routes', 'tab-land', 'tab-queue', 'tab-waiting', 'tab-items', 'tab-launch', 'tab-review', 'tab-done']);
    expect(markers).toContain('Rows in all = closed + open (21 = 3 + 18)');
    expect(markers).toContain('The open rows by Land now (18 = 2 + 3 + 13)');
    expect(text.get('tab-items')).toContain('18 of the 18 open rows');
    expect(text.get('tab-queue')).toContain('Your choice: whether any patent is filed');
    expect(text.get('tab-review')).toContain('docs/reviews/2026-10-08-external-review-verification.md');
    expect(text.get('tab-done')).toContain('B-004 Merge block 2 to main');
    expect(text.get('tab-launch')).toContain('B-004 (closed)');
  });

  it('takes each marker to a view, and each that filters the open rows shows as many rows as it says', () => {
    const { went, errors } = renderAll(html);
    expect(errors).toEqual([]);
    expect(went.map((w) => [w.label, w.n, w.tab])).toEqual([
      ['closed (the Done table)', '3', 'tab-done'],
      ['open (pending rows)', '18', 'tab-items'],
      ['open', '18', 'tab-items'],
      ['yes: an agent can land it now', '2', 'tab-land'],
      ['small choice: after one choice of yours', '3', 'tab-queue'],
      ['no: needs something not there today', '13', 'tab-waiting'],
      ['need you (Who is owner or both)', '9', 'tab-items'],
      ['wait on another open row', '6', 'tab-items'],
      ['on the first-live-use route', '5', 'tab-routes'],
      ['no milestone (wait for their trigger)', '1', 'tab-items'],
      ['Launch checklist lines open, of 4', '3', 'tab-launch'],
      ['Review checklist lines open, of 4', '3', 'tab-review'],
    ]);
    for (const w of went.filter((x) => x.tab === 'tab-items')) expect(w.view, w.label).toContain(`${w.n} of the 18 open rows`);
    expect(renderAll(html).markers).toContain('21rows in all');
  });

  it('shows Priority and Trigger type in All open rows, filters on each, and sorts by priority within Land now and main milestone', () => {
    const { text, filtered, table, drawer, errors } = renderAll(html);
    expect(errors).toEqual([]);
    const all = text.get('tab-items')!;
    expect(all).toContain('IDItemStatusPriorityLand nowWhoMilestoneSizeKindTrigger typeTrigger');
    // The filters' options in the format's order (Priority highest first), and Filed's days latest first, then "before".
    expect(all).toContain('PriorityPriority: highPriority: mediumPriority: low');
    expect(all).toContain(`Trigger type${TRIGGER_TYPES.map((t) => `Trigger type: ${t}`).join('')}`);
    expect(all).toContain('Filed: 2026-10-07Filed: before 2026-10-07');
    for (const p of PRIORITIES) expect(filtered.get(`Priority=${p}`), p).toContain(`${D.items.filter((i) => i.priority === p).length} of the 18 open rows`);
    for (const t of TRIGGER_TYPES) expect(filtered.get(`Trigger type=${t}`), t).toContain(`${D.items.filter((i) => i.triggerType === t).length} of the 18 open rows`);
    expect(filtered.get('Priority=high')).toContain('PB-02');
    expect(filtered.get('Priority=high')).not.toContain('F03 (a)');
    expect(filtered.get('Trigger type=date')).toContain('PB-03');
    // By Land now, then main milestone (in the format's order), then priority: F03 (a) (medium) after B-003, B-005 and
    // PB-02 (high), D1 (a) (medium) before ST9 (a) (low), H1c (a) (medium) before D24 (a) (low).
    expect(table).toEqual(['B-001', 'B-007', 'F01 (a)', 'B-002', 'D9 (a)', 'B-003', 'B-005', 'PB-02', 'F03 (a)', 'B-006', 'X-VAL-4 (a)', 'D1 (a)', 'ST9 (a)', 'PB-01', 'PB-03', 'B-BoN (a)', 'H1c (a)', 'D24 (a)']);
    // The drawer names both, and every view shows each row's priority.
    expect(drawer.get('PB-03')).toContain('Prioritylow');
    expect(drawer.get('PB-03')).toContain('Trigger typedate');
    expect(text.get('tab-routes')).toContain('high B-001');
    expect(text.get('tab-land')).toContain('B-001highAn adapter error');
    expect(text.get('tab-queue')).toContain('high F01 (a)');
    expect(text.get('tab-waiting')).toContain('D1 (a)mediumD1 Baseline set');
  });

  it('holds the checklists line by line, with the IDs each names', () => {
    expect(D.launchList.map((g) => g.group)).toEqual(['Before the first live run', 'The first live run (C4 on Balanced)']);
    expect(D.launchList[0]!.lines[1]).toMatchObject({ checked: false, ids: ['B-001', 'F03 (a)'], line: 23 });
    expect(D.review.flatMap((g) => g.lines.map((l) => [l.code, l.checked, l.ids]))).toEqual([['F01', true, []], ['F01', false, ['F01 (a)']], ['F03', false, ['F03 (a)']], ['X-VAL-4', false, ['X-VAL-4 (a)', 'B-002']]]);
    expect(D.doneIds).toEqual(['B-004']);
  });
});

describe('the Route Map, on docs/backlog.md and docs/playbook.md', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-route-map-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'route-map.html');
  const run = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'route-map.ts'), out], { cwd: REPO, encoding: 'utf8' });
  const REAL: Docs = { backlog: read('docs/backlog.md'), playbook: read('docs/playbook.md') };

  it('runs with plain Node and writes a page whose data parses', () => {
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/rows in all = \d+ closed \+ \d+ open; open = \d+ land now \+ \d+ small choice \+ \d+ not now/);
    const D = pageData(readFileSync(out, 'utf8'));
    expect(D.asOf).toMatch(/at commit [0-9a-f]{7,} \(\d{4}-\d{2}-\d{2}\)/);
  });

  it('has rows, the partitioned numbers, and no item without a row', () => {
    const D = pageData(readFileSync(out, 'utf8'));
    expect(D.items.length, 'no table of either file has the format\'s columns yet').toBeGreaterThan(0);
    holds(D, REAL);
  });
});
