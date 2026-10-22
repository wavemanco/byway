/**
 * Codes the server puts beside a refusal's message (`{ error, code }`), for the few refusals a screen acts on rather than
 * only shows. Shared by the route helpers and the client.
 */
import { z } from 'zod';

/**
 * The request held one of byway's provider keys and was refused before anything was stored or sent (ADR-0088). The
 * refusal also names the body's top-level fields that held it (`fields`), the key's variable name (`key`, as the
 * message already says it; never its value) and, beside them, each part with its own key and, for a list, which of its
 * items held one, by position (`parts`, HeldKeyPart). Start then stops keeping those parts in the tab's session, its
 * attachments one by one, and keeps the rest: the form keeps everything so the person can take the key out, but the
 * tab's storage does not hold a key byway refused. The Recommendation screen does the same for the one example refused (/api/refs) and the Run screen for the
 * one answer refused (a checkpoint route); each request carries one example or one question's answer, so that is the
 * part that held the key.
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

/** A top-level field of a refused body, the variable name of the key found in it and, for a list, its items that held one. */
export interface HeldKeyPart {
  field: string;
  key: string;
  /** For a list (Start's attachments): the items that held a key. */
  items?: HeldKeyItem[];
}

/**
 * An item of a list that held a key: its position in the list as sent (from 0), its own fields that held one (for Start's
 * attachments, `name`, `text` or both) and the key's variable name. Positions and names, never values.
 */
export interface HeldKeyItem {
  index: number;
  fields: string[];
  key: string;
}

const HeldKeyParts = z.array(
  z.object({
    field: z.string(),
    key: z.string(),
    items: z.array(z.object({ index: z.number().int().min(0), fields: z.array(z.string()), key: z.string() })).optional(),
  }),
);

/** The parts a held-key refusal names (`parts`), or undefined when it sent none that can be read. */
export function heldKeyParts(body: Readonly<Record<string, unknown>> | undefined): HeldKeyPart[] | undefined {
  const parsed = HeldKeyParts.safeParse(body?.parts);
  return parsed.success ? parsed.data : undefined;
}

/** The parts of a request a person can recognise, in the words the screens use for them (Start's text and attachments). */
const PART_WORDS: Record<string, string> = { text: 'this text', attachments: 'an attachment' };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What to do about a held key, and the promise byway keeps: the end of every held-key refusal. */
function advice(keys: number): string {
  return `Remove ${keys > 1 ? 'them' : 'it'} and try again — byway never stores or sends its keys.`;
}

/** Where a key was, in the words a screen uses for that place, and the key's variable name. */
interface Place {
  words: string;
  key: string;
}

/** "a", "a and b", "a, b and c". */
const listed = (words: readonly string[]): string => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? ''));

/**
 * Where the keys were, and what to do: "This text contains your ANTHROPIC_API_KEY", "This text and an attachment contain
 * …" for one key in several places, or, for several keys, each place with its own ("…, and an attachment contains your
 * FAL_KEY"), then the advice.
 */
function heldIn(places: readonly Place[]): string {
  const keys = new Set(places.map((p) => p.key)).size;
  const first = places[0] as Place;
  const where =
    keys === 1
      ? `${listed(places.map((p) => p.words))} ${places.length > 1 ? 'contain' : 'contains'} your ${first.key}`
      : places.map((p) => `${p.words} contains your ${p.key}`).join(', and ');
  return `${capital(where)}. ${advice(keys)}`;
}

/**
 * The refusal of a body holding a key, saying where it was: "This text contains your ANTHROPIC_API_KEY", "An attachment
 * contains …", both, or, for a part a person would not recognise (or none found), "This request contains …". `held` is
 * the key found in the body as a whole, for that last case. The server does not know how a screen numbers a list's
 * items, so Start, which shows up to five attachments, words them itself (startHeldKeyRefusal).
 */
export function heldKeyRefusal(parts: readonly HeldKeyPart[], held: string): string {
  if (parts.length === 0 || !parts.every((p) => Object.hasOwn(PART_WORDS, p.field))) return `This request contains your ${held}. ${advice(new Set(parts.map((p) => p.key)).size)}`;
  return heldIn(parts.map((p) => ({ words: PART_WORDS[p.field] as string, key: p.key })));
}

/** One of Start's attachments as it was sent: where it stood among Start's attachments (from 1), and its name there. */
export interface SentAttachment {
  position: number;
  name: string;
}

/**
 * An attachment that held a key, as Start numbers it: 'attachment 2 ("Class notes")' when the key was in its text, by
 * the name the person gave it; 'the name of attachment 2' when it was in the name alone, which is then not repeated;
 * 'attachment 2' when it has no name, or the key was in both.
 */
function attachmentWords(sent: SentAttachment, item: HeldKeyItem): string {
  const inName = item.fields.includes('name');
  if (inName && !item.fields.includes('text')) return `the name of attachment ${sent.position}`;
  const name = sent.name.trim();
  return name && !inName && item.fields.includes('text') ? `attachment ${sent.position} ("${name}")` : `attachment ${sent.position}`;
}

/**
 * Start's refusal of a held key, naming each attachment that held one as Start numbers it ('Attachment 2 ("Class notes")
 * contains your ANTHROPIC_API_KEY …'), since up to five can be on screen and the server saw only "an attachment". `sent`
 * is Start's attachments as sent, in the request's order: an empty one is not sent, so an item's position in the request
 * is not always its place on the form. When the refusal does not say which item it was, or names a part Start does not
 * show, the server's message stands.
 */
export function startHeldKeyRefusal(parts: readonly HeldKeyPart[] | undefined, sent: readonly SentAttachment[], serverMessage: string): string {
  if (!parts || parts.length === 0) return serverMessage;
  const places: Place[] = [];
  for (const part of parts) {
    if (part.field === 'text') {
      places.push({ words: 'this text', key: part.key });
      continue;
    }
    if (part.field !== 'attachments' || !part.items || part.items.length === 0) return serverMessage;
    for (const item of part.items) {
      const attachment = sent[item.index];
      if (!attachment) return serverMessage;
      places.push({ words: attachmentWords(attachment, item), key: item.key });
    }
  }
  return heldIn(places);
}

/** A held-key refusal of Start as it came: where the keys were, Start's attachments as sent (by their keys on the form, with their names), and the server's message. */
export interface StartRefusal {
  parts: HeldKeyPart[] | undefined;
  sent: { key: number; name: string }[];
  message: string;
}

/**
 * Start's refusal in words as the form stands now (`formKeys`, its attachments' keys in order): each attachment it named
 * is numbered by its place on the form now, so removing one above it does not leave a stale number, and is left out
 * once it has been removed itself. Null when every place it named has been removed. The name quoted is the one sent.
 */
export function startRefusalNow(refusal: StartRefusal, formKeys: readonly number[]): string | null {
  const places = refusal.sent.map((s) => formKeys.indexOf(s.key) + 1);
  // An item whose attachment was sent and has been removed is left out. One at a position the request did not hold still
  // reaches startHeldKeyRefusal, which then says the server's message.
  const parts = refusal.parts?.flatMap((p) => {
    if (p.field !== 'attachments' || !p.items) return [p];
    const items = p.items.filter((i) => places[i.index] !== 0);
    return items.length > 0 ? [{ ...p, items }] : [];
  });
  if (refusal.parts && refusal.parts.length > 0 && parts?.length === 0) return null;
  return startHeldKeyRefusal(
    parts,
    refusal.sent.map((s, i) => ({ position: places[i] ?? 0, name: s.name })),
    refusal.message,
  );
}

/**
 * The refusal of one of "Examples you admire", naming it as the screen numbers it ("Example 2"), since several can be on
 * screen and the server only saw "this text". Without the key's name (an older server), the server's message follows.
 */
export function exampleHeldKeyRefusal(number: number, key: string | undefined, serverMessage: string): string {
  return key === undefined ? `Example ${number}: ${serverMessage}` : `Example ${number} contains your ${key}. ${advice(1)}`;
}
