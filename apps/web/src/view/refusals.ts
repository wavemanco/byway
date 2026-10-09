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
