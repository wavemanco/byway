/**
 * The claims rule (spec §4, CR11): no product string may claim efficacy. Until a study reports, every
 * recipe is untested, and even then labels are computed, never typed. A guard test (test/guard-claims.test.ts) scans
 * the app, the recipe presentations, the prompt templates and the READMEs with this list.
 */

export const FORBIDDEN_CLAIMS = ['research-backed', 'proven', 'studies show', 'outperforms', 'scientifically', 'clinically', 'guaranteed results'] as const;

const PATTERNS: Record<(typeof FORBIDDEN_CLAIMS)[number], RegExp> = {
  'research-backed': /\bresearch[\s-]+backed\b/i,
  proven: /\bproven\b/i,
  'studies show': /\bstudies\s+show\b/i,
  outperforms: /\boutperforms?\b/i,
  scientifically: /\bscientifically\b/i,
  clinically: /\bclinically\b/i,
  'guaranteed results': /\bguaranteed\s+results?\b/i,
};

/** The forbidden phrases that appear in `text`, in list order. */
export function findClaims(text: string): string[] {
  return FORBIDDEN_CLAIMS.filter((phrase) => PATTERNS[phrase].test(text));
}
