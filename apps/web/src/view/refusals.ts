/**
 * Codes the server puts beside a refusal's message (`{ error, code }`), for the few refusals a screen acts on rather than
 * only shows. Shared by the route helpers and the client.
 */

/**
 * The request held one of byway's provider keys and was refused before anything was stored or sent (ADR-0088). The
 * refusal also names the body's top-level fields that held it (`fields`) and the key's variable name (`key`, as the
 * message already says it; never its value). Start then stops keeping those parts in the tab's session, and keeps the
 * rest: the form keeps everything so the person can take the key out, but the tab's storage does not hold a key byway
 * refused. The Recommendation screen does the same for the one example refused (/api/refs) and the Run screen for the
 * one answer refused (a checkpoint route); each request carries one example or one question's answer, so that is the
 * part that held the key.
 */
export const HELD_KEY_REFUSAL = 'held-key';

/** A top-level field of a refused body, and the variable name of the key found in it. */
export interface HeldKeyPart {
  field: string;
  key: string;
}

/** The parts of a request a person can recognise, in the words the screens use for them (Start's text and attachments). */
const PART_WORDS: Record<string, string> = { text: 'this text', attachments: 'an attachment' };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What to do about a held key, and the promise byway keeps: the end of every held-key refusal. */
function advice(keys: number): string {
  return `Remove ${keys > 1 ? 'them' : 'it'} and try again — byway never stores or sends its keys.`;
}

/**
 * The refusal of a body holding a key, saying where it was: "This text contains your ANTHROPIC_API_KEY", "An attachment
 * contains …", both, or, for a part a person would not recognise (or none found), "This request contains …". `held` is
 * the key found in the body as a whole, for that last case.
 */
export function heldKeyRefusal(parts: readonly HeldKeyPart[], held: string): string {
  const worded = parts.length > 0 && parts.every((p) => PART_WORDS[p.field] !== undefined) ? parts : [];
  const keys = new Set(parts.map((p) => p.key)).size;
  if (worded.length === 0) return `This request contains your ${held}. ${advice(keys)}`;
  const words = (p: HeldKeyPart) => PART_WORDS[p.field] as string;
  const first = worded[0] as HeldKeyPart;
  const where =
    keys === 1
      ? `${worded.map(words).join(' and ')} ${worded.length > 1 ? 'contain' : 'contains'} your ${first.key}`
      : worded.map((p) => `${words(p)} contains your ${p.key}`).join(', and ');
  return `${capital(where)}. ${advice(keys)}`;
}

/**
 * The refusal of one of "Examples you admire", naming it as the screen numbers it ("Example 2"), since several can be on
 * screen and the server only saw "this text". Without the key's name (an older server), the server's message follows.
 */
export function exampleHeldKeyRefusal(number: number, key: string | undefined, serverMessage: string): string {
  return key === undefined ? `Example ${number}: ${serverMessage}` : `Example ${number} contains your ${key}. ${advice(1)}`;
}
