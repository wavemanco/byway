// F20 reproduction probe (read-only import of the repo source; writes nothing into the repo).
// Drives the real Interpreter.loop / runStages with I/O stubbed: ask (checkpoints), emit (events) and step (activities).
import { Interpreter } from 'file:///C:/Users/arvik/code/byway/packages/runner/src/workflow/interpreter.ts';
import { BEST_SO_FAR_PROMPT, READY_PROMPT } from 'file:///C:/Users/arvik/code/byway/packages/runner/src/workflow/wording.ts';
import { c6, AUTHOR_ROUNDS } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/c6.ts';
import { c6a } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/c6a.ts';
import { c2 } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/c2.ts';
import { humanGate } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/parts.ts';

type Q = { stepId: string; prompt: string; kind: string };
const short = (p: string) => (p === READY_PROMPT ? 'READY?' : p === BEST_SO_FAR_PROMPT ? 'BEST_SO_FAR?' : p.slice(0, 50));

function engine(recipe: any, answer: (q: Q) => any) {
  const e: any = new Interpreter({ runId: 'probe', workspaceId: 'w', profileId: 'p', medium: recipe.medium ?? 'prose', problem: 'x', inputs: {}, routes: {}, recipe } as any, {} as any);
  const questions: Q[] = [];
  const events: any[] = [];
  const steps: string[] = [];
  e.ask = async (call: any, spec: any) => {
    const q = { stepId: call.stepId, prompt: spec.prompt, kind: spec.kind };
    questions.push(q);
    return answer(q);
  };
  e.emit = async (ev: any[]) => {
    events.push(...ev);
  };
  let n = 0;
  e.step = async (s: any, ports: any, ctx: any) => {
    const r = ctx.loop?.round;
    steps.push(`${ctx.stage}:${s.id}${r ? '@r' + r : ''}`);
    n++;
    if (s.actor === 'human' && s.role === 'build') return { ...ports, artifact: `draft-r${r}`, authored: `draft-r${r}` };
    if (s.actor === 'human' && s.role === 'voice') return { ...ports, voice: 'v', voiceSawArtifact: ports.artifact };
    if (s.actor === 'human') return { ...ports, taste: `taste-${n}` };
    if (s.role === 'render') return { ...ports, view: { pool: false, items: [{ imageArtifactIds: [`view-${n}`] }] } };
    if (s.role === 'vision') return { ...ports, brief: `brief-${n}`, artifact: ports.artifact ?? `brief-art-${n}` };
    if (s.role === 'critic' && ctx.loop && ctx.loop.loop.gate.metric.startsWith('critic')) {
      const out = { ...ports, critique: `crit-${n}`, score: { kind: 'score', value: 2 + ctx.loop.round, mode: 'OK' } };
      await e.afterGateStep(s, out, ctx.loop, ctx, e.call(s.id, ctx));
      return out;
    }
    return { ...ports, critique: `note-${s.id}-${n}` };
  };
  return { e, questions, events, steps };
}

const out: Record<string, unknown> = {};

// A. Reviewer's case: human gate max 1, empty body; answers would be "approved".
{
  const { e, questions, events } = engine({ stages: [] }, () => ({ approved: true }));
  const ports = await e.node({ op: 'loop', id: 'human-loop', body: { op: 'seq', steps: [] }, gate: humanGate(1) }, { artifact: 'DRAFT' }, { stage: 'D2', path: [] });
  out.A_humanGate_max1 = { ports, questions: questions.map((q) => short(q.prompt)), iterations: events.filter((x) => x.type === 'loop-iteration').map((x) => x.data) };
}

// B. Human gate max 3; the person answers "No, not ready" every time it is asked.
{
  const { e, questions, events } = engine({ stages: [] }, () => ({ approved: false }));
  const body = { op: 'step', id: 'write', role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'], writes: true };
  const ports = await e.node({ op: 'loop', id: 'human-loop', body, gate: humanGate(3) }, {}, { stage: 'D2', path: [] });
  out.B_humanGate_max3_alwaysNo = {
    gate: humanGate(3),
    returnedArtifact: ports.artifact,
    questions: questions.map((q) => `${q.stepId}:${short(q.prompt)}`),
    iterations: events.filter((x) => x.type === 'loop-iteration').map((x) => x.data.iteration),
  };
}

// C. Control: a critic-score loop with onCap:'human', max 2, never passing. The cap handler asks; "no" raises the cap once.
{
  const { e, questions, events } = engine({ stages: [] }, (q) => ({ approved: false }));
  const body = { op: 'seq', steps: [
    { op: 'step', id: 'critic', role: 'critic', actor: 'model', consumes: ['view'], produces: ['critique', 'score'] },
  ] };
  const gate = { metric: 'critic-score', threshold: 9, hidden: true, holder: 'worker', probe: 1, max: 2, onCap: 'human', onNoConverge: 'recalibrate-human' };
  const ports = await e.node({ op: 'loop', id: 'critic-loop', body, gate }, { artifact: 'A' }, { stage: 'D2', path: [] });
  out.C_control_criticLoop_onCapHuman_max2 = {
    questions: questions.map((q) => `${q.stepId}:${short(q.prompt)}`),
    iterations: events.filter((x) => x.type === 'loop-iteration').map((x) => x.data.iteration),
    returnedArtifact: ports.artifact,
  };
}

// D. Real C6 recipe through runStages: decline the optional angles; answer "No, not ready" to every READY question.
for (const [name, recipe] of [['c6', c6], ['c6a', c6a], ['c2', c2]] as const) {
  const { e, questions, events, steps } = engine(recipe, (q) => {
    if (q.prompt === READY_PROMPT) return { approved: false };
    if (q.kind === 'confirm') return { approved: false }; // optionals declined; any cap question would be "no"
    if (q.kind === 'pick' || q.kind === 'choose') return { choice: ['0'] };
    return { approved: false };
  });
  // c6a's pick is a human pick; stub pick to keep the probe narrow.
  e.pick = async (_p: any, ports: any) => ({ ...ports, artifact: 'card-0' });
  e.replicate = async (_r: any, ports: any) => ({ ...ports, options: ['o1', 'o2'] });
  const ports = await e.runStages();
  const loops: Record<string, number[]> = {};
  for (const x of events.filter((x) => x.type === 'loop-iteration')) (loops[x.stepId] ??= []).push(x.data.iteration);
  const readyBy: Record<string, number> = {};
  for (const q of questions.filter((q) => q.prompt === READY_PROMPT)) readyBy[q.stepId] = (readyBy[q.stepId] ?? 0) + 1;
  out[`D_${name}_runStages_alwaysNotReady`] = {
    gates: JSON.stringify((recipe as any).stages.map((s: any) => s.stage)),
    loopIterations: loops,
    readyQuestionsPerLoop: readyBy,
    bestSoFarQuestions: questions.filter((q) => q.prompt === BEST_SO_FAR_PROMPT).length,
    allQuestions: questions.map((q) => `${q.stepId}:${short(q.prompt)}`),
    stepsAfterLastLoopRound: steps.slice(steps.findLastIndex((s) => /@r/.test(s)) + 1),
    finalArtifact: ports.artifact,
    voiceSawArtifact: ports.voiceSawArtifact,
  };
}
out.AUTHOR_ROUNDS = AUTHOR_ROUNDS;
console.log(JSON.stringify(out, null, 2));
