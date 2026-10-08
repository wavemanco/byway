/**
 * The plain notes a step finishes with when it could not run as written, worded as ADR-0069 and ADR-0071 word
 * them, so a demo run says exactly what a real run would say about what was skipped or done differently.
 */

/** ADR-0069: a relay link without a usable video model. */
export const NO_VIDEO = 'No video provider key is configured.';
/** ADR-0069: the C5 `matte` step has no executor in v1. */
export const NO_COMPOSITING = 'Compositing is not available in byway yet.';
/** ADR-0069: the C5 `vo-audio` step has no executor in v1. */
export const NO_VO_AUDIO = 'No voice-over audio provider is configured.';

/** A GREAT-mode critic ranks against examples only from this many on (ADR-0071). */
export const GREAT_MIN_REFS = 3;

/** ADR-0071: what a GREAT-mode critic says when it had too few examples and scored against the quality bar. */
export function okModeNote(refs: number): string {
  if (refs <= 0) return 'No examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples.';
  const supplied = refs === 1 ? 'Only 1 example was supplied' : `Only ${refs} examples were supplied`;
  return `${supplied}, so the outside critique scored the work against a quality bar instead of ranking it against examples. Ranking needs at least ${GREAT_MIN_REFS}.`;
}
