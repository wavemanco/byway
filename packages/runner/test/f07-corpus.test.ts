/**
 * F07's arbiter corpus (test/f07-corpus, ADR-0081) is kept to be run again by hand before a Playwright upgrade; it takes
 * hours, so it is not run here. What is checked here is that the corpus is still the one round 14 ran: the pages byte
 * for byte (the VOICE reader works on the HTML source, so a converted line end is a different page), every realistic
 * page in exactly one of run-realistic.sh's groups, and round 14's recorded outcomes covering those groups' pages.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
