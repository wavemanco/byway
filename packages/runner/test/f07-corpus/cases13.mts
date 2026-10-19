// Round 12 (from round 11's cases11.mts, judged by the round-11 verifier's paint oracle12/judge12): every hand case the round-4 to round-6 verifiers wrote (their case files, as round 9's probe-cases ran
// them), through the real page VOICE activity with the runner's Chromium as the arbiter (the visitor read). Each stored
// page is judged by the geometry oracle (oracle11.mts + judge-chars.mts, no code shared with the arbiter), and each
// page the arbiter refused is placed again and judged, to tell a right write refused from a wrong one.
const fs = await import('node:fs');
const H = await import('../helpers/voice-activity.ts');
const { playwrightPages } = await import('../../src/pages.ts');
const { deckLines, readPageCopy, readPageEdit, placePageEdit } = await import('../../src/copy.ts');
const O = await import('./oracle12.mts');
// One run only: a second runner leaves it to the first.
const CASES_OUT = process.env.CASES_OUT ?? (await import('node:path')).join((process.env.F07_OUT ?? (await import('node:path')).join((await import('node:os')).tmpdir(), 'byway-f07')), 'cases13.json');
fs.mkdirSync((await import('node:path')).dirname(CASES_OUT), { recursive: true });
try { fs.mkdirSync(CASES_OUT + '.lock'); } catch { console.log('cases13 is run elsewhere'); process.exit(0); }
const J = await import('./judge12.mts');
const PAGES = playwrightPages();
const pageOf = (b: string) => `<!doctype html><html><head><title>T</title></head><body>${b}</body></html>`;
const S = (await import('node:url')).fileURLToPath(new URL('./cases', import.meta.url));
const files = [
  ...['cases-glue.json', 'cases-glue2.json', 'cases-at.json', 'cases-misc.json', 'cases-open.json'].map((f) => `${S}/verify-F07-r4/${f}`),
  ...fs.readdirSync(`${S}/verify-F07-r5/cases`).map((f: string) => `${S}/verify-F07-r5/cases/${f}`),
  ...fs.readdirSync(`${S}/verify-F07-r6/cases`).map((f: string) => `${S}/verify-F07-r6/cases/${f}`),
];
type Case = { name: string; html: string; answer: string[] | null };
const cases: Case[] = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const short = f.replace(`${S}/`, '');
  (j as unknown[]).forEach((x: any, i: number) => {
    if (typeof x[0] === 'string' && x[0].startsWith('<')) cases.push({ name: `${short}#${i}`, html: x[0], answer: x[1] });
    else {
      const full = x[3] === true;
      cases.push({ name: `${short}:${x[0]}`, html: full ? x[1] : pageOf(x[1]), answer: x[2] === null || x[2] === undefined ? null : full ? x[2] : ['T', ...x[2]] });
    }
  });
}
const tally: Record<string, number> = {};
const count = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
const out: Record<string, unknown> = {};
for (const c of cases) {
  count('cases');
  const b = await H.voiceBench([], { pages: PAGES });
  try {
    const run = await H.benchRun(b, 'web-page');
    let q;
    try {
      q = await H.VoiceQuestion.open(b, run, await H.putWork(b, 'web-page', c.html));
    } catch (e) {
      out[c.name] = { outcome: 'THREW at open', e: (e as Error).message };
      count('THREW at open');
      continue;
    }
    const offered = q.offered!.split('\n');
    if (!c.answer) {
      out[c.name] = { outcome: 'OFFER-ONLY', offered };
      count('OFFER-ONLY');
      continue;
    }
    // A case written against the whole deck: the lines not offered now are dropped from it.
    const full = deckLines(readPageCopy(c.html));
    let answer = c.answer;
    const notOffered = new Set<number>();
    let jj = 0;
    full.forEach((l: string, k: number) => {
      if (jj < offered.length && offered[jj] === l) jj++;
      else notOffered.add(k);
    });
    if (notOffered.size && answer.length === full.length) answer = answer.filter((_, k) => !notOffered.has(k));
    if (answer.length !== offered.length) {
      out[c.name] = { outcome: 'ANSWER DOES NOT FIT THE OFFER', offered, answer: c.answer };
      count('ANSWER DOES NOT FIT THE OFFER');
      continue;
    }
    const before = await O.visit(c.html);
    try {
      const r = await q.answer(answer.join('\n'));
      if (!r.artifactId) {
        out[c.name] = { outcome: 'NOTHING-WRITTEN', offered, answer };
        count('NOTHING-WRITTEN');
        continue;
      }
      const written = await b.store.artifacts.getText(r.artifactId);
      const v = J.judge(before, await O.visit(written), offered, answer).v;
      out[c.name] = { outcome: `STORED, judged ${v}`, offered, answer, written };
      count(`STORED, judged ${v}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/^byway could not put line|^byway could not check/.test(msg)) {
        const ed = readPageEdit(readPageCopy(c.html, notOffered), answer.join('\n'));
        const placed = ed.ok ? placePageEdit(c.html, ed, notOffered) : undefined;
        const v = placed && !placed.problems.length ? J.judge(before, await O.visit(placed.page), offered, answer).v : 'not replayed';
        out[c.name] = { outcome: `REFUSED-ARBITER, write judged ${v}`, offered, answer, refused: msg, written: placed?.page };
        count(`REFUSED-ARBITER, write judged ${v}`);
      } else {
        out[c.name] = { outcome: 'REFUSED-OTHER', offered, answer, refused: msg };
        count('REFUSED-OTHER');
      }
    }
  } catch (e) {
    out[c.name] = { outcome: 'THREW', e: String((e as Error).stack ?? e) };
    count('THREW');
  } finally {
    b.close();
  }
}
console.log(JSON.stringify(tally, null, 1));
fs.writeFileSync(CASES_OUT, JSON.stringify({ tally, out }, null, 1));
await O.closeOracle();
await PAGES.close();
process.exit(0);
