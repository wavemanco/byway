/**
 * Codes the server puts beside a refusal's message (`{ error, code }`), for the few refusals a screen acts on rather than
 * only shows. Shared by the route helpers and the client.
 */

/**
 * The request held one of byway's provider keys and was refused before anything was stored or sent (ADR-0088). The
 * refusal also names the body's top-level fields that held it (`fields`). Start then stops keeping those parts in the
 * tab's session, and keeps the rest: the form keeps everything so the person can take the key out, but the tab's
 * storage does not hold a key byway refused. The Recommendation screen does the same for the one example refused
 * (/api/refs) and the Run screen for the one answer refused (a checkpoint route); each request carries one example or
 * one question's answer, so that is the part that held the key.
 */
export const HELD_KEY_REFUSAL = 'held-key';

/**
 * A composed recipe was checked again at start and no longer passes, or no longer hashes to the recipe that was offered
 * (ADR-0092). The intake now says so, and the refusal carries the screen's view of the result (`composed`), which the
 * screen shows: Start stays blocked, with what failed, until a new one is built.
 */
export const COMPOSED_REFUSED = 'composed-refused';

/**
 * A composed recipe still passes at start, but what byway says it does changed (its differences from the nearest
 * recipe, or its steps), so it did not start (ADR-0092). The refusal carries the new explanation (`composed`, the
 * screen's view of it); the screen shows it, and the person starts again once they have read it.
 */
export const COMPOSED_CHANGED = 'composed-changed';
