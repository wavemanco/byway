// Round 13 (from round 12's real13.mts). Realistic pages through the real page VOICE activity, each offered line edited several ways; every stored write
// and every arbiter refusal (placed again) judged by oracle12/judge12. Usage: tsx real12.mts outName dir file1,file2
const A = await import('./act12.mts');
// ORACLE=vo13: judge with the round-12 verifier's oracle (visual words on the real clock; vertical and turned text), else oracle12.
const useVo = process.env.ORACLE === 'vo13';
const O: any = useVo ? await import('./vo13.mts') : await import('./oracle12.mts');
const J: any = useVo ? await import('./judge13.mts') : await import('./judge12.mts');
const visit1 = (h: string) => (useVo ? O.view(h) : O.visit(h));
const retries: Record<string, number> = { visit: 0, answer: 0, open: 0 };
const visit = async (h: string): Promise<any> => {
  for (let k = 0; ; k++) {
    try { return await visit1(h); } catch (e) {
      if (k >= 3) throw e;
      retries.visit++;
      console.log('  (oracle visit failed, again: ' + String((e as Error).message).slice(0, 80) + ')');
      try { await O.closeOracle(); } catch {}
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};
const fs = await import('node:fs');
const path = await import('node:path');
const [outName, dir, list] = [process.argv[2]!, process.argv[3]!, process.argv[4] ?? ''];
const kinds = (process.env.KINDS ?? 'word,append,insert,punct,rewrite,delete').split(',');
const files = list.split(',').filter(Boolean);
// LINES=a-b: only offered lines a to b (1-based, the title is 0), so a heavy page can be split over several runs.
const [lineFrom, lineTo] = (process.env.LINES ?? '1-100000').split('-').map(Number) as [number, number];
const tally: Record<string, Record<string, number>> = {};
const log: unknown[] = [];
const outDir = process.env.REAL_OUT ?? (await import('node:path')).join((process.env.F07_OUT ?? (await import('node:path')).join((await import('node:os')).tmpdir(), 'byway-f07')), 'real');
fs.mkdirSync(outDir, { recursive: true });
// One run per group: a second runner given the same group leaves it to the first (a lock beside the outputs).
try { fs.mkdirSync(path.join(outDir, `${outName}.lock`)); } catch { console.log(`${outName} is run elsewhere`); process.exit(0); }
const reasonOf = (m: string): string => {
  const r: [RegExp, string][] = [
    [/on its own where your lines leave an element empty/, 'stylesheet text left alone'],
    [/run words together/, 'run together'],
    [/a space that your lines do not have/, 'space not typed'],
    [/a line break that your lines do not have/, 'break not typed'],
    [/on one line what it showed on separate/, 'separate to one line'],
    [/on separate lines what it showed on one/, 'one line to separate'],
    [/another order/, 'order'],
    [/hide ".*" from sight/, 'put out of sight'],
    [/hid from sight before/, 'brought into sight'],
    [/other text on this page/, 'other text changed'],
    [/which you did not change/, 'unchanged line changed'],
    [/link/, 'link words'],
    [/not show all of your lines/, 'missing text'],
    [/text your lines do not have/, 'extra text'],
    [/title/, 'title'],
  ];
  return r.find(([re]) => re.test(m))?.[1] ?? 'other';
};
for (const f of files) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const t = (tally[f] = {} as Record<string, number>);
  const inc = (k: string, n = 1) => (t[k] = (t[k] ?? 0) + n);
  let s = await A.open(html);
  for (let k = 0; s.threw && k < 2; k++) { retries.open++; console.log('  (open threw, again: ' + s.threw.slice(0, 120) + ')'); A.close(s); await new Promise((r) => setTimeout(r, 5000)); s = await A.open(html); }
  const deck = A.C.deckLines(A.C.readPageCopy(html));
  t.deck = deck.length - 1;
  t.offered = Math.max(0, s.offered.length - 1);
  const named = s.prompt?.match(/These lines of the page are not offered[^]*$/)?.[0] ?? '';
  console.log(`\n##### ${f}: ${t.offered} of ${t.deck} lines offered (open ${s.openMs} ms)${s.threw ? ` THREW ${s.threw}` : ''}\n  not offered: ${named.slice(0, 2000)}`);
  if (s.threw) { A.close(s); continue; }
  const vb = await visit(html);
  const offered = s.offered;
  for (let i = 1; i < offered.length; i++) {
    if (i < lineFrom || i > lineTo) continue;
    const l = offered[i]!;
    const plain = !/(^|[^\\])[[\]]/.test(l);
    const words = l.split(' ');
    const rewrite = plain ? 'Entirely new words here' : l.replace(/\[((?:\\.|[^\]\\])*)\]/g, '[Go now]').replace(/(^|\])([^[\]]+)(?=\[|$)/g, (m, a, b) => `${a}${/\S/.test(b) ? ' fresh words ' : b}`);
    const edits: [string, string][] = [];
    for (const k of kinds) {
      if (k === 'word') edits.push([k, plain ? l.replace(/^(\S+)/, 'New') : l.replace(/\[((?:\\.|[^\]\\])*)\]/, (m, w) => `[New ${w}]`)]);
      if (k === 'append') edits.push([k, `${l} too`]);
      if (k === 'insert' && words.length >= 2) { const mid = Math.floor(words.length / 2); const ws = [...words]; ws.splice(mid, 0, 'really'); edits.push([k, ws.join(' ')]); }
      if (k === 'punct') edits.push([k, `${l}!`]);
      if (k === 'lastword' && words.length >= 2 && plain) edits.push([k, [...words.slice(0, -1), 'changed'].join(' ')]);
      if (k === 'rewrite') edits.push([k, rewrite.trim()]);
      if (k === 'delete') edits.push([k, '']);
    }
    for (const [kind, line] of edits) {
      if (line === l) continue;
      const answer = offered.map((x, k) => (k === i ? line : x)).join('\n');
      let o = await A.answer(s, answer);
      for (let k = 0; o.kind === 'THREW' && k < 2; k++) { retries.answer++; console.log('  (answer threw, again: ' + String(o.message).slice(0, 120) + ')'); await new Promise((r) => setTimeout(r, 5000)); o = await A.answer(s, answer); }
      inc('answers');
      let res: string = o.kind;
      let j: any;
      if (o.kind === 'STORED') {
        const va = await visit(o.written!);
        j = J.judge(vb, va, offered, answer.split('\n'));
        res = `STORED ${j.v}${j.why ? ` (${j.why})` : ''}`;
        inc('stored');
        inc(`stored ${j.v}`);
      } else if (o.kind === 'REFUSED') {
        if (A.isArbiter(o.message!)) {
          const page = A.placedAgain(html, offered, answer);
          j = page ? J.judge(vb, await visit(page), offered, answer.split('\n')) : { v: 'NOPAGE' };
          const why = reasonOf(o.message!);
          inc('refused by arbiter');
          inc(`refused by arbiter: ${why}`);
          inc(`refused by arbiter, write judged ${j.v === 'ok' ? 'right (false refusal?)' : j.v}`);
          res = `REFUSED(arbiter: ${why}; write judged ${j.v}${j.why ? ` ${j.why}` : ''}) ${o.message!.replace(/^AnswerRejected: /, '').slice(0, 300)}`;
        } else {
          inc('refused by reader or placement');
          res = `REFUSED(other) ${o.message!.replace(/^AnswerRejected: /, '').slice(0, 300)}`;
        }
      } else {
        inc(o.kind);
        if (o.message) res = `${o.kind} ${o.message.slice(0, 300)}`;
      }
      console.log(`  ${i + 1} ${kind.padEnd(7)} ${JSON.stringify(line).slice(0, 80)} -> ${res}`);
      log.push({ page: f, line: i + 1, kind, old: l, answerLine: line, kindOut: o.kind, result: res, verdict: j, written: o.kind === 'STORED' && j?.v !== 'ok' ? o.written : undefined });
    }
  }
  A.close(s);
  fs.writeFileSync(path.join(outDir, `${outName}.json`), JSON.stringify({ tally, log, retries }, null, 1));
}
console.log('\nTALLY', JSON.stringify(tally, null, 1));
fs.writeFileSync(path.join(outDir, `${outName}.json`), JSON.stringify({ tally, log, retries }, null, 1));
await O.closeOracle();
await A.closeAct();
process.exit(0);
