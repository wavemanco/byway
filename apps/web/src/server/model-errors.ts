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

const named = (err: unknown, name: string): err is Error & { code?: unknown; budget?: { scope?: unknown }; heldKey?: unknown; billed?: unknown; declined?: unknown; waited?: unknown } =>
  err instanceof Error && err.name === name;

/**
 * What is said after the gateway's words for a call that used the whole of its model's wait: asking again is a new call,
 * so a person who presses Try again knows it can be billed as the first may have been.
 */
export const WAITED_TRY_AGAIN = 'Trying again makes a new call, which may be billed too.';

/** The gateway's mark on a call that used the whole of its wait (its waitedError), read as the gateway's waitedOf reads it. */
const usedItsWait = (waited: unknown): boolean => typeof waited === 'object' && waited !== null && typeof (waited as { minutes?: unknown }).minutes === 'number';

/**
 * A call the provider answered and billed, whose answer byway could not keep, record or use (ADR-0099). It is counted in
 * the spending records, and asking again is a new, paid call: the copy says both rather than inviting a free retry.
 */
export const BILLED_CALL_LOST =
  'The model answered and the call was paid for, but byway could not keep the answer, so nothing changed here. The cost is counted in your spending (Settings, Spending records). Trying again makes, and pays for, a new call.';

/** The plain problem for a model error, or undefined when the error is something else (left to fail as it would). */
export function modelProblem(err: unknown): ModelProblem | undefined {
  if (named(err, 'GatewayError')) {
    // A held provider key (ADR-0088): the gateway's message names the variable, never the value, and says what to do.
    if (typeof err.heldKey === 'string') {
      if (err.code === 'invalid-request') return { status: 400, message: err.message };
      if (err.code === 'provider-error') return { status: 502, message: err.message };
    }
    // The model declined and byway's one retry on it brought no answer (ADR-0102): the gateway's message is the one plain
    // message the Run screen shows too. It says what happened, what both attempts cost, and what to do.
    if (err.code === 'refused' && typeof err.declined === 'object' && err.declined !== null) return { status: 502, message: err.message };
    // A call that used the whole of its model's wait, chosen in Settings (ADR-0114; the waits design of 2026-10-22): the
    // gateway's words say the wait ran out, that the call may have billed the work and where to wait longer, as a run's
    // step says them, rather than "did not answer, try again in a minute" (CRITIC-1). Compose and intake wait as model
    // steps do, so a person who waited 15 minutes or more is told why, and that asking again is a new call. 504: byway
    // stopped waiting for the provider.
    if (usedItsWait(err.waited)) return { status: 504, message: `${err.message} ${WAITED_TRY_AGAIN}` };
    // Billed, whatever the code: the provider answered and was paid (ADR-0099), so 'did not answer, try again' is untrue.
    if (err.billed === true) return { status: 500, message: BILLED_CALL_LOST };
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
      case 'byway-failure':
        // Not billed: byway did not make the call (it is stopping, or could not record it as sent). Its own words say so.
        return { status: 503, message: err.message };
      case 'in-flight':
        return { status: 409, message: 'This request is already being answered. Wait a moment, then try again.' };
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
