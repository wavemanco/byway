/**
 * F07's arbiter corpus (test/f07-corpus, ADR-0081) is kept to be run again by hand before a Playwright upgrade; it takes
 * hours, so it is not run here. What is checked here is that the corpus is still the one round 14 ran: the pages byte
 * for byte (the VOICE reader works on the HTML source, so a converted line end is a different page), every realistic
 * page in exactly one of run-realistic.sh's groups, and round 14's recorded outcomes covering those groups' pages. And
 * compare-hand.mjs, which needs no browser, is run on hand-case runs rebuilt from round 13's outcomes: it passes only a
 * run that has every case. The generators' baseline (F07 (a)) is kept byte for byte too, with every job the README's
 * commands name, and compare-gen.mjs is run on copies of it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const BASELINE = `${DIR}expected/generators-1.63.0`;
/** The generator jobs the README's commands run: where each writes, and its generator, seed, size and mode. */
const genJobs = [...read('README.md').toString('utf8').matchAll(/OUT=<out>\/(gen|genv)\/(\S+) npx tsx test\/f07-corpus\/(gen13|gen-v14)\.mts (\d+) (\d+) (\w+)/g)].map(
  ([, sub = '', name = '', gen = '', seed = '', size = '', mode = '']) => ({ sub, name, gen, seed, size: Number(size), mode }),
);
const baselineFiles = (dir: string) => ['gen', 'genv'].flatMap((sub) => (existsSync(`${dir}/${sub}`) ? readdirSync(`${dir}/${sub}`).sort().map((f) => `${sub}/${f}`) : []));

describe("the generators' baseline on Playwright 1.63.0 (F07 (a)) is the one taken on 2026-11-01 and 02", () => {
  it('holds every job the README runs, each finished at its size with nothing thrown, and no other file', () => {
    expect(genJobs).toHaveLength(12);
    for (const job of genJobs) {
      const tally = JSON.parse(readFileSync(`${BASELINE}/${job.sub}/${job.name}.json`, 'utf8')) as { seed: string; mode: string; n: number; done?: boolean; stats: Record<string, number> };
      expect({ job: job.name, seed: tally.seed, mode: tally.mode, n: tally.n, done: tally.done }).toEqual({ job: job.name, seed: job.seed, mode: job.mode, n: job.size, done: true });
      expect({ job: job.name, threw: Object.keys(tally.stats).filter((k) => /threw/i.test(k)) }).toEqual({ job: job.name, threw: [] });
    }
    const names = new Set(genJobs.map((j) => `${j.sub}/${j.name}`));
    expect(baselineFiles(BASELINE).filter((f) => !names.has(f.replace(/\.(json|refusals\.jsonl|judged\.jsonl|threw\.jsonl)$/, '')))).toEqual([]);
  });

  it('keeps its files byte for byte', () => {
    const h = createHash('sha256');
    for (const f of baselineFiles(BASELINE)) h.update(`${f}\n`).update(readFileSync(`${BASELINE}/${f}`));
    expect(h.digest('hex')).toBe('b834bbe3888638c4d1cc2bf0cc3c7169a47e8c798e3cbe75c52e6592faf52998');
  });
});

describe('compare-gen.mjs passes a generator run only when every count, every list and every listed edit is the baseline’s', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'byway-f07-gen-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const compare = (dir: string) => {
    const r = spawnSync(process.execPath, [`${DIR}compare-gen.mjs`, dir], { encoding: 'utf8' });
    return { status: r.status, summary: r.stdout.trim().split('\n').pop() ?? '', out: r.stdout + r.stderr };
  };
  const copy = (name: string) => {
    const dir = path.join(work, name);
    cpSync(BASELINE, dir, { recursive: true });
    return dir;
  };
  type Tally = { n: number; done?: boolean; stats: Record<string, number> };
  const tallyOf = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Tally;
  const listOf = (file: string) => readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const writeList = (file: string, entries: string[]) => writeFileSync(file, entries.map((l) => `${l}\n`).join(''));
  const bump = (t: Tally, key: string, by: number) => (t.stats[key] = (t.stats[key] ?? 0) + by);

  it('passes the baseline itself, whose lists hold what its tallies count', () => {
    const r = compare(BASELINE);
    expect(r.summary).toBe("12 jobs in the baseline: 0 missing; 0 counts, 0 lists and 0 edits different (0 of them the same outcome, the oracle's verdict alone differing)");
    expect(r.status).toBe(0);
  });

  it('fails a run where the arbiter did not refuse an edit the baseline refused, naming the edit and the counts', () => {
    const dir = copy('stored');
    const refusals = path.join(dir, 'gen', 'lv-edge-12103.refusals.jsonl');
    const [first, ...rest] = listOf(refusals);
    writeList(refusals, rest);
    const tally = path.join(dir, 'gen', 'lv-edge-12103.json');
    const t = tallyOf(tally);
    bump(t, 'arbiterRefused', -1);
    bump(t, `arbiterRefused, write judged ${(JSON.parse(first!) as { oracle: string }).oracle}`, -1);
    bump(t, 'stored', 1);
    bump(t, 'stored, judged ok', 1);
    writeFileSync(tally, JSON.stringify(t));
    const r = compare(dir);
    expect(r.out).toMatch(/^DIFFERENT gen\/lv-edge-12103 answer .*\n {2}baseline: REFUSED: byway could not put line \d+ .*\n {2}now: {6}NOT LISTED \(stored and judged right, changed nothing, or refused by the reader or placement\)$/m);
    expect(r.out).toMatch(/^COUNT gen\/lv-edge-12103 stored baseline: 656 now: 657$/m);
    expect(r.summary).toMatch(/; 4 counts, 0 lists and 1 edits different \(0 of them/);
    expect(r.status).toBe(1);
  });

  it('fails a run where only a count moved, or only the oracle judged a listed write otherwise', () => {
    const counted = copy('count');
    const tally = path.join(counted, 'gen', 'links-12108.json');
    const t = tallyOf(tally);
    bump(t, 'nothing', 1);
    writeFileSync(tally, JSON.stringify(t));
    const count = compare(counted);
    expect(count.out).toMatch(/^COUNT gen\/links-12108 nothing baseline: \d+ now: \d+$/m);
    expect(count.summary).toMatch(/; 1 counts, 0 lists and 0 edits different/);
    expect(count.status).toBe(1);
    const judged = copy('verdict');
    const list = path.join(judged, 'genv', 'r12-13102.judged.jsonl');
    const [head, ...more] = listOf(list);
    const e = JSON.parse(head!) as { v: string };
    e.v = e.v === 'SPLIT' ? 'GLUED' : 'SPLIT';
    writeList(list, [JSON.stringify(e), ...more]);
    const verdict = compare(judged);
    expect(verdict.out).toMatch(/^VERDICT DIFFERS genv\/r12-13102 answer /m);
    expect(verdict.summary).toMatch(/; 0 counts, 0 lists and 1 edits different \(1 of them/);
    expect(verdict.status).toBe(1);
  });

  it('names a throw listed with no answer, and a list longer than its tally counts', () => {
    const dir = copy('threw');
    writeList(path.join(dir, 'genv', 'r12-13202.threw.jsonl'), [JSON.stringify({ html: '<p>x</p>', harness: 'Error: boom' })]);
    const r = compare(dir);
    expect(r.out).toContain('LIST genv/r12-13202 now: .threw.jsonl has 1 lines, its tally counts 0');
    expect(r.out).toMatch(/^DIFFERENT genv\/r12-13202 answer null\n {2}baseline: NOT LISTED .*\n {2}now: {6}THREW: Error: boom$/m);
    expect(r.summary).toMatch(/; 0 counts, 1 lists and 1 edits different/);
    expect(r.status).toBe(1);
  });

  it('fails a run with a job missing, stopped early or of another size, and stops on a folder that does not exist', () => {
    const dir = copy('missing');
    rmSync(path.join(dir, 'genv', 'r12-edge-13101.json'));
    const stopped = path.join(dir, 'gen', 'glue-12107.json');
    writeFileSync(stopped, JSON.stringify({ ...tallyOf(stopped), n: 125, done: undefined }));
    const short = path.join(dir, 'gen', 'atk-12102.json');
    writeFileSync(short, JSON.stringify({ ...tallyOf(short), n: 299 }));
    const r = compare(dir);
    expect(r.out).toContain('MISSING genv/r12-edge-13101');
    expect(r.out).toContain('MISSING gen/glue-12107 (stopped after 125 of 300 pages)');
    expect(r.out).toContain('MISSING gen/atk-12102 (finished after 299 of 300 pages)');
    expect(r.summary).toMatch(/^12 jobs in the baseline: 3 missing;/);
    expect(r.status).toBe(1);
    expect(compare(path.join(work, 'no-such-folder')).status).toBe(2);
  });
});
