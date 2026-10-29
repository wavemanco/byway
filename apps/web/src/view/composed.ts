/**
 * A composed recipe's refusals and notices. Its "How it differs" lines are shown as the advisor writes them: in plain
 * words, with no node ids or medium codes (@byway/advisor diff.ts, UX-13), so the screen rewrites nothing in them.
 */

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
