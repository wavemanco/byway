/**
 * The id the Recommendation screen's Start names its run with (StartRunInput.runId; F03 P3, ADR-0099 decision 7).
 *
 * The id stands for one Start, and the server gives the run it started back to a Start sent again under it. So it is
 * sent again only while that Start got no answer (the request failed on its way, or its answer was lost: the run may
 * have started) and with the same inputs. Once byway answered with a refusal (its engine was down, the budget did not
 * fit, the recipe changed), that Start is over: the run did not start, or failed as it started, and a press after the
 * refusal is a new Start with a new id. A Start with other inputs (budget, recipe, routes, examples, or a recipe
 * composed again) is a new one too. Before, one id lived as long as the screen: a press after "Restart byway, then try
 * again" got the failed run back and started nothing, and a changed budget or a recipe composed again got the earlier
 * run. A Start whose inputs went back to earlier ones gets a new id, not the earlier one: that is a second press of an
 * earlier choice, and at worst starts what the person asked for twice.
 */
import { ApiError } from './api.ts';

export interface StartInputs {
  /** What the Start sends, apart from its id. */
  body: Readonly<Record<string, unknown>>;
  /**
   * The composed recipe shown, compared by identity: the server holds the recipe itself, so a recipe composed again is
   * another Start even when its view reads the same (the server refuses a known id for another recipe as well).
   */
  composed: object | null;
}

export interface StartIdentity {
  /** Sends a Start of `inputs` through `post`, naming its run with this Start's id. */
  send<T>(inputs: StartInputs, post: (runId: string) => Promise<T>): Promise<T>;
}

/** byway answered the Start with a refusal: an error status, not a success whose body could not be read. */
const refused = (err: unknown): boolean => err instanceof ApiError && err.status !== undefined && (err.status < 200 || err.status > 299);

export function createStartIdentity(mint: () => string = () => crypto.randomUUID()): StartIdentity {
  let held: { id: string; body: string; composed: object | null } | null = null;
  return {
    async send(inputs, post) {
      const body = JSON.stringify(inputs.body);
      if (held === null || held.body !== body || held.composed !== inputs.composed) held = { id: mint(), body, composed: inputs.composed };
      const sent = held;
      try {
        return await post(sent.id);
      } catch (err) {
        if (refused(err) && held === sent) held = null;
        throw err;
      }
    },
  };
}
