// F02 runtime probe (verify-F02-reproduce): drives the real Interpreter.replicate / node / step / RunControl code
// outside Temporal. Only `act` (the activity boundary, where a budget refusal would first be seen) is stubbed: it
// records the call and never resolves, as an activity awaiting its result would. Writes nothing.
// Usage (cwd C:/Users/arvik/code/byway): pnpm exec tsx <this file> <n> [<n> ...]
const R = 'file:///C:/Users/arvik/code/byway/packages';
const { Interpreter } = await import(`${R}/runner/src/workflow/interpreter.ts`);
const { RunControl } = await import(`${R}/runner/src/workflow/control.ts`);
const { c1 } = await import(`${R}/catalog/src/index.ts`);

const body = (c1 as any).stages[0].body.body; // the canonical C1 replicate body: one SEED model step
const ns = process.argv.slice(2).map(Number);
const results: any[] = [];
for (const n of ns) {
  const input = { runId: 'probe', workspaceId: 'ws', recipe: { id: 'composed-probe', stages: [] }, profileId: 'demo', medium: 'web-page', problem: { text: 'x' }, budgetUsd: 1, routes: {}, inputs: {} };
  const engine: any = new Interpreter(input as any, new RunControl('probe'));
  let branches = 0;
  let acts = 0;
  let branchesAtFirstAct: number | undefined;
  const proto = Object.getPrototypeOf(engine);
  engine.node = function (node: any, ports: any, ctx: any) {
    if (node === body && ctx.path.length === 1) {
      branches++;
      if (branches % 1_000_000 === 0) process.stderr.write(`branches started: ${branches}, heapUsed ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB\n`);
    }
    return proto.node.call(this, node, ports, ctx);
  };
  engine.act = (_call: any, _fn: unknown) => {
    acts++;
    if (branchesAtFirstAct === undefined) branchesAtFirstAct = branches;
    return new Promise(() => {}); // the activity (and any budget refusal it would raise) has not answered yet
  };
  globalThis.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  let error: string | undefined;
  try {
    void engine.node({ op: 'replicate', id: 'seeded-x4', n, body }, {}, { stage: 'D1', path: [] });
    // let the synchronous prefix finish and the microtasks run up to the activity boundary
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  } catch (e: any) {
    error = `${e?.name}: ${e?.message}`;
  }
  const ms = Math.round(performance.now() - t0);
  const heapMB = Math.round((process.memoryUsage().heapUsed - heap0) / 1e6);
  results.push({ n, branchesStarted: branches, branchesStartedBeforeFirstActivity: branchesAtFirstAct, activityCallsPendingAtOnce: acts, occurrenceKeys: engine.occurrences.size, ms, heapGrowthMB: heapMB, error });
  process.stderr.write(JSON.stringify(results.at(-1)) + '\n');
}
console.log(JSON.stringify(results, null, 2));
