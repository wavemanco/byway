// revise-A-r3-1b driver: catalog check and variants over the prototype in sem.mts.
import { CATALOG, PROTOCOL_CONFIGS, c1, c2, c3, c4, c5, c6, c6a, c7 } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/index.ts';
import { checkAnswer } from 'file:///C:/Users/arvik/code/byway/packages/advisor/src/compose.ts';
import { steps } from 'file:///C:/Users/arvik/code/byway/packages/recipe/src/index.ts';
import { humanKind } from 'file:///C:/Users/arvik/code/byway/packages/runner/src/workflow/wording.ts';
import { writeFileSync } from 'node:fs';
import { setExits, dr9, HUMAN_WRITE_ROLES, personWrite, voiceWrite, authorWrite, declaresVoice, voiceArm, voiceScope, BLOCK_OF_ROLE, blockOk, everyTime, alwaysRunR3, checkpoints, keyName, comp1, composedRules, kindRules, revised, prompts } from './sem.mts';
type N = any;
const OUT = 'C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b/r31b.out.json';
// ---------------- catalog: nothing new ----------------
const report: N = { catalog: {}, variants: [] };
const clone = (r: N) => { const c = JSON.parse(JSON.stringify(r)); delete c.hash; return c; };
for (const r of CATALOG as N[]) {
  const all = steps(r) as N[];
  const et = new Set(everyTime(r).map((x) => x.s));
  const ar = new Set(alwaysRunR3(r).map((x) => x.s));
  report.catalog[r.id] = {
    kind: r.kind,
    kindRuleAdds: kindRules(clone(r)),
    composedAddsAgainstItself: PROTOCOL_CONFIGS.includes(r) ? composedRules(clone(r), r) : 'n/a',
    checkpointsEveryTime: checkpoints(r, everyTime).map(keyName),
    checkpointsAlwaysRunR3: checkpoints(r, alwaysRunR3).map(keyName),
    stepsAlwaysRunButNotEveryTime: [...ar].filter((s) => !et.has(s)).map((s: N) => s.id),
    blockRoleDisagreements: all.filter((x) => !blockOk(x.step)).map((x) => x.step.id),
    humanFixWrites: all.filter((x) => x.step.actor === 'human' && x.step.role === 'fix').map((x) => x.step.id),
    dr9: dr9(r),
  };
}
const ROLES = ['seed', 'build', 'fix', 'voice', 'relay', 'render', 'asset', 'critic', 'check', 'cut', 'tells-sweep', 'tells-compare', 'vision', 'judge', 'select', 'dedupe', 'overlap'];
report.humanWriteRolesAgree = JSON.stringify(ROLES.filter((role) => humanKind({ role } as N) === 'write').sort()) === JSON.stringify([...HUMAN_WRITE_ROLES].sort());
report.catalogClean = Object.values(report.catalog).every((c: N) => c.kindRuleAdds.length === 0 && (c.composedAddsAgainstItself === 'n/a' || c.composedAddsAgainstItself.length === 0) && JSON.stringify(c.checkpointsEveryTime) === JSON.stringify(c.checkpointsAlwaysRunR3) && c.blockRoleDisagreements.length === 0);
console.log('CATALOG clean (no new finding, every-time checkpoints == r3 always-run checkpoints, block-role agrees):', report.catalogClean);
for (const [id, c] of Object.entries(report.catalog) as N) if (c.kindRuleAdds.length || (Array.isArray(c.composedAddsAgainstItself) && c.composedAddsAgainstItself.length) || c.stepsAlwaysRunButNotEveryTime.length) console.log('  ', id, JSON.stringify(c));
console.log('HUMAN_WRITE_ROLES agree with humanKind:', report.humanWriteRolesAgree);

// ---------------- variants ----------------
function mapNodes(n: N, f: (n: N) => N): N { const m = f(n); if (m !== n) return m; const c: N = { ...n }; if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f)); if (c.body) c.body = mapNodes(c.body, f); if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) })); if (c.lenses) c.lenses = c.lenses.map((b: N) => ({ ...b, body: mapNodes(b.body, f) })); return c; }
const edit = (r: N, id: string, f: (s: N) => N) => ({ ...r, stages: r.stages.map((s: N) => ({ ...s, body: mapNodes(s.body, (n: N) => (n.op === 'step' && n.id === id ? f(n) : n)) })) });
const findStep = (r: N, pred: (s: N) => boolean) => (steps(r) as N[]).map((x) => x.step).find(pred);
const run = (name: string, nearest: N, r: N, expect: 'refused' | 'admitted' | 'no-set-aside', mustInclude?: string) => {
  const c: N = checkAnswer(JSON.stringify(r), nearest, { prompts, catalog: PROTOCOL_CONFIGS }, 'composed-test');
  const today = c.violations.map((x: N) => x.ruleId + (x.clause ? ':' + x.clause : ''));
  const adds = revised(r, nearest);
  const verdict = expect === 'no-set-aside' ? (adds.some((x) => x.includes('set-aside')) ? 'set-aside' : 'no-set-aside') : today.filter((t: string) => !t.startsWith('COMPOSED-VOICE') && !t.startsWith('COMPOSED-AUTHOR') && !t.startsWith('PR6')).length || adds.length ? 'refused' : 'admitted';
  const ok = verdict === expect && (!mustInclude || adds.some((a) => a.includes(mustInclude)));
  report.variants.push({ name, today: today.length ? today : 'ACCEPTED', adds, verdict, expect, mustInclude, ok });
  console.log(`${ok ? 'OK ' : 'BAD'} ${name.padEnd(78)} | today: ${today.length ? today.join(',') : 'ACCEPTED'} | r3-1b: ${adds.length ? adds.join(', ') : 'NONE'}`);
};
const checkGate = (max: number, onCap: string) => ({ metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max, onCap, onNoConverge: onCap === 'human' ? 'recalibrate-human' : 'continue' });
const renderStep = (id: string) => ({ op: 'step', id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const c1check = findStep(c1, (s: N) => s.id === 'critic-check');
const c5check = findStep(c5, (s: N) => s.id === 'shot-check');
const c3draft = findStep(c3, (s: N) => s.id === 'ai-draft');
const wrap = (nearest: N, stage: string, voiceId: string, check: N, max: number, onCap: string) => {
  const r = clone(nearest); const st = r.stages.find((s: N) => s.stage === stage);
  const i = st.body.steps.findIndex((s: N) => s.op === 'step' && s.id === voiceId);
  st.body.steps[i] = { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [renderStep('pass-render'), check, st.body.steps[i]] }, gate: checkGate(max, onCap) };
  return r;
};
// K1: a protected checkpoint after a gate feed inside a loop body
{
  const r = clone(c1); const d3 = r.stages.find((s: N) => s.stage === 'D3');
  const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'voice'); const v = d3.body.steps[i];
  d3.body.steps = [...d3.body.steps.slice(0, i), { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [renderStep('final-render'), c1check, v] }, gate: checkGate(1, 'policy-best-snapshot') }];
  run('K1-C1 C1 VOICE after the defect check in a check-clean loop (max 1, policy)', c1, r, 'refused', 'COMPOSED-VOICE:missing');
  const r2 = clone(c1); const d3b = r2.stages.find((s: N) => s.stage === 'D3');
  d3b.body.steps = [...d3b.body.steps.slice(0, i), { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [renderStep('final-render'), c1check, v] }, gate: checkGate(2, 'human') }];
  run('K1-C1b same, max 2, onCap human', c1, r2, 'refused', 'COMPOSED-VOICE:missing');
}
run('K1-C5 C5 vo-script after a check in a check-clean loop', c5, wrap(c5, 'D1', 'vo-script', { ...c5check, id: 'script-check' }, 1, 'policy-best-snapshot'), 'refused', 'COMPOSED-VOICE:missing');
run('K1-C2 C2 VOICE after a check in a check-clean loop', c2, wrap(c2, 'D1', 'voice', { ...c1check, id: 'final-check' }, 1, 'policy-best-snapshot'), 'refused', 'COMPOSED-VOICE:missing');
{
  const r2 = clone(c6); const d2 = r2.stages.find((s: N) => s.stage === 'D2');
  const [write, rend] = d2.body.body.steps;
  d2.body = { op: 'seq', steps: [{ ...c3draft, id: 'starter', consumes: ['intent'] }, { op: 'loop', id: 'author-loop', body: { op: 'seq', steps: [renderStep('pre-render'), { ...c1check, id: 'starter-check' }, write] }, gate: checkGate(2, 'human') }, rend] }; r2.exceptions = [];
  run('K1-C6c C6 author write after a check in a check-clean loop', c6, r2, 'refused', 'COMPOSED-AUTHOR:missing');
  // Control: the same loop with the author write BEFORE the check runs every round: COMP-1 must count it.
  const r3 = clone(c6); const d2c = r3.stages.find((s: N) => s.stage === 'D2');
  d2c.body = { op: 'seq', steps: [{ op: 'loop', id: 'author-loop', body: { op: 'seq', steps: [write, renderStep('pre-render'), { ...c1check, id: 'starter-check' }] }, gate: checkGate(2, 'human') }, rend] }; r3.exceptions = [];
  const k = comp1(r3, c6);
  report.variants.push({ name: 'K1-ctl C6 author write before the check (counted)', comp1: k, ok: k.length === 0 });
  console.log(`${k.length === 0 ? 'OK ' : 'BAD'} K1-ctl C6 author write before the check: COMP-1 ${k.length ? k.join(',') : 'satisfied'}`);
}
// K1 relay: a check inside a relay link of a check-clean loop, VOICE after the relay
{
  const r = clone(c1); const d3 = r.stages.find((s: N) => s.stage === 'D3');
  const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'voice'); const v = d3.body.steps[i];
  d3.body.steps = [...d3.body.steps.slice(0, i), { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [{ op: 'relay', id: 'links', maxLinks: 2, body: { op: 'seq', steps: [renderStep('final-render'), c1check] } }, v] }, gate: checkGate(2, 'human') }];
  run('K1-relay C1 VOICE after a relay whose link holds the check', c1, r, 'refused', 'COMPOSED-VOICE:missing');
}
// K2: a keepsVoice writer moved past a later, narrower VOICE
for (const [label, id] of [['K2b render-in-scene', 'render-in-scene'], ['K2f vo-audio', 'vo-audio'], ['K2m matte (tool, writes:true)', 'matte']]) {
  const r = clone(c5); const d2 = r.stages.find((s: N) => s.stage === 'D2'); const d3 = r.stages.find((s: N) => s.stage === 'D3');
  const j = d2.body.steps.findIndex((s: N) => s.op === 'step' && s.id === id); const [w] = d2.body.steps.splice(j, 1);
  const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'voice'); d3.body.steps.splice(i + 1, 0, w);
  run(`${label} moved after C5's D3 VOICE (keepsVoice kept)`, c5, r, 'refused', 'extra-writer-after(voice');
}
// K2g: VOICE before CUT/TELLS with the Distill labels (and their knobs) stripped
{
  const r = clone(c5); const d3 = r.stages.find((s: N) => s.stage === 'D3');
  const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'voice'); const [v] = d3.body.steps.splice(i, 1); d3.body.steps.unshift(v);
  const strip = (n: N) => { if (n.op !== 'step' || (n.block !== 'CUT' && n.block !== 'TELLS')) return n; const { block: _b, knobs: _k, ...rest } = n; return rest; };
  d3.body.steps = d3.body.steps.map(strip);
  run('K2g C5 VOICE first in D3, CUT/TELLS labels stripped', c5, r, 'refused', 'block-role');
}
// G1: a retrying one-shot gate inside each
{
  const r = clone(c1); const d2 = r.stages.find((s: N) => s.stage === 'D2');
  const each = d2.body.steps[0]; const crit = findStep(c1, (s: N) => s.role === 'critic');
  each.body.steps.push(renderStep('cand-render'));
  each.body.steps.push({ op: 'gate', id: 'cand-gate', body: { ...crit, id: 'cand-critic' }, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, retry: { stage: 'D2', times: 1 }, onFail: 'human' });
  run('G1 C1 retrying one-shot gate inside each', c1, r, 'refused', 'ST10:retry-scope');
}
// Author write as role fix (stricter direction of the label): must now be admitted like the build original.
{
  const r = edit(clone(c6), 'write', (n) => ({ ...n, role: 'fix' }));
  const k = composedRules(r, c6);
  report.variants.push({ name: 'A-fix C6 author write as human fix', composedAdds: k, ok: k.length === 0 });
  console.log(`${k.length === 0 ? 'OK ' : 'BAD'} A-fix C6 author write declared as role fix: composed rules ${k.length ? k.join(',') : 'satisfied'} (r3 would report COMPOSED-AUTHOR:missing: ${JSON.stringify(comp1R3AuthorBuildOnly(r, c6))})`);
}
function comp1R3AuthorBuildOnly(r: N, nearest: N) { const a = (rr: N) => alwaysRunR3(rr).filter((x) => personWrite(x.s) && x.s.role === 'build').length; return a(r) < a(nearest) ? ['COMPOSED-AUTHOR:missing'] : []; }

// Earlier r1-r3 cases keep their verdicts
const fixC3 = findStep(c3, (s: N) => s.role === 'fix' && s.actor === 'model');
const replaceVoice = (r: N, withStep: N, sitsOutVoice: boolean) => { const rr = edit(r, 'voice', () => withStep); if (sitsOutVoice) rr.sitsOut = [...rr.sitsOut, { block: 'VOICE', reason: 'The AI writes the final pass in your voice' }]; return rr; };
const modelVoice = { ...fixC3, id: 'voice-pass', produces: ['voice', 'artifact'] };
run('M1 C3 VOICE replaced by model fix producing [voice, artifact]', c3, replaceVoice(clone(c3), modelVoice, false), 'refused');
run('M2 same + sitsOut VOICE', c3, replaceVoice(clone(c3), modelVoice, true), 'refused');
run('M3 same + block VOICE', c3, replaceVoice(clone(c3), { ...modelVoice, block: 'VOICE' }, false), 'refused');
run('W1 C3 VOICE produces [voice] only', c3, edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['voice'] })), 'refused');
run('W2 C3 VOICE role vision (block VOICE kept)', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'vision' })), 'refused');
run('W2b C3 VOICE role cut', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'cut' })), 'refused');
run('W2d C4 VOICE-lite role vision', c4, edit(clone(c4), 'voice', (n) => ({ ...n, role: 'vision' })), 'refused');
const pickR = { op: 'pick', id: 'final-pick', mode: 'R', k: 1, actor: 'policy' };
const pickH = { op: 'pick', id: 'final-pick', mode: 'H', k: 1, actor: 'human' };
const insAfter = (r: N, afterId: string | null, ...nodes: N[]) => { const st = r.stages[0]; const i = afterId === null ? st.body.steps.length - 1 : st.body.steps.findIndex((s: N) => s.id === afterId); st.body.steps.splice(i + 1, 0, ...nodes); return r; };
run('Q1 C2 + pick(R,1) after VOICE', c2, insAfter(clone(c2), 'voice', pickR), 'refused');
run('Q1+W2 VOICE role vision', c2, edit(insAfter(clone(c2), 'voice', pickR), 'voice', (s) => ({ ...s, role: 'vision' })), 'refused');
run('X1 C3 VOICE as a human build with block VOICE', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'build' })), 'refused');
run('X2 C3 VOICE without block VOICE', c3, edit(clone(c3), 'voice', (n) => { const { block: _b, ...rest } = n; return rest; }), 'refused');
run('X3 C3 + a human vision labelled VOICE', c3, edit(clone(c3), 'tells-compare', (n) => ({ op: 'seq', steps: [n, { op: 'step', id: 'fake-voice', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['view'], produces: ['voice', 'artifact'] }] })), 'refused');
run('X4 C6 author draft declares produces voice', c6, edit(clone(c6), 'write', (n) => ({ ...n, produces: ['voice', 'artifact'] })), 'refused');
const fixAfterC4 = { ...findStep(c4, (s: N) => s.role === 'fix' && s.actor === 'model'), id: 'ai-polish' };
const appendLast = (r: N, node: N) => { const last = r.stages.at(-1); last.body = last.body.op === 'seq' ? { ...last.body, steps: [...last.body.steps, node] } : { op: 'seq', steps: [last.body, node] }; return r; };
run('S1 C4 + model fix after VOICE, writes:false', c4, appendLast(clone(c4), { ...fixAfterC4, writes: false }), 'refused');
run('S2 writes omitted', c4, appendLast(clone(c4), (() => { const { writes: _w, ...x } = fixAfterC4; return x; })()), 'refused');
const fixAfterC3 = { op: 'step', id: 'ai-polish', role: 'fix', actor: 'model', tier: 'mid', prompt: fixC3.prompt, consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true };
run('V1 C3 VOICE [artifact] + honest writer after', c3, appendLast(edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['artifact'] })), fixAfterC3), 'refused');
run('V1b same + keepsVoice', c3, appendLast(edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['artifact'] })), { ...fixAfterC3, keepsVoice: true }), 'refused');
{ const r1 = clone(c5); const d3b = r1.stages.find((s: N) => s.stage === 'D3'); d3b.body.steps = d3b.body.steps.filter((s: N) => !(s.op === 'step' && s.id === 'voice')); run('V2c C5 D3 VOICE removed', c5, r1, 'refused'); }
run('V3 C3 VOICE -> claim-log', c3, edit(clone(c3), 'voice', (n) => ({ ...n, variant: 'claim-log' })), 'refused');
run('V3c C5 vo-script without VOICE-early', c5, edit(clone(c5), 'vo-script', (n) => { const { variant: _v, ...rest } = n; return rest; }), 'refused');
run('QA C2 + human own-map, pick(R) before VOICE', c2, insAfter(clone(c2), 'option-map', { op: 'step', id: 'own-map', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true }, pickR), 'refused');
const optionMap = findStep(c2, (s: N) => s.id === 'option-map');
run('QF C2 + VOICE > replicate(2, map keepsVoice) > pick(H)', c2, insAfter(clone(c2), 'voice', { op: 'replicate', id: 'variants', n: 2, body: { ...optionMap, id: 'map-variant', consumes: ['artifact'], keepsVoice: true } }, pickH), 'no-set-aside');
run('QRh C2 + human tells-compare right after VOICE', c2, insAfter(clone(c2), 'voice', { op: 'step', id: 'keep-or-revert', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }), 'refused');
{ const r = clone(c5); const d3 = r.stages.find((s: N) => s.stage === 'D3'); d3.body.steps = d3.body.steps.map((s: N) => (s.op === 'gate' ? { ...s, retry: { stage: 'D1', times: 1 } } : s)); run('C5 gate retries D1  [must stay legal]', c5, r, 'admitted'); }
// The existing advisor test (compose.test.ts:104): the mock composer widens C4's key-lines VOICE to every-line. Must stay ok.
{ const { composedRecipe } = await import('file:///C:/Users/arvik/code/byway/packages/gateway/src/mock/compose.ts');
  const c4Prompts = { build: 'product.c4.draft', critic: 'product.c4.recipient', fix: 'product.c4.revise', 'cut-apply': 'product.c4.apply-cut', 'tells-sweep': 'product.c4.tells-sweep', 'tells-swap': 'product.c4.apply-swaps' };
  const good = (composedRecipe as N)({ id: 'model-picked-id', title: 'Memo with a recipient read', long: true, prompts: c4Prompts });
  run('compose.test.ts:104 goodRecipe (C4 VOICE widened to every-line)', c4, good, 'admitted');
  const exact = (() => { const w = checkpoints(c4, everyTime).map(keyName); const h = checkpoints(good, everyTime).map(keyName); return w.filter((k) => !h.includes(k)); })();
  report.goodRecipeExactKeyMiss = exact;
  console.log('   exact-key COMP-1 (r3 prototype) would miss:', JSON.stringify(exact)); }
for (const r of PROTOCOL_CONFIGS as N[]) run(`control ${r.id} copied verbatim`, r, clone(r), 'admitted');
// R1 (found by the placement sweep): C3's keep-or-revert moved before apply-cut. On the "own draft" route the critic can
// pass before `revise` runs, so the previous version is still the AI angle card from before the person's draft, and
// keeping A puts it back. The r3 flow walk ran `revise` every round, so its set-aside rule missed it.
{
  const r = clone(c3); const d3 = r.stages.find((s: N) => s.stage === 'D3');
  const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'tells-compare'); const [tc] = d3.body.steps.splice(i, 1);
  d3.body.steps.splice(2, 0, tc);
  run('R1 C3 keep-or-revert moved right after the human cut (exit-aware flow)', c3, r, 'refused', 'set-aside(previous');
  setExits(false); const r3 = revised(r, c3).filter((x) => x.includes('set-aside')); setExits(true);
  report.variants.push({ name: 'R1 under the r3 flow (no exit forks)', setAside: r3, ok: r3.length === 0 });
  console.log(`${r3.length === 0 ? 'OK ' : 'BAD'} R1 under the r3 flow: set-aside findings ${JSON.stringify(r3)} (expected none: the r3 walk misses it)`);
}

report.allOk = report.variants.every((v: N) => v.ok) && report.catalogClean && report.humanWriteRolesAgree;
console.log('ALL OK:', report.allOk);
writeFileSync(OUT, JSON.stringify(report, null, 2));
