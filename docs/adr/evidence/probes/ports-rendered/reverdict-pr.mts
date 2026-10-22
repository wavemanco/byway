// Re-verdict a corpus (variants with nearest and recipe) with main (the exported 00a8a4c tree) and this worktree.
// Usage: tsx --import trees-register.mjs reverdict-pr.mts <corpus.json> <out.json> [offset] [limit]
import { readFileSync, writeFileSync } from 'node:fs';
const M = 'file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/main-tree/packages/';
const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-ports-rendered/packages/';
const [ma, mp, mc, ba, bp, bc] = await Promise.all([
  import(M + 'advisor/src/index.ts'), import(M + 'prompts/src/index.ts'), import(M + 'catalog/src/index.ts'),
  import(W + 'advisor/src/index.ts'), import(W + 'prompts/src/index.ts'), import(W + 'catalog/src/index.ts'),
]);
type N = Record<string, any>;
const [file, out, off, lim] = process.argv.slice(2);
const all: N[] = JSON.parse(readFileSync(file!, 'utf8'));
const vs = all.slice(Number(off ?? 0), Number(off ?? 0) + Number(lim ?? 1e9));
const MP = mp.createPromptRenderer();
const BP = bp.createPromptRenderer();
const fenced = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const rows: N[] = [];
const stats: N = { variants: 0, mainOk: 0, branchOk: 0, mainOkBranchRefused: 0, mainRefusedBranchOk: 0, keys: {} };
for (const v of vs) {
  stats.variants++;
  const verdict = (a: N, cat: N, P: N) => {
    const near = cat.PROTOCOL_CONFIGS.find((x: N) => x.id === v.nearest);
    const res = a.checkAnswer(fenced(v.recipe), near, { prompts: P, catalog: cat.PROTOCOL_CONFIGS }, `composed-${v.nearest}`);
    return res.violations.map((x: N) => ({ ruleId: x.ruleId, clause: x.clause ?? '', path: x.path ?? '', message: x.message, stepId: /step "([^"]+)"/.exec(x.message)?.[1] }));
  };
  const m = verdict(ma, mc, MP);
  const b = verdict(ba, bc, BP);
  if (!m.length) stats.mainOk++;
  if (!b.length) stats.branchOk++;
  if (!m.length && b.length) stats.mainOkBranchRefused++;
  if (m.length && !b.length) stats.mainRefusedBranchOk++;
  for (const k of new Set(b.map((x: N) => `${x.ruleId}:${x.clause}`))) stats.keys[k as string] = (stats.keys[k as string] ?? 0) + 1;
  rows.push({ idx: v.idx, nearest: v.nearest, muts: v.muts, recipe: v.recipe, mainOk: !m.length, mainRefusals: m, branchOk: !b.length, refusals: b, keys: [...new Set(b.map((x: N) => `${x.ruleId}:${x.clause}`))].sort() });
}
writeFileSync(out!, JSON.stringify(rows));
console.log(JSON.stringify(stats));
