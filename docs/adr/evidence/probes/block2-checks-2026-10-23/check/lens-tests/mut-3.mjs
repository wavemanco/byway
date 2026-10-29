const g = ['packages/gateway'];
export default [
  { id: 'F2', file: 'packages/gateway/src/providers/fal.ts', from: "return err?.status === 504 && err.timeoutType === 'user';", to: 'return err?.status === 504;', tests: g },
  { id: 'F18', file: 'packages/gateway/src/waited.ts', from: "  err.billing = 'none';\n  err.notStarted = true;", to: "  err.billing = 'maybe';\n  err.notStarted = true;", tests: g },
  { id: 'A1', file: 'packages/gateway/src/providers/anthropic.ts', from: "thinking: { type: 'adaptive', display: 'summarized' },", to: "thinking: { type: 'adaptive' },", tests: g },
  { id: 'GG1', file: 'packages/gateway/src/providers/google.ts', from: "return deadline ? { ...params, config: { ...params.config, abortSignal: deadline.signal } } : params;", to: 'return params;', tests: g },
  { id: 'O1', file: 'packages/gateway/src/providers/openai.ts', from: 'timeout: deadline.afterMs + IMAGE_SDK_TIMEOUT_ABOVE_WAIT_MS', to: 'timeout: deadline.afterMs', tests: g },
  { id: 'W1', file: 'apps/web/src/server/api.ts', from: 'if (!model.choices.includes(input.minutes)) {', to: 'if (false) {', tests: ['apps/web'] },
  { id: 'W2', file: 'apps/web/src/server/api.ts', from: 'const model = deps.modelWaits().find((m) => m.provider === input.provider && m.model === input.model);', to: 'const model = deps.modelWaits().find((m) => m.model === input.model);', tests: ['apps/web'] },
  { id: 'P1', file: 'packages/runner/src/stored-inputs.ts', from: '  return JSON.stringify(brief);', to: '  return JSON.stringify(p);', tests: ['packages/runner/test/stored-inputs.test.ts', 'packages/runner/test/inputs-weight.test.ts'] },
  { id: 'P2', file: 'packages/runner/src/client.ts', from: '      const problems = engineProblems(recipe);\n      if (problems.length) throw new RecipeRefusedError(recipe.id, problems.map((p) => p.message));', to: '      await storeRunInputs(store.artifacts, input);\n      const problems = engineProblems(recipe);\n      if (problems.length) throw new RecipeRefusedError(recipe.id, problems.map((p) => p.message));', tests: ['packages/runner/test/stored-inputs.test.ts', 'packages/runner/test/start-refusal.test.ts'] },
];
