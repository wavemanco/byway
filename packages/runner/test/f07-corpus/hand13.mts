// Hand cases through the real activity; every stored write (and every arbiter refusal, placed again) judged by vo13.
// Usage: tsx hand13.mts <cases.mts> [filter]
const A = await import('./act13.mts');
const O = await import('./vo13.mts');
const J = await import('./judge13.mts');
const fs = await import('node:fs');
const file = process.argv[2]!;
const filter = process.argv[3];
const { CASES } = await import(/^[A-Z]:/i.test(file) ? `file:///${file}` : `./vcases/${file}`);
type Case = { name: string; html: string; head?: string; dir?: string; edit: (o: string[]) => string[] | string | undefined; motion?: 'reduce' | 'no-preference' };
const out: unknown[] = [];
for (const c of CASES as Case[]) {
  if (filter && !c.name.includes(filter)) continue;
  const html = A.wrap(c.html, c.head, c.dir);
  const s = await A.open(html);
  const notOffered = s.prompt.match(/These lines of the page are not offered[^]*$/)?.[0];
  console.log(`\n=== ${c.name}  (open ${s.ms} ms)`);
  console.log(`  offered: ${JSON.stringify(s.offered)}`);
  if (notOffered) console.log(`  ${notOffered.slice(0, 500)}`);
  if (s.threw) { console.log(`  OPEN THREW ${s.threw}`); out.push({ name: c.name, threw: s.threw }); A.close(s); continue; }
  const ans = c.edit(s.offered);
  if (ans === undefined) { A.close(s); out.push({ name: c.name, offered: s.offered }); continue; }
  const text = Array.isArray(ans) ? ans.join('\n') : ans;
  const o = await A.answer(s, text);
  A.close(s);
  const before = await O.view(html, { motion: c.motion });
  let verdict: unknown = '';
  if (o.kind === 'STORED') {
    const after = await O.view(o.written!, { motion: c.motion });
    verdict = J.judge(before, after, s.offered, text.split('\n'));
    console.log(`  STORED (${o.ms} ms) judged ${JSON.stringify(verdict)}\n  before: ${before.text.slice(0, 300)}\n  after:  ${after.text.slice(0, 300)}`);
  } else if (o.kind === 'REFUSED') {
    const arb = A.isArbiter(o.message!);
    let j: unknown = 'n/a';
    if (arb) {
      const page = A.placedAgain(html, s.offered, text);
      if (page) {
        const after = await O.view(page, { motion: c.motion });
        j = J.judge(before, after, s.offered, text.split('\n'));
        console.log(`  placed: ${after.text.slice(0, 300)}`);
      } else j = 'NOPAGE';
    }
    verdict = j;
    console.log(`  REFUSED${arb ? '(arbiter)' : '(other)'} ${o.message!.slice(0, 500)}\n  write judged: ${JSON.stringify(j)}\n  before: ${before.text.slice(0, 300)}`);
  } else console.log(`  ${o.kind} ${o.message ?? ''}`);
  out.push({ name: c.name, offered: s.offered, answer: text, kind: o.kind, message: o.message, written: o.written, verdict });
}
const OUTV = process.env.HAND_OUT ?? (await import('node:path')).join((process.env.F07_OUT ?? (await import('node:path')).join((await import('node:os')).tmpdir(), 'byway-f07')), 'cases-v');
fs.mkdirSync(OUTV, { recursive: true });
fs.writeFileSync(`${OUTV}/${(file.split(/[\\/]/).pop() ?? 'cases').replace(/\.mts$/, '')}${filter ? '-' + filter : ''}.json`, JSON.stringify(out, null, 1));
await O.closeOracle();
await A.closeAct();
process.exit(0);
