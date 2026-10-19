// F02 admission probe (verify-F02-reproduce). Read-only imports of repo source; writes nothing.
// Run with cwd C:/Users/arvik/code/byway: pnpm exec tsx <this file>
const R = 'file:///C:/Users/arvik/code/byway/packages';
const { c1, c5, PROTOCOL_CONFIGS } = await import(`${R}/catalog/src/index.ts`);
const { createPromptRenderer } = await import(`${R}/prompts/src/index.ts`);
const { checkAnswer, diffFromNearest, estimateRecipe } = await import(`${R}/advisor/src/index.ts`);
const { walk } = await import(`${R}/recipe/src/index.ts`);
const { PROFILES } = await import(`${R}/gateway/src/index.ts`);

const prompts = createPromptRenderer();
const ctx = { prompts, catalog: PROTOCOL_CONFIGS };
const balanced = PROFILES.find((p: any) => p.id === 'balanced');
const demo = PROFILES.find((p: any) => p.id === 'demo');
const out: any[] = [];

function probe(name: string, nearest: any, change: (r: any) => void) {
  const raw = structuredClone(nearest);
  change(raw);
  let answer: any;
  try {
    answer = checkAnswer(JSON.stringify(raw), nearest, ctx, 'composed-f02-probe');
  } catch (e: any) {
    out.push({ name, threw: `${e?.name}: ${String(e?.message).slice(0, 160)}` });
    return;
  }
  const row: any = { name, accepted: !!answer.recipe && answer.violations.length === 0, violations: answer.violations.slice(0, 4) };
  if (answer.recipe) {
    try { row.diff = diffFromNearest(answer.recipe, nearest, nearest.id); } catch (e: any) { row.diff = `threw ${e?.message}`; }
    try {
      const est = estimateRecipe(answer.recipe, { profile: balanced, images: false, video: false, at: new Date('2026-10-08T00:00:00Z') });
      row.estimateBalanced = { lowUsd: est.lowUsd, highUsd: est.highUsd, modelCalls: est.modelCalls };
      const d = estimateRecipe(answer.recipe, { profile: demo, images: true, video: true, at: new Date('2026-10-08T00:00:00Z') });
      row.estimateDemo = { lowUsd: d.lowUsd, highUsd: d.highUsd, modelCalls: d.modelCalls };
    } catch (e: any) { row.estimate = `threw ${e?.message}`; }
  }
  out.push(row);
}

// Baseline: canonical C1 unchanged.
probe('C1 unchanged (baseline)', c1, () => {});
// Reviewer's case.
probe('C1 replicate n = 1,000,000,000', c1, (r) => { r.stages[0].body.n = 1_000_000_000; });
// Above Temporal's default per-workflow pending-activity limit (2,000).
probe('C1 replicate n = 2,500', c1, (r) => { r.stages[0].body.n = 2500; });
probe('C1 replicate n = Number.MAX_SAFE_INTEGER', c1, (r) => { r.stages[0].body.n = Number.MAX_SAFE_INTEGER; });
probe('C1 replicate n = 1e20 (not safe int)', c1, (r) => { r.stages[0].body.n = 1e20; });
// Loop cap.
probe('C1 critic-loop gate.max = 1,000,000,000', c1, (r) => { walk(r, (n: any) => { if (n.op === 'loop') n.gate.max = 1_000_000_000; }); });
// Nested multiplication using only modest scalars: replicate(1000, replicate(1000, seedBuild)).
probe('C1 nested replicate 1000 x 1000', c1, (r) => {
  const inner = r.stages[0].body;
  r.stages[0].body = { op: 'replicate', id: 'outer-x', n: 1000, body: { ...inner, n: 1000 } };
});
// Relay maxLinks (runtime bound is the storyboard's shot count).
probe('C5 relay maxLinks = 1,000,000,000', c5, (r) => { walk(r, (n: any) => { if (n.op === 'relay') n.maxLinks = 1_000_000_000; }); });
// Deep nesting within the composer's output allowance (~16k tokens): seq wrappers around D3's body.
for (const depth of [500, 1500, 2500]) {
  probe(`C1 D3 wrapped in ${depth} nested seqs`, c1, (r) => {
    let body = r.stages[2].body;
    for (let i = 0; i < depth; i++) body = { op: 'seq', steps: [body] };
    r.stages[2].body = body;
  });
  const raw = structuredClone(c1); let body = raw.stages[2].body; for (let i = 0; i < depth; i++) body = { op: 'seq', steps: [body] }; raw.stages[2].body = body;
  try { out.at(-1).serializedBytes = JSON.stringify(raw).length; } catch (e: any) { out.at(-1).serializedBytes = `stringify threw ${e?.message}`; }
}

console.log(JSON.stringify(out, null, 2));
