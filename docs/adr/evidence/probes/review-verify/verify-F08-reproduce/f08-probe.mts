// F08 reproduction probe (read-only imports from the repo at b33f1285). Run with cwd C:/Users/arvik/code/byway:
//   pnpm exec tsx C:/Users/arvik/AppData/Local/Temp/byway-review-verify/verify-F08-reproduce/f08-probe.mts
import { pathToFileURL } from 'node:url';
const R = 'C:/Users/arvik/code/byway/packages';
const imp = (p: string) => import(pathToFileURL(`${R}/${p}`).href);
const cat = await imp('catalog/src/index.ts');
const { createPromptRenderer } = await imp('prompts/src/index.ts');
const adv = await imp('advisor/src/index.ts');
const { walk } = await imp('recipe/src/index.ts');

const prompts = createPromptRenderer();
const ctx = { prompts, catalog: cat.PROTOCOL_CONFIGS };
const out: any[] = [];

function probe(name: string, nearest: any, change: (r: any) => void) {
  const raw = structuredClone(nearest);
  let touched = 0;
  const wrapped = (r: any) => { change(r); };
  wrapped(raw);
  // sanity: did the mutation actually change the JSON?
  touched = JSON.stringify(raw) === JSON.stringify(nearest) ? 0 : 1;
  const answer = adv.checkAnswer(JSON.stringify(raw), nearest, ctx, 'composed-f08-probe');
  const pres = cat.presentationOf(nearest.id);
  const diff = answer.recipe ? adv.diffFromNearest(answer.recipe, nearest, pres.name, pres) : null;
  // What the route ("Steps, and who does each") shows for the composed recipe, for comparison with the canonical route.
  let routeDelta: string[] | null = null;
  if (answer.recipe) {
    const copy = { code: 'x', name: 'x', promise: 'x', bestFor: ['x'] };
    const flat = (p: any) => p.stages.flatMap((s: any) => s.steps.map((st: any) => `${s.stage}|${st.label}|${st.who}|${st.explainer}`));
    const a = flat(adv.presentComposed({ ...nearest, kind: 'composed', channel: 'workspace' }, copy));
    const b = flat(adv.presentComposed(answer.recipe, copy));
    routeDelta = [...b.filter((x: string) => !a.includes(x)).map((x: string) => `+ ${x}`), ...a.filter((x: string) => !b.includes(x)).map((x: string) => `- ${x}`)];
  }
  out.push({ name, mutated: !!touched, accepted: answer.violations.length === 0, violations: answer.violations.map((v: any) => `${v.ruleId}: ${v.message}`), diff, routeDelta });
}

const onPick = (id: string, f: (n: any) => void) => (r: any) => walk(r, (n: any) => { if (n.op === 'pick' && n.id === id) f(n); });
const onLoop = (id: string, f: (n: any) => void) => (r: any) => walk(r, (n: any) => { if (n.op === 'loop' && n.id === id) f(n); });
const onStep = (id: string, f: (n: any) => void) => (r: any) => walk(r, (n: any) => { if (n.op === 'step' && n.id === id) f(n); });
const onOp = (op: string, f: (n: any) => void) => (r: any) => walk(r, (n: any) => { if (n.op === op) f(n); });

const { c1, c3, c4, c5 } = cat;

// The control: the review's own baseline.
probe('control: C1 against itself', c1, () => {});
// The review's two cases.
probe('review case 1: C1 pick-one H/human -> R/policy', c1, onPick('pick-one', (n) => { n.mode = 'R'; n.actor = 'policy'; }));
probe('review case 2: C1 critic-loop threshold 9 -> 1', c1, onLoop('critic-loop', (n) => { n.gate.threshold = 1; }));
// Further executable fields, one at a time.
probe('C1 pick-one H/human -> C/model', c1, onPick('pick-one', (n) => { n.mode = 'C'; n.actor = 'model'; }));
probe('C1 pick-one k 1 -> 2', c1, onPick('pick-one', (n) => { n.k = 2; }));
probe('C1 critic-loop onCap human -> policy-best-snapshot', c1, onLoop('critic-loop', (n) => { n.gate.onCap = 'policy-best-snapshot'; }));
probe('C1 critic-loop onNoConverge -> continue', c1, onLoop('critic-loop', (n) => { n.gate.onNoConverge = 'continue'; }));
probe('C1 critic-loop plateau removed', c1, onLoop('critic-loop', (n) => { delete n.gate.plateau; }));
probe('C1 critic-loop probe 2 -> 5', c1, onLoop('critic-loop', (n) => { n.gate.probe = 5; }));
probe('C1 critic-loop hidden true -> false', c1, onLoop('critic-loop', (n) => { n.gate.hidden = false; }));
probe('C1 critic-loop max 5 -> 3 (positive control)', c1, onLoop('critic-loop', (n) => { n.gate.max = 3; }));
probe('C1 optional asset trigger reworded', c1, onOp('optional', (n) => { n.trigger = 'always, whatever the design looks like'; }));
probe('C1 apply-cut writes:false', c1, onStep('apply-cut', (n) => { n.writes = false; }));
probe('C1 critic isolated flipped', c1, onStep('critic', (n) => { n.isolated = !n.isolated; }));
probe('C1 exceptions cleared', c1, (r) => { r.exceptions = []; });
probe('C3 sitsOut RELAY removed', c3, (r) => { r.sitsOut = []; });
probe('C3 pick-angle H/human -> R/policy', c3, onPick('pick-angle', (n) => { n.mode = 'R'; n.actor = 'policy'; }));
probe('C3 route branch "own" removed', c3, onOp('route', (n) => { n.branches = n.branches.filter((b: any) => b.name !== 'own'); }));
probe('C3 critic-loop rank threshold changed', c3, onLoop('critic-loop', (n) => { n.gate.threshold = 5; }));
probe('C5 launch-gate pass threshold changed', c5, onOp('gate', (n) => { n.pass.threshold = (n.pass.threshold ?? 3) + 2; }));
probe('C5 launch-gate retry times changed', c5, onOp('gate', (n) => { if (n.retry) n.retry.times = n.retry.times + 3; }));
probe('C5 pick-concept H/human -> R/policy', c5, onPick('pick-concept', (n) => { n.mode = 'R'; n.actor = 'policy'; }));
probe('C4 a loop gate metric changed to human', c4, (r) => walk(r, (n: any) => { if (n.op === 'loop' && n.gate.metric !== 'human') n.gate.metric = 'human'; }));

console.log(JSON.stringify(out, null, 2));
