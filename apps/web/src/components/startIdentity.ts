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
 *
 * The Start that got no answer is kept in the tab's session too (B-042, ADR-0099's Later note of 2026-10-28): before, the
 * id lived only while the screen was mounted, so after a reload, or after choosing another recipe and coming back, the
 * same Start pressed again was a new one and could start a second run. Kept across a page, a composed recipe is compared
 * by how its view reads, since the object is gone; a recipe composed again that reads the same is then refused by the
 * server (it holds the recipe), which ends that Start. A Start that was answered is not kept: a press after coming back
 * to the screen is a new one, as before.
 */
import { ApiError } from './api.ts';
import { sessionSlot, type StorageSource } from './sessionSlot.ts';

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

/** A Start as the tab keeps it: its id, what it sent, and its composed recipe's view as JSON (null: none). */
interface KeptStart {
  id: string;
  body: string;
  composed: string | null;
}

function decodeKept(raw: unknown): KeptStart | null {
  const k = raw as Record<string, unknown> | null;
  if (typeof k !== 'object' || k === null || typeof k.id !== 'string' || typeof k.body !== 'string') return null;
  if (k.composed !== null && typeof k.composed !== 'string') return null;
  return { id: k.id, body: k.body, composed: k.composed };
}

export function createStartIdentity(mint: () => string = () => crypto.randomUUID(), source?: StorageSource): StartIdentity {
  const slot = sessionSlot('byway.start-id', decodeKept, source);
  // `recipe` is the composed recipe's object while this page holds it; a Start kept from an earlier page has none.
  let held: (KeptStart & { recipe?: object | null }) | null = null;
  return {
    async send(inputs, post) {
      const body = JSON.stringify(inputs.body);
      const composed = inputs.composed === null ? null : JSON.stringify(inputs.composed);
      held ??= slot.load();
      const same = held !== null && held.body === body && (held.recipe !== undefined ? held.recipe === inputs.composed : held.composed === composed);
      const sent = same && held !== null ? { ...held, recipe: inputs.composed } : { id: mint(), body, composed, recipe: inputs.composed };
      held = sent;
      slot.save({ id: sent.id, body: sent.body, composed: sent.composed });
      try {
        const answer = await post(sent.id);
        if (held === sent) slot.clear();
        return answer;
      } catch (err) {
        if (refused(err) && held === sent) {
          held = null;
          slot.clear();
        }
        throw err;
      }
    },
  };
}
