// Hand cases through the real activity, each stored or refused write judged by oracle12/judge12.
// Usage: tsx hand12.mts cases-file.mts [filter]
const A = await import('./act12.mts');
const O = await import('./oracle12.mts');
const J = await import('./judge12.mts');
const fs = await import('node:fs');
const file = process.argv[2]!;
const filter = process.argv[3];
// One run per case file: a second runner leaves it to the first.
const HAND_OUT = process.env.HAND_OUT ?? (await import('node:path')).join((process.env.F07_OUT ?? (await import('node:path')).join((await import('node:os')).tmpdir(), 'byway-f07')), 'cases');
fs.mkdirSync(HAND_OUT, { recursive: true });
try { fs.mkdirSync(`${HAND_OUT}/${file.replace(/[^a-z0-9.-]/gi, '_')}.lock`); } catch { console.log(file + ' is run elsewhere'); process.exit(0); }
const { CASES } = await import(file.startsWith('/') || /^[A-Z]:/.test(file) ? `file:///${file}` : `./cases/${file}`);
type Case = { name: string; html: string; head?: string; edit: (o: string[]) => string[] | string | undefined; motion?: 'reduce' | 'no-preference' };
const out: unknown[] = [];
for (const c of CASES as Case[]) {
  if (filter && !c.name.includes(filter)) continue;
  const html = A.wrap(c.html, c.head);
  const s = await A.open(html);
  const notOffered = s.prompt?.match(/These lines of the page are not offered[^]*$/)?.[0];
  console.log(`\n=== ${c.name}  (open ${s.openMs} ms)`);
  console.log(`  offered: ${JSON.stringify(s.offered)}`);
  if (notOffered) console.log(`  ${notOffered.slice(0, 600)}`);
  if (s.threw) { console.log(`  ${s.threw}`); out.push({ name: c.name, threw: s.threw }); A.close(s); continue; }
  const ans = c.edit(s.offered);
  if (ans === undefined) { A.close(s); continue; }
  const text = Array.isArray(ans) ? ans.join('\n') : ans;
  const o = await A.answer(s, text);
  A.close(s);
  let verdict: unknown = '';
  const before = await O.visit(html, { motion: c.motion });
  if (o.kind === 'STORED') {
    const after = await O.visit(o.written!, { motion: c.motion });
    verdict = J.judge(before, after, s.offered, text.split('\n'));
    console.log(`  STORED (${o.ms} ms) judged ${JSON.stringify(verdict)}\n  before: ${O.view(before)}\n  after:  ${O.view(after)}`);
  } else if (o.kind === 'REFUSED') {
    const arb = A.isArbiter(o.message!);
    let j: unknown = 'n/a';
    if (arb) {
      const page = A.placedAgain(html, s.offered, text);
      if (page) {
        const after = await O.visit(page, { motion: c.motion });
        j = J.judge(before, after, s.offered, text.split('\n'));
        console.log(`  placed: ${O.view(after)}`);
      } else j = 'NOPAGE';
    }
    verdict = j;
    console.log(`  REFUSED${arb ? '(arbiter)' : '(other)'} ${o.message!.slice(0, 400)}\n  write judged: ${JSON.stringify(j)}\n  before: ${O.view(before)}`);
  } else console.log(`  ${o.kind} ${o.message ?? ''}`);
  out.push({ name: c.name, offered: s.offered, answer: text, kind: o.kind, message: o.message, written: o.written, verdict });
}
fs.writeFileSync(`${HAND_OUT}/${(file.split(/[\\/]/).pop() ?? 'cases').replace(/\.mts$/, '')}${filter ? '-' + filter : ''}.json`, JSON.stringify(out, null, 1));
await O.closeOracle();
await A.closeAct();
process.exit(0);
