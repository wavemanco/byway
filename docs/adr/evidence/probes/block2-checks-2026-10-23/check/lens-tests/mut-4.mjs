const INT = 'packages/runner/src/workflow/interpreter.ts';
export default [
  { id: 'D1', file: INT, from: "return replacesCritique(o.body) ? withCritique(ports, '', DECLINED_CRITIQUE_NOTE) : ports;", to: 'return ports;', tests: ['packages/runner/test/declined-critique.test.ts'] },
  { id: 'D2', file: INT, from: 'const kept = handOn(ports, out, HANDED_ON.gate);', to: 'const kept: Ports = { ...ports, ...(out.critique ? { critique: out.critique } : {}) };', tests: ['packages/runner/test/gate-mark.test.ts', 'packages/runner/test/operator-ports.test.ts'] },
  { id: 'C7', file: INT, from: "revised === 'brief' && ports.briefQuestions ? 'questions' : true;", to: "revised === 'brief' ? 'questions' : true;", tests: ['packages/runner/test/revise-in-place.test.ts'] },
  { id: 'L1', file: 'packages/runner/src/lost-runs.ts', from: "      if (opts.skipQueued && run.status === 'queued') continue;\n", to: '', tests: ['packages/runner/test/reconcile-while-running.test.ts', 'packages/runner/test/dev-engine.test.ts'] },
  { id: 'L2', file: 'packages/runner/src/lost-runs.ts', from: "      if (await settleLostRun(store, run.id, { status: 'failed', error: LOST_RUN_MESSAGE })) lost.push(run.id);", to: "      await settleLostRun(store, run.id, { status: 'failed', error: LOST_RUN_MESSAGE });\n      lost.push(run.id);", tests: ['packages/runner/test/reconcile-while-running.test.ts', 'packages/runner/test/dev-engine.test.ts'] },
  { id: 'T3', file: 'packages/gateway/src/estimate.ts', from: '  return tokenCost(price, { inputTokens, outputTokens: maxOutputTokens });', to: '  return tokenCost({ ...price, longContext: undefined }, { inputTokens, outputTokens: maxOutputTokens });', tests: ['packages/gateway/test/pricing.test.ts', 'packages/gateway/test/estimate.test.ts'] },
];
