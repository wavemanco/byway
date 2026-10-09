/**
 * What the person is told when a model call made while recommending or composing fails (UX-2). The advisor passes
 * gateway errors (keys, budgets, provider trouble) through unchanged and adds its own when a model's answer cannot be
 * read; without this they reached the person as "This screen did not load" or a generic 500, with no hint that a key
 * was wrong or the workspace budget spent. Errors are matched by name and code, not class: the services may have been
 * created by another server bundle, whose classes are different objects.
 */

export interface ModelProblem {
  status: number;
  message: string;
}

const named = (err: unknown, name: string): err is Error & { code?: unknown; budget?: { scope?: unknown }; heldKey?: unknown } => err instanceof Error && err.name === name;

/** The plain problem for a model error, or undefined when the error is something else (left to fail as it would). */
export function modelProblem(err: unknown): ModelProblem | undefined {
  if (named(err, 'GatewayError')) {
    // A held provider key (ADR-0088): the gateway's message names the variable, never the value, and says what to do.
    if (typeof err.heldKey === 'string') {
      if (err.code === 'invalid-request') return { status: 400, message: err.message };
      if (err.code === 'provider-error') return { status: 502, message: err.message };
    }
    switch (err.code) {
      case 'no-credentials':
        return { status: 400, message: 'A model provider did not accept byway’s key, or no key is set for it. Check the key in .env.agents (Settings shows which providers have one), restart byway, then try again.' };
      case 'budget-exceeded':
        return err.budget?.scope === 'run'
          ? { status: 400, message: 'This would go over the run’s budget. Start the run with a larger budget.' }
          : { status: 400, message: 'This would go over your workspace budget. Raise the workspace budget in Settings, then try again.' };
      case 'rate-limited':
        return { status: 503, message: 'The model provider is busy right now. Try again in a minute.' };
      case 'provider-error':
        return { status: 503, message: 'The model provider did not answer. Try again in a minute.' };
      case 'accounting-fault':
        return { status: 409, message: 'byway found a line in its spend ledger that it cannot read or reconcile with what it has counted, so it makes no paid calls until you look at it. Open Settings, Spending records, and acknowledge it there, then try again.' };
      case 'refused':
        return { status: 502, message: 'The model declined to answer this request. Rephrase the problem, or choose a recipe from the Library.' };
      default:
        return undefined;
    }
  }
  if (named(err, 'AdvisorError')) {
    if (err.code === 'intake-unreadable') return { status: 502, message: 'byway could not read the model’s answer about your problem. Try again, or choose a recipe from the Library.' };
    if (err.code === 'compose-unreadable') return { status: 502, message: 'byway could not build a recipe from the model’s answer. Try again, or choose one of the eight recipes.' };
  }
  return undefined;
}
