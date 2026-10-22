// verify-F02-refute probe 2: loop max and admitted multiplicative nesting. Read-only imports.
import { writeFileSync } from 'node:fs';
const R = 'C:/Users/arvik/code/byway';
const { c1, PROTOCOL_CONFIGS, presentationOf } = await import(`file:///${R}/packages/catalog/src/index.ts`);
const { createPromptRenderer } = await import(`file:///${R}/packages/prompts/src/index.ts`);
const { checkAnswer, diffFromNearest } = await import(`file:///${R}/packages/advisor/src/index.ts`);
const { estimateRecipe } = await import(`file:///${R}/packages/advisor/src/estimate.ts`);
const { PROFILES } = await import(`file:///${R}/packages/gateway/src/index.ts`);
const { walk } = await import(`file:///${R}/packages/recipe/src/index.ts`);
const { formatCallRange, formatCostRange } = await import(`file:///${R}/apps/web/src/view/format.ts`);
const { diffLine } = await import(`file:///${R}/apps/web/src/view/composed.ts`);
const prompts = createPromptRenderer();
const ctx = { prompts, catalog: PROTOCOL_CONFIGS };
const out: any[] = [];
function probe(name: string, change: (r: any) => void) {
  const raw = structuredClone(c1); change(raw);
  const a = checkAnswer(JSON.stringify(raw), c1, ctx, 'composed-f02b');
  const row: any = { name, accepted: a.violations.length === 0, violations: a.violations.map((v: any) => `${v.ruleId}: ${v.message}`).slice(0, 3) };
  if (a.recipe) {
    row.diff = diffFromNearest(a.recipe, c1, presentationOf('c1').name, presentationOf('c1')).map((l: string) => diffLine(l, false));
    const e = estimateRecipe(a.recipe, { profile: PROFILES.find((p: any) => p.id === 'balanced'), images: true, video: true, otherFamily: true, at: new Date('2026-10-08T12:00:00Z') });
    row.estimateBalanced = { cost: formatCostRange(e.lowUsd, e.highUsd), calls: formatCallRange(e.modelCalls) };
  }
  out.push(row);
}
probe('c1 every loop gate max=1e9', (r) => walk(r, (n: any) => { if (n.op === 'loop') n.gate.max = 1_000_000_000; }));
probe('c1 D1 = replicate 50 x (replicate 50 seed-build, then random pick 1)', (r) => {
  const inner = r.stages[0].body; // replicate seeded-x4
  inner.n = 50;
  r.stages[0].body = { op: 'replicate', id: 'outer-x50', n: 50, body: { op: 'seq', id: 'inner-seq', steps: [inner, { op: 'pick', id: 'inner-pick', mode: 'R', k: 1, actor: 'policy' }] } };
});
probe('c1 D1 = replicate 1000 x (replicate 1000 seed-build, random pick 1)', (r) => {
  const inner = r.stages[0].body; inner.n = 1000;
  r.stages[0].body = { op: 'replicate', id: 'outer-x1000', n: 1000, body: { op: 'seq', id: 'inner-seq', steps: [inner, { op: 'pick', id: 'inner-pick', mode: 'R', k: 1, actor: 'policy' }] } };
});
writeFileSync(new URL('./probe2-results.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
