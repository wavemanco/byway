/**
 * A composed recipe's "How it differs" lines in the app's vocabulary (UX-13; spec §5: plain names by default, codes
 * only with "Show technical names"). The advisor writes each line with the recipe's own node ids in parentheses and
 * media by their codes; with technical names off those ids are dropped and media are named in words.
 */
import type { Medium } from '@byway/contracts';

const MEDIUM_WORDS: Record<Medium, string> = {
  'web-page': 'a web page',
  prose: 'text',
  options: 'a set of options',
  media: 'a storyboard',
  'code-diff': 'a code change',
};

const ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** " (critic-loop)" or " (a-loop → b-loop)" right before a colon or the end of the line: a node id, not words. */
const ID_SUFFIX = new RegExp(`\\s\\(${ID}(?:\\s→\\s${ID})?\\)(?=:|\\.?$)`, 'g');
const MAKES = /^Makes (\S+) instead of (\S+?)\.$/;

const words = (code: string): string => (Object.hasOwn(MEDIUM_WORDS, code) ? MEDIUM_WORDS[code as Medium] : code);

export function diffLine(line: string, technical: boolean): string {
  if (technical) return line;
  const makes = MAKES.exec(line);
  if (makes) return `Makes ${words(makes[1] ?? '')} instead of ${words(makes[2] ?? '')}.`;
  return line.replace(ID_SUFFIX, '');
}

/** What kind of refusal a violation is, by its rule id. */
type RefusalKind = 'protocol' | 'unreadable' | 'unchecked' | 'changed' | 'gone';

const kindOf = (ruleId: string): RefusalKind => {
  if (ruleId === 'ADMIT-HASH') return 'changed';
  if (ruleId === 'ADMIT-NEAREST') return 'gone';
  if (ruleId === 'SCHEMA' || ruleId === 'FORMAT') return 'unreadable';
  if (ruleId === 'COMPOSED-INTERNAL') return 'unchecked';
  return 'protocol';
};

/** The line above each kind, in the order the screen lists them. */
const LEADS: readonly [RefusalKind, string][] = [
  ['protocol', 'It did not pass the protocol checks, so it cannot run:'],
  ['unreadable', 'byway could not read it as a recipe, so it cannot run:'],
  ['unchecked', 'byway could not check it, so it cannot run:'],
  ['changed', 'It is no longer the recipe byway offered you, so it cannot run:'],
  ['gone', "The recipe it was built from is no longer one of byway's, so it cannot be checked or run:"],
];

/**
 * A composed recipe's refusals, grouped by what each is, with the line above each group. The protocol checks (the
 * validator's rules and the composed profile's, ADR-0058 and ADR-0092) are named as such; an answer byway could not
 * read (SCHEMA, FORMAT) or could not check (COMPOSED-INTERNAL), and the checks web start adds (ADMIT-HASH: it no longer
 * reads as the recipe offered; ADMIT-NEAREST: the recipe it was built from is gone), are each worded by what they are,
 * never listed under the protocol checks.
 */
export function composedRefusalGroups<V extends { ruleId: string }>(violations: readonly V[]): { lead: string; items: V[] }[] {
  return LEADS.map(([kind, lead]) => ({ lead, items: violations.filter((v) => kindOf(v.ruleId) === kind) })).filter((g) => g.items.length > 0);
}

/** True when every refusal is a protocol check: none an unreadable or unchecked answer, none a check web start adds. */
export function onlyProtocolChecks(violations: readonly { ruleId: string }[]): boolean {
  return violations.every((v) => kindOf(v.ruleId) === 'protocol');
}

/** The notice after Build my own. */
export function composeNotice(composed: { ok: boolean; violations: readonly { ruleId: string }[] }): string {
  if (composed.ok) return 'Your recipe is ready. It is shown above.';
  return onlyProtocolChecks(composed.violations) ? 'byway built a recipe, but it did not pass the protocol checks. It is shown above.' : 'byway built a recipe, but it cannot run. It is shown above, with why.';
}
