/**
 * Codes the server puts beside a refusal's message (`{ error, code }`), for the few refusals a screen acts on rather than
 * only shows. Shared by the route helpers and the client.
 */

/**
 * The request held one of byway's provider keys and was refused before anything was stored or sent (ADR-0088). Start
 * then stops keeping that text in the tab's session: the field keeps it so the person can take the key out, but the
 * tab's storage does not hold a key byway refused.
 */
export const HELD_KEY_REFUSAL = 'held-key';
