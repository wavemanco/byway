// verify-F08-refute: read-only probe of diffFromNearest / presentComposed / checkAnswer against single-field edits.
// Imports repo source by absolute path; writes nothing anywhere (stdout only).
const R = 'file:///C:/Users/arvik/code/byway/packages';
const cat = await import(`${R}/catalog/src/index.ts`);
const prm = await import(`${R}/prompts/src/index.ts`);
const adv = await import(`${R}/advisor/src/index.ts`);
const rec = await import(`${R}/recipe/src/index.ts`);

const { c1, c2, c4, c5, c6, c7, PROTOCOL_CONFIGS, presentationOf } = cat;
const prompts = prm.createPromptRenderer();
const ctx = { prompts, catalog: PROTOCOL_CONFIGS };
const out: unknown[] = [];

function routeOf(recipe: any) {
  const p = adv.presentComposed(recipe, { code: 'x', name: 'x', promise: 'x', bestFor: [] });
  return p.stages.map((s: any) => `${s.stage}: ` + s.steps.map((st: any) => `${st.label}[${st.who}]`).join(' | ')).join(' ;; ');
}
function explainers(recipe: any, labelRe: RegExp) {
  const p = adv.presentComposed(recipe, { code: 'x', name: 'x', promise: 'x', bestFor: [] });
  return p.stages.flatMap((s: any) => s.steps).filter((st: any) => labelRe.test(st.label)).map((st: any) => `${st.label} (${st.who}): ${st.explainer}`);
}

function probe(name: string, nearest: any, change: (r: any) => void, extra?: (composed: any) => unknown) {
  const raw = structuredClone(nearest);
  change(raw);
  const a = adv.checkAnswer(JSON.stringify(raw), nearest, ctx, 'composed-verify');
  const diff = a.recipe ? adv.diffFromNearest(a.recipe, nearest, presentationOf(nearest.id).name, presentationOf(nearest.id)) : null;
  const row: any = { name, nearest: nearest.id, accepted: !!a.recipe && a.violations.length === 0, violations: a.violations.map((v: any) => `${v.ruleId}: ${v.message}`).slice(0, 3), diff };
  if (extra && a.recipe) row.extra = extra(a.recipe);
  out.push(row);
}

// Baselines: canonical vs itself (route) for context
out.push({ name: 'C1 canonical route', route: routeOf(c1) });

// --- review's two cases ---
probe('C1 human pick -> random policy pick', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'pick') { n.mode = 'R'; n.actor = 'policy'; } }), (c) => ({ route: routeOf(c), pickExplainer: explainers(c, /pick/i) }));
probe('C1 human pick -> AI (critic) pick', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'pick') { n.mode = 'C'; n.actor = 'model'; } }), (c) => ({ route: routeOf(c), pickExplainer: explainers(c, /pick/i) }));
probe('C1 critic threshold 9 -> 1', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop') n.gate.threshold = 1; }));

// --- other gate semantics ---
probe('C1 critic loop onCap human -> policy-best-snapshot', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop') n.gate.onCap = 'policy-best-snapshot'; }));
probe('C1 critic loop onNoConverge -> continue', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop') n.gate.onNoConverge = 'continue'; }));
probe('C1 critic loop hidden true -> false', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop') n.gate.hidden = false; }));
probe('C1 critic loop plateau removed', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop') delete n.gate.plateau; }));
probe('C1 critic loop probe 2 -> 1', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop') n.gate.probe = 1; }));
probe('C1 pick k 1 -> 2', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'pick') n.k = 2; }));
probe('C1 optional trigger text changed', c1, (r) => rec.walk(r, (n: any) => { if (n.op === 'optional') n.trigger = 'always, whatever the design looks like'; }));

// rank-gate threshold on C4 (rank gate)
probe('C4 rank gate threshold changed', c4, (r) => rec.walk(r, (n: any) => { if (n.op === 'loop' && n.gate.metric === 'critic-rank') n.gate.threshold = 5; }));

// sitsOut removal and exceptions change
probe('C5 sitsOut removed (if any)', c5, (r) => { r.sitsOut = []; });
out.push({ name: 'sitsOut of canonical', sitsOut: PROTOCOL_CONFIGS.map((r: any) => `${r.id}:${r.sitsOut.map((s: any) => s.block).join(',')}`) });

// Picks in each canonical recipe (who decides) for context
const picks: string[] = [];
for (const r of PROTOCOL_CONFIGS) rec.walk(r, (n: any) => { if (n.op === 'pick') picks.push(`${r.id}:${n.id}:${n.mode}/${n.actor}`); });
out.push({ name: 'canonical picks', picks });

// Gates in each canonical recipe
const gates: string[] = [];
for (const r of PROTOCOL_CONFIGS) rec.walk(r, (n: any) => { if (n.op === 'loop') gates.push(`${r.id}:${n.id}:${n.gate.metric}/thr=${n.gate.threshold}/max=${n.gate.max}/onCap=${n.gate.onCap}`); if (n.op === 'gate') gates.push(`${r.id}:${n.id}:oneshot ${n.pass.metric}/thr=${n.pass.threshold}`); });
out.push({ name: 'canonical gates', gates });

// one-shot gate threshold changes (C5 has one?)
for (const r of PROTOCOL_CONFIGS) {
  let has = false;
  rec.walk(r, (n: any) => { if (n.op === 'gate') has = true; });
  if (has) probe(`${r.id} one-shot gate threshold -> 1`, r, (x) => rec.walk(x, (n: any) => { if (n.op === 'gate' && n.pass.threshold !== undefined) n.pass.threshold = 1; }));
}

console.log(JSON.stringify(out, null, 2));
