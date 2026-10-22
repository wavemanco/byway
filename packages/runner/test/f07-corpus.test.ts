/**
 * F07's arbiter corpus (test/f07-corpus, ADR-0081) is kept to be run again by hand before a Playwright upgrade; it takes
 * hours, so it is not run here. What is checked here is that the corpus is still the one round 14 ran: the pages byte
 * for byte (the VOICE reader works on the HTML source, so a converted line end is a different page), every realistic
 * page in exactly one of run-realistic.sh's groups, and round 14's recorded outcomes covering those groups' pages. And
 * compare-hand.mjs, which needs no browser, is run on hand-case runs rebuilt from round 13's outcomes: it passes only a
 * run that has every case.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('./f07-corpus/', import.meta.url));
const read = (rel: string) => readFileSync(DIR + rel);
const pagesOf = (folder: string) => readdirSync(DIR + folder).filter((f) => f.endsWith('.html')).sort();

/** One digest of a folder's pages: each name, then its bytes. */
function digest(folder: string): string {
  const h = createHash('sha256');
  for (const f of pagesOf(folder)) h.update(`${f}\n`).update(read(`${folder}/${f}`));
  return h.digest('hex');
}

/** run-realistic.sh's groups: name and pages. */
const groups = /cat <<JOBS\n([\s\S]*?)\nJOBS/
  .exec(read('run-realistic.sh').toString('utf8').replace(/\r\n/g, '\n'))![1]!
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .map(([name = '', files = '']) => ({ name, files: files.split(',') }));

const expected = JSON.parse(read('expected/round14.json').toString('utf8')) as Record<string, string>;

describe("F07's arbiter corpus is the one round 14 ran", () => {
  it('keeps the 46 realistic pages and the verifier’s four byte for byte, line ends included', () => {
    expect(pagesOf('pages')).toHaveLength(46);
    expect(digest('pages')).toBe('509e884f57493dd28a412ad592953269ac02f27046006e713cc055a751402922');
    expect(pagesOf('pages-verifier')).toEqual(['q1-bootstrap-roastery.html', 'q2-tailwind-saas.html', 'q3-aos-restaurant.html', 'q4-gsap-studio.html']);
    expect(digest('pages-verifier')).toBe('bf1616d9ab0ee0cc2b03b1b94d61a7a426aa424f734c19b9b004dfd00a1a02ef');
  });

  it('puts every realistic page in exactly one oracle12 group, and the second oracle’s pages among them', () => {
    const g = groups.filter((x) => x.name.startsWith('G')).flatMap((x) => x.files);
    expect([...g].sort()).toEqual(pagesOf('pages'));
    const v = groups.filter((x) => x.name.startsWith('V')).flatMap((x) => x.files);
    expect(v.length).toBeGreaterThan(0);
    for (const page of v) expect(g).toContain(page);
  });

  it('holds round 14’s outcome for every answer on the pages of each group, and for no other page', () => {
    const pagesIn = (oracle: 'G' | 'V') => [...new Set(Object.keys(expected).filter((k) => k.startsWith(`${oracle}|`)).map((k) => k.split('|')[1]))].sort();
    expect(pagesIn('G')).toEqual(pagesOf('pages'));
    expect(pagesIn('V')).toEqual([...new Set(groups.filter((x) => x.name.startsWith('V')).flatMap((x) => x.files))].sort());
    expect(Object.keys(expected)).toHaveLength(10055);
    // Each outcome is a stored write with its oracle's verdict, or a refusal (compare.mjs).
    expect(Object.values(expected).filter((o) => !/^(STORED|REFUSED\()/.test(o))).toEqual([]);
  });

  it('holds round 13’s outcome for the hand cases of every case file here, and for no other file', () => {
    const hand = JSON.parse(read('expected/round13-hand.json').toString('utf8')) as Record<string, string>;
    const filesOf = (harness: string) => [...new Set(Object.keys(hand).filter((k) => k.startsWith(`${harness}|`)).map((k) => k.split('|')[1]!))].sort();
    const stems = (folder: string) => readdirSync(DIR + folder).filter((f) => f.endsWith('.mts')).map((f) => f.replace(/\.mts$/, '')).sort();
    expect(filesOf('hand12')).toEqual(stems('cases'));
    expect(filesOf('hand13')).toEqual(stems('vcases'));
    const caseFiles = [...new Set(filesOf('cases13').map((k) => k.replace(/[:#].*$/, '')))].sort();
    const jsonUnder = (sub: string) => readdirSync(`${DIR}cases/${sub}`).map((f) => `${sub}/${f}`);
    // cases13 names each case by its file's path under cases/, as round 13 did under the scratch folder.
    expect(caseFiles).toEqual([...jsonUnder('verify-F07-r4'), ...jsonUnder('verify-F07-r5/cases'), ...jsonUnder('verify-F07-r6/cases')].sort());
    expect(Object.keys(hand)).toHaveLength(746);
  });
});

/**
 * A run of the hand cases as the harnesses write it (cases13.mts its `out` map, hand12.mts and hand13.mts an array of
 * cases per file), rebuilt from outcomes keyed as compare-hand.mjs keys them.
 */
function writeHandRun(dir: string, outcomes: Record<string, string>): void {
  const cases13: Record<string, { outcome: string }> = {};
  const files = new Map<string, unknown[]>();
  for (const [key, outcome] of Object.entries(outcomes)) {
    if (key.startsWith('cases13|')) {
      cases13[key.slice('cases13|'.length)] = { outcome };
      continue;
    }
    const [harness, file, i, name] = key.split('|');
    const space = outcome.indexOf(' ');
    const entry = outcome.startsWith('NOT TRIED, offered ')
      ? { name, offered: JSON.parse(outcome.slice('NOT TRIED, offered '.length)) as unknown }
      : space < 0
        ? { name, kind: outcome }
        : { name, kind: outcome.slice(0, space), verdict: { v: outcome.slice(space + 1) } };
    const at = `${harness === 'hand12' ? 'cases' : 'cases-v'}/${file}.json`;
    (files.get(at) ?? files.set(at, []).get(at)!)[Number(i)] = entry;
  }
  mkdirSync(path.join(dir, 'cases'), { recursive: true });
  mkdirSync(path.join(dir, 'cases-v'), { recursive: true });
  writeFileSync(path.join(dir, 'cases', 'cases13.json'), JSON.stringify({ out: cases13 }));
  for (const [at, entries] of files) writeFileSync(path.join(dir, at), JSON.stringify(entries));
}

describe('compare-hand.mjs passes a hand-case run only when it has every case of round 13’s', () => {
  const hand = JSON.parse(read('expected/round13-hand.json').toString('utf8')) as Record<string, string>;
  const work = mkdtempSync(path.join(tmpdir(), 'byway-f07-hand-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const compare = (dir: string) => {
    const r = spawnSync(process.execPath, [`${DIR}compare-hand.mjs`, dir], { encoding: 'utf8' });
    return { status: r.status, summary: r.stdout.trim().split('\n').pop() ?? '', out: r.stdout + r.stderr };
  };
  const run = (name: string, drop: string[] = []) => {
    const dir = path.join(work, name);
    writeHandRun(dir, hand);
    for (const file of drop) rmSync(path.join(dir, file));
    return dir;
  };

  it('passes the whole run', () => {
    const r = compare(run('whole'));
    expect(r.summary).toMatch(/^746 cases: 746 as in round 13, 0 different .*, 0 not in round 13, 0 missing/);
    expect(r.status).toBe(0);
  });

  it('fails a run whose file did not run or wrote nothing, counting its cases as missing', () => {
    const noCases13 = compare(run('no-cases13', ['cases/cases13.json']));
    expect(noCases13.summary).toMatch(/, 319 missing/);
    expect(noCases13.out).toContain('MISSING cases13 (all 319 of its cases: no output)');
    expect(noCases13.status).toBe(1);
    const dir = run('h1-empty');
    writeFileSync(path.join(dir, 'cases', 'cases-h1.json'), '[]');
    const h1 = compare(dir);
    expect(h1.summary).toMatch(/, 28 missing/);
    expect(h1.status).toBe(1);
  });

  it('fails an empty folder, and stops on one that does not exist', () => {
    const empty = path.join(work, 'empty');
    mkdirSync(empty);
    const r = compare(empty);
    expect(r.summary).toMatch(/^0 cases: .*, 746 missing/);
    expect(r.status).toBe(1);
    expect(compare(path.join(work, 'no-such-folder')).status).toBe(2);
  });
});
