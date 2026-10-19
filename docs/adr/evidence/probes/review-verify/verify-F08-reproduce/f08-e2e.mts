// F08 end-to-end through Advisor.compose (demo gateway, mock composer answer, real templates, ledger in this folder).
// Run with cwd C:/Users/arvik/code/byway: pnpm exec tsx <this file>
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const R = 'C:/Users/arvik/code/byway/packages';
const imp = (p: string) => import(pathToFileURL(`${R}/${p}`).href);
const cat = await imp('catalog/src/index.ts');
const { createPromptRenderer } = await imp('prompts/src/index.ts');
const adv = await imp('advisor/src/index.ts');
const gw = await imp('gateway/src/index.ts');
const { walk } = await imp('recipe/src/index.ts');
const { MemoryArtifacts } = await imp('advisor/test/helpers.ts');

const SCRATCH = 'C:/Users/arvik/AppData/Local/Temp/byway-review-verify/verify-F08-reproduce';
const fenced = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';

const ALL_QS = ['decision', 'code-change', 'media', 'visual', 'fiction', 'series', 'effort-signal'];
const answersFor = (yes: string) => ALL_QS.map((q) => ({ questionId: q, answer: q === yes, confidence: 1, rationale: 'probe', setBy: 'user' }));

async function run(name: string, mutate: (r: any) => void) {
  const composed = structuredClone(cat.c1);
  mutate(composed);
  const dir = mkdtempSync(join(SCRATCH, 'ledger-'));
  const gateway = gw.createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => 100 },
    env: {},
    demo: true,
    now: () => new Date('2026-10-08T12:00:00Z'),
    mockResponders: { 'advisor.compose': () => fenced(composed) },
  });
  const advisor = adv.createAdvisor({ gateway, prompts: createPromptRenderer(), newId: () => 'composed-f08' });
  const res = await advisor.compose({ text: 'A landing page for a small bakery' }, { workspaceId: 'ws-f08', profileId: 'demo', answers: answersFor('visual') });
  const route = res.presentation.stages.flatMap((s: any) => s.steps.filter((st: any) => /pick/i.test(st.label)).map((st: any) => `${s.stage}: ${st.label} (who=${st.who}) - ${st.explainer}`));
  return { name, nearest: res.nearestRecipeId, ok: res.ok, violations: res.violations, diff: res.diff, pickStepsInRoute: route };
}

const out = [
  await run('unchanged C1', () => {}),
  await run('C1 pick-one -> random policy pick', (r) => walk(r, (n: any) => { if (n.op === 'pick') { n.mode = 'R'; n.actor = 'policy'; } })),
  await run('C1 critic-loop threshold 9 -> 1', (r) => walk(r, (n: any) => { if (n.op === 'loop') n.gate.threshold = 1; })),
];
console.log(JSON.stringify(out, null, 2));
