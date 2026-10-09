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

/**
 * The line above a composed recipe's refusals. The protocol checks (checkAnswer) and the checks web start adds that are
 * not protocol checks (ADMIT-HASH: it no longer reads as the recipe offered; ADMIT-NEAREST: the recipe it was built from
 * is gone) all stop it running, but only the first are "the protocol checks" (ADR-0092).
 */
export function composedRefusalLead(violations: readonly { ruleId: string }[]): string {
  return onlyProtocolChecks(violations) ? 'It did not pass the protocol checks, so it cannot run:' : 'It cannot run:';
}

/** True when every refusal is a protocol check, none a check web start adds (ADMIT-*). */
export function onlyProtocolChecks(violations: readonly { ruleId: string }[]): boolean {
  return violations.every((v) => !v.ruleId.startsWith('ADMIT-'));
}
