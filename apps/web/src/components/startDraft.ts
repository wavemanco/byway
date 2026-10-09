/**
 * The unsent problem on Start, kept in this browser's session so "Change" on the Recommendation screen goes
 * back to what you wrote. A convenience only: storage may be unavailable, and every access is guarded.
 *
 * Attachments are kept the same way, under their own key (ADR-0082, R1): before, "Change" brought the text back but
 * silently dropped the drafts you had pasted. The text keeps its original plain-string key, so nothing kept by an
 * earlier byway needs migrating.
 */
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

/** After a run starts: the problem and its attachments went with it. */
export function clearStartDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  attachmentsSlot().clear();
}
