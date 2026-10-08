/**
 * The unsent problem on Start, kept in this browser's session so "Change" on the Recommendation screen goes
 * back to what you wrote. A convenience only: storage may be unavailable, and every access is guarded.
 */
const KEY = 'byway.start-draft';

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

export function clearStartDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
