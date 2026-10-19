// verify-F20-refute: drive the real Interpreter over the canonical human-gated loops (C2 vision, C6a vision, C6/C6a
// author loop) and over a critic loop with onCap:'human', with every step and I/O stubbed, answering "No" to every
// confirm. Read-only imports from the repo; prints results to stdout only.
import { Interpreter } from 'file:///C:/Users/arvik/code/byway/packages/runner/src/workflow/interpreter.ts';
import { c2 } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/c2.ts';
import { c6 } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/c6.ts';
import { c6a } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/c6a.ts';

type Any = any;

function find(node: Any, pred: (n: Any) => boolean): Any {
  if (!node || typeof node !== 'object') return undefined;
  if (pred(node)) return node;
  for (const v of Object.values(node)) {
    const r = Array.isArray(v) ? v.map((x) => find(x, pred)).find(Boolean) : find(v, pred);
    if (r) return r;
  }
  return undefined;
}

async function drive(label: string, root: Any, answer: (q: Any, n: number) => boolean) {
  const engine: Any = new Interpreter({ runId: 'probe', inputs: {}, recipe: { stages: [] } } as Any, {} as Any);
  const trace: string[] = [];
  let art = 0;
  let asks = 0;
  engine.ask = async (call: Any, q: Any) => {
    const a = answer(q, ++asks);
    trace.push(`ASK[${call.stepId}] ${q.kind}: "${q.prompt}" -> ${a ? 'yes' : 'no'}`);
    return { approved: a };
  };
  engine.emit = async (evs: Any[]) => {
    for (const e of evs) if (e.type === 'loop-iteration') trace.push(`loop-iteration ${e.stepId} ${e.data.iteration}/${e.data.max}`);
  };
  engine.bestVersion = async () => 'BEST';
  const realStep = engine.step.bind(engine);
  engine.step = async (s: Any, ports: Any, ctx: Any) => {
    trace.push(`step ${s.id} (${s.actor}/${s.role})`);
    if (s.role === 'critic' && ctx.loop && root.__critic) {
      const out = { ...ports, score: { kind: 'score', value: 1 }, critique: 'gaps', view: { pool: false, items: [{}] }, artifact: ports.artifact ?? 'A0' };
      await engine.afterGateStep(s, out, ctx.loop, ctx, { key: 'k', stepId: s.id, stage: ctx.stage });
      return out;
    }
    void realStep;
    return { ...ports, artifact: `A${++art}` };
  };
  engine.audit = async (_a: Any, ports: Any) => {
    trace.push(`audit ${_a.id} (model readers)`);
    return ports;
  };
  let out: Any;
  let err: Any;
  try {
    out = await engine.node(root, {}, { stage: 'D2', path: [] });
  } catch (e) {
    err = String(e);
  }
  console.log(`\n=== ${label} ===`);
  for (const t of trace) console.log('  ' + t);
  console.log('  -> result artifact:', out?.artifact, err ? `error: ${err}` : '');
}

const alwaysNo = () => false;

// C6 author loop (humanGate(10)) followed by D3 voice, as in the recipe.
const c6Loop = find(c6, (n) => n.op === 'loop' && n.id === 'author-loop');
const c6Voice = c6.stages.find((s: Any) => s.stage === 'D3').body;
console.log('C6 author-loop gate:', JSON.stringify(c6Loop.gate));
await drive('C6 author-loop, person answers No to every "Is this ready?"', { op: 'seq', steps: [c6Loop, c6Voice] }, alwaysNo);

// C2 vision loop (humanGate(3)) followed by option-map and voice.
const c2Seq = c2.stages[0].body;
const i = c2Seq.steps.findIndex((n: Any) => n.op === 'loop');
console.log('\nC2 vision gate:', JSON.stringify(c2Seq.steps[i].gate));
await drive('C2 vision loop, No every time', { op: 'seq', steps: c2Seq.steps.slice(i, i + 3) }, alwaysNo);

// C6a vision loop (humanGate(2)) followed by the author loop's first write.
const c6aVision = find(c6a, (n) => n.op === 'loop' && n.id === 'vision');
console.log('\nC6a vision gate:', JSON.stringify(c6aVision.gate));
await drive('C6a vision loop, No every time', { op: 'seq', steps: [c6aVision] }, alwaysNo);

// Comparison: a critic-score loop with onCap:'human' (as C1/C4 declare), critic never passes, No every time.
const criticLoop: Any = {
  op: 'loop',
  id: 'critic-loop',
  body: { op: 'seq', steps: [{ op: 'step', id: 'build', role: 'build', actor: 'model', consumes: [], produces: ['artifact'] }, { op: 'step', id: 'critic', role: 'critic', actor: 'model', consumes: ['view'], produces: ['critique', 'score'] }] },
  gate: { metric: 'critic-score', threshold: 9, hidden: true, holder: 'worker', probe: 99, max: 2, onCap: 'human', onNoConverge: 'recalibrate-human' },
};
await drive('Comparison: critic loop max 2 onCap human, No every time', { op: 'seq', steps: [criticLoop], __critic: true }, alwaysNo);
