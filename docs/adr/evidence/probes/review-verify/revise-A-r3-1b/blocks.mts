import { CATALOG } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/index.ts';
import { steps } from 'file:///C:/Users/arvik/code/byway/packages/recipe/src/index.ts';
const pairs = new Map<string, Set<string>>();
for (const r of CATALOG as any[]) for (const { step } of steps(r) as any[]) { const k = `${step.actor}:${step.role}`; const s = pairs.get(k) ?? new Set(); s.add(String(step.block ?? '-')); pairs.set(k, s); }
for (const [k, v] of [...pairs].sort()) console.log(k.padEnd(24), [...v].join(','));
// personWrite after a gate feed inside any loop body, across CATALOG
let hits = 0;
const feedThenPW = (n: any, inLoopAfterFeed: boolean): void => {
  if (n.op === 'step') { if (inLoopAfterFeed && n.actor === 'human' && ['voice','build','fix'].includes(n.role) && n.produces.includes('artifact')) hits++; return; }
  if (n.op === 'loop') { let after = false; const walk = (m: any) => { if (m.op === 'step') { if (after && m.actor === 'human' && ['voice','build','fix'].includes(m.role) && m.produces.includes('artifact')) hits++; if (m.actor === 'model' && ['critic','check'].includes(m.role)) after = true; return; } if (m.op === 'seq') return m.steps.forEach(walk); }; walk(n.body); }
  for (const c of [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.branches ?? []).map((b: any) => b.body), ...(n.lenses ?? []).map((l: any) => l.body)]) feedThenPW(c, false);
};
for (const r of CATALOG as any[]) r.stages.forEach((s: any) => feedThenPW(s.body, false));
console.log('catalog personWrites after a gate feed in a loop body:', hits);
