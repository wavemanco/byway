/**
 * The unsent problem on Start, kept in this browser's session so "Change" on the Recommendation screen goes
 * back to what you wrote. A convenience only: storage may be unavailable, and every access is guarded.
 *
 * Attachments are kept the same way, under their own key (ADR-0082, R1): before, "Change" brought the text back but
 * silently dropped the drafts you had pasted. The text keeps its original plain-string key, so nothing kept by an
 * earlier byway needs migrating.
 */
import type { HeldKeyPart } from '../view/refusals.ts';
import { sessionSlot } from './sessionSlot.ts';

const KEY = 'byway.start-draft';
/** The limits Start's request accepts (server/schemas.ts ProblemInput). */
const MAX_ATTACHMENTS = 5;
const MAX_NAME = 200;
const MAX_TEXT = 200_000;

export interface KeptAttachment {
  name: string;
  text: string;
}

export function decodeAttachments(raw: unknown): KeptAttachment[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) return null;
  const out: KeptAttachment[] = [];
  for (const item of raw as unknown[]) {
    const a = item as Record<string, unknown> | null;
    if (typeof a !== 'object' || a === null || typeof a.name !== 'string' || typeof a.text !== 'string') return null;
    if (a.name.length > MAX_NAME || a.text.length > MAX_TEXT) return null;
    out.push({ name: a.name, text: a.text });
  }
  return out;
}

const attachmentsSlot = () => sessionSlot('byway.start-attachments', decodeAttachments);

export function saveStartDraft(text: string): void {
  try {
    if (text.trim()) sessionStorage.setItem(KEY, text);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing to keep.
  }
}

export function loadStartDraft(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveStartAttachments(list: KeptAttachment[]): void {
  if (list.some((a) => a.name.trim() || a.text.trim())) attachmentsSlot().save(list);
  else attachmentsSlot().clear();
}

export function loadStartAttachments(): KeptAttachment[] {
  return attachmentsSlot().load() ?? [];
}

function forgetText(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** After a run starts: the problem and its attachments went with it. */
export function clearStartDraft(): void {
  forgetText();
  attachmentsSlot().clear();
}

/**
 * After Start was refused for holding a provider key (ADR-0088): the tab's session must not keep a key byway refused,
 * though the form still shows it to be edited. Only the part that held it stops being kept (`fields`, from the
 * refusal: `text`, `attachments` or both); the rest is unsent work and stays kept (spec §5, ADR-0082 R1). The text is
 * kept again once it is edited; an attachment that held the key, once byway's check finds no key in it
 * (withheldAfterCheck). A refusal that does not say where drops both. The attachments are dropped here as a list, at
 * once; Start then keeps again those that held no key (heldAttachmentKeys).
 */
export function forgetRefusedStart(fields: readonly string[] | undefined): void {
  const unknown = fields === undefined || fields.length === 0;
  if (unknown || fields.includes('text')) forgetText();
  if (unknown || fields.includes('attachments')) attachmentsSlot().clear();
}

/**
 * Which of Start's attachments stop being kept in the tab after a held-key refusal, by their keys on the form: the ones
 * the refusal names (`parts`' items, by position in the request), each kept again once byway's check finds no key in it
 * (withheldAfterCheck). `sentKeys` are the form keys of the attachments sent, in the request's order; an empty
 * attachment is not sent, so position i in the request is not always position i on the form. None when the key was not
 * in an attachment. Every one sent when the refusal does not say which, or names a position that was not sent: then
 * none of them is known to be clean.
 */
export function heldAttachmentKeys(fields: readonly string[] | undefined, parts: readonly HeldKeyPart[] | undefined, sentKeys: readonly number[]): number[] {
  const unknown = fields === undefined || fields.length === 0;
  if (!unknown && !fields.includes('attachments')) return [];
  const items = parts?.find((p) => p.field === 'attachments')?.items;
  if (unknown || !items || items.length === 0 || items.some((i) => sentKeys[i.index] === undefined)) return [...sentKeys];
  return items.map((i) => sentKeys[i.index] as number);
}

/** One of Start's attachments, by its key on the form. */
export interface FormAttachment {
  key: number;
  name: string;
  text: string;
}

/**
 * Which of Start's attachments the tab does not keep after byway checked a Start request for its provider keys (ADR-0088):
 * those the refusal named (`named`, from heldAttachmentKeys; none when the request was accepted), and those not kept
 * before (`before`) that the request did not carry as they are on the form now (`now`): not sent, as an empty one is
 * not, or changed since it was sent. So an attachment that held a refused key is kept again only once byway's own check
 * finds no key in it as it is. Editing it is not enough: a new name, or a word added to its text, can leave the key in it.
 * An attachment no longer on the form is left out.
 */
export function withheldAfterCheck(before: ReadonlySet<number>, sent: readonly FormAttachment[], named: readonly number[], now: readonly FormAttachment[]): Set<number> {
  const checked = new Map(sent.map((a) => [a.key, a]));
  const onForm = new Map(now.map((a) => [a.key, a]));
  const next = new Set(named.filter((key) => onForm.has(key)));
  for (const key of before) {
    const is = onForm.get(key);
    const was = checked.get(key);
    if (is && (!was || was.name !== is.name || was.text !== is.text)) next.add(key);
  }
  return next;
}
