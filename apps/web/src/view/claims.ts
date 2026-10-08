/**
 * The claims rule (spec §4, CR11): no product string may claim efficacy. Until a study reports, every
 * recipe is untested, and even then labels are computed, never typed. A guard test (test/guard-claims.test.ts) scans
 * the app, the recipe presentations, the prompt templates and the READMEs with this list, and the copy that describes
 * recipes and steps (presentations, chooser help, composed explainers, label summaries) with the outcome patterns below.
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

/**
 * Outcome claims (CRED-1): copy that says what a step achieves instead of what it does. The phrase list above names
 * efficacy words; recipe copy breached CR11 without any of them, by stating the protocol's own untested success
 * criteria as fact ("Four distinct page designs", "so they do not settle on the same safe design", "a wide field of
 * genuinely different options", "This makes the change smaller and easier to read"). These patterns catch the shapes
 * those sentences take.
 *
 * They apply to copy that describes recipes and steps (presentations, chooser help, the advisor's composed explainers
 * and evidence label summaries), where every sentence is meant to say what a step does. They do not apply to source
 * files, whose comments and messages rightly explain mechanics with "so …" ("so it cannot run").
 */
export const OUTCOME_CLAIMS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'a result clause ("so they…", "so the field…", "so you…")', pattern: /\bso(?: that)? (?:they|it|the|you|your)\b/i },
  { name: 'genuinely', pattern: /\bgenuinely\b/i },
  { name: 'distinct', pattern: /\bdistinct\b/i },
  { name: 'makes it smaller, easier or better', pattern: /\bmakes? (?:\w+ ){0,4}(?:smaller|easier|better|clearer|stronger|shorter|sharper)\b/i },
  { name: 'easier to review or read', pattern: /\b(?:smaller|easier|clearer|better)\b[^.]*\bto (?:review|read|act on)\b/i },
  { name: 'nothing the reader would miss', pattern: /\bnothing (?:the|a) reader would miss\b/i },
  { name: 'in minutes', pattern: /\bin minutes\b/i },
  { name: 'stays wide', pattern: /\bstays? wide\b/i },
  { name: 'does not settle', pattern: /\bdo(?:es)? not settle\b/i },
  { name: 'unexpected', pattern: /\bunexpected\b/i },
  { name: 'cleanly', pattern: /\bcleanly\b/i },
  { name: 'ensures', pattern: /\bensures?\b/i },
  { name: 'stands out', pattern: /\bstands? out\b/i },
  { name: 'better results', pattern: /\b(?:better|best|higher[- ]quality) (?:results?|outcomes?)\b/i },
];

/** The outcome claims that appear in `text`, by name, in list order. */
export function findOutcomeClaims(text: string): string[] {
  return OUTCOME_CLAIMS.filter((c) => c.pattern.test(text)).map((c) => c.name);
}
