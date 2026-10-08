/**
 * The claims rule (spec §4, CR11): no product string may claim efficacy. Until a study reports, every
 * recipe is untested, and even then labels are computed, never typed. A test scans apps/web with this list.
 */

export const FORBIDDEN_CLAIMS = ['research-backed', 'proven', 'studies show', 'outperforms'] as const;

const PATTERNS: Record<(typeof FORBIDDEN_CLAIMS)[number], RegExp> = {
  'research-backed': /\bresearch[\s-]+backed\b/i,
  proven: /\bproven\b/i,
  'studies show': /\bstudies\s+show\b/i,
  outperforms: /\boutperforms?\b/i,
};

/** The forbidden phrases that appear in `text`, in list order. */
export function findClaims(text: string): string[] {
  return FORBIDDEN_CLAIMS.filter((phrase) => PATTERNS[phrase].test(text));
}
