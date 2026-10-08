/**
 * Where keyboard focus goes when the control that had it disappears (UX-2). A removed list item takes its Remove
 * button with it, and focus would fall back to the page; it goes to the item that took its place instead, or the one
 * before it, or (when the list is now empty) to the list's Add button.
 */

/** The key of the item whose Remove button should take focus after `removed` goes, or null for the Add button. */
export function focusAfterRemoval<K>(keys: readonly K[], removed: K): K | null {
  const at = keys.indexOf(removed);
  if (at < 0) return null;
  const rest = keys.filter((k) => k !== removed);
  return rest[Math.min(at, rest.length - 1)] ?? null;
}
