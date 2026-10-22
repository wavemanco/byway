// verify-F02-refute: read-only probe. Imports repo source by absolute path; writes nothing into the repo.
import { writeFileSync } from 'node:fs';
const R = 'C:/Users/arvik/code/byway';
const { c1, c4, c5, PROTOCOL_CONFIGS, presentationOf } = await import(`file:///${R}/packages/catalog/src/index.ts`);
const { createPromptRenderer } = await import(`file:///${R}/packages/prompts/src/index.ts`);
const { checkAnswer, diffFromNearest } = await import(`file:///${R}/packages/advisor/src/index.ts`);
const { estimateRecipe } = await import(`file:///${R}/packages/advisor/src/estimate.ts`);
const { PROFILES } = await import(`file:///${R}/packages/gateway/src/index.ts`);
const { suggestBudget, parseBudgetInput, formatCallRange, formatCostRange } = await import(`file:///${R}/apps/web/src/view/format.ts`);
const { diffLine } = await import(`file:///${R}/apps/web/src/view/composed.ts`);
const { parseRecipe } = await import(`file:///${R}/packages/recipe/src/index.ts`);

const prompts = createPromptRenderer();
const ctx = { prompts, catalog: PROTOCOL_CONFIGS };
const prof = (id: string) => PROFILES.find((p: any) => p.id === id);
const out: any[] = [];

function est(recipe: any, profileId: string) {
  const p = prof(profileId);
  const e = estimateRecipe(recipe, { profile: p, images: true, video: true, otherFamily: true, at: new Date('2026-10-08T12:00:00Z') });
  const suggested = suggestBudget(e).toFixed(2);
  return { cost: formatCostRange(e.lowUsd, e.highUsd), calls: formatCallRange(e.modelCalls), suggestedBudgetText: suggested, suggestedBudgetAccepted: parseBudgetInput(suggested) !== null };
}

function probe(name: string, nearest: any, change: (r: any) => void) {
  const raw = structuredClone(nearest);
  change(raw);
  const t0 = Date.now();
  let a: any;
  try { a = checkAnswer(JSON.stringify(raw), nearest, ctx, 'composed-f02-refute'); }
  catch (e: any) { out.push({ name, threw: `${e?.name}: ${String(e?.message).slice(0, 120)}`, ms: Date.now() - t0 }); return; }
  const row: any = { name, accepted: a.violations.length === 0, violations: a.violations.map((v: any) => `${v.ruleId}: ${v.message}`).slice(0, 4), ms: Date.now() - t0 };
  if (a.recipe) {
    const diff = diffFromNearest(a.recipe, nearest, presentationOf(nearest.id).name, presentationOf(nearest.id));
    row.diffShownPlain = diff.map((l: string) => diffLine(l, false));
    row.estimateDemo = est(a.recipe, 'demo');
    row.estimateBalanced = est(a.recipe, 'balanced');
  }
  out.push(row);
}

probe('baseline c1 unchanged', c1, () => {});
probe('c1 replicate n=1e9 (review case)', c1, (r) => { r.stages[0].body.n = 1_000_000_000; });
probe('c1 replicate n=2001 (just over Temporal default pending-activity limit)', c1, (r) => { r.stages[0].body.n = 2001; });
probe('c1 replicate n=12 (a plausible "more drafts" request)', c1, (r) => { r.stages[0].body.n = 12; });
probe('c1 nested replicate 100 x 100 inside D1', c1, (r) => { const inner = r.stages[0].body; r.stages[0].body = { op: 'replicate', id: 'outer-x100', n: 100, body: { ...inner, n: 100 } }; });
probe('c1 critic loop max=1e9 (sequential)', c1, (r) => { const walk = (n: any) => { if (!n || typeof n !== 'object') return; if (n.op === 'loop') n.gate.max = 1_000_000_000; for (const k of ['body', 'steps', 'branches', 'lenses']) { const v = n[k]; if (Array.isArray(v)) v.forEach((x: any) => walk(x.body ?? x)); else if (v) walk(v); } }; r.stages.forEach((s: any) => walk(s.body)); });
probe('c1 replicate n=-5 (negative)', c1, (r) => { r.stages[0].body.n = -5; });
probe('c1 replicate n=1.5 (fraction)', c1, (r) => { r.stages[0].body.n = 1.5; });

// Depth: how deep a recipe fits in the composer's 16,000-token output, and whether parse/validate copes.
function deep(depth: number) {
  const leafJson = JSON.stringify(c4.stages[0].body);
  const bodyJson = '{"op":"seq","steps":['.repeat(depth) + leafJson + ']}'.repeat(depth);
  const raw = structuredClone(c4);
  raw.stages[0].body = '__BODY__';
  const json = JSON.stringify(raw).replace('"__BODY__"', bodyJson);
  const t0 = Date.now();
  try {
    const a = checkAnswer(json, c4, ctx, 'composed-deep');
    return { depth, bytes: json.length, ok: a.violations.length === 0, firstViolation: a.violations[0]?.ruleId, ms: Date.now() - t0 };
  } catch (e: any) {
    return { depth, bytes: json.length, threw: `${e?.name}: ${String(e?.message).slice(0, 100)}`, ms: Date.now() - t0 };
  }
}
const depthRows = [100, 1000, 2000, 3000, 5000].map(deep);

// parseRecipe alone on the 1e9 case: schema accepts n up to MAX_SAFE_INTEGER?
let schemaMax: any;
try { const r = structuredClone(c1); r.stages[0].body.n = Number.MAX_SAFE_INTEGER; parseRecipe(r); schemaMax = 'schema accepts MAX_SAFE_INTEGER'; } catch (e: any) { schemaMax = `schema rejects: ${e?.message?.slice(0, 80)}`; }

const result = { probes: out, depthRows, schemaMax, c1D1: { op: c1.stages[0].body.op, n: c1.stages[0].body.n } };
writeFileSync(new URL('./probe-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
