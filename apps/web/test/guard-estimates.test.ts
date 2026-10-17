/**
 * Guard (F04, ADR-0091): neither the app nor the README tells a person that an estimate is a bound. The gateway admits
 * a call against its planning estimate, and a call can settle above it (the true cost is recorded and later calls are
 * refused), so a budget is described by what byway checks before a call, and cost figures are called estimates.
 *
 * How far a call can pass its estimate (ADR-0102, which settles decision D1): byway asks no provider for a fallback
 * model, so a call is one attempt on the model asked for, and the retry after a decline is a call of its own, admitted
 * against the budgets. What is left is the estimate's own error: a prompt's tokens are counted without the provider's
 * tokenizer, and an image model's output per image is a planning figure. The output allowance is reserved whole. So the
 * copy says a call can cost more than its estimate. It no longer says "twice its estimate or more", which was the size of
 * a refusal Anthropic routed to another model, and it still does not call the overrun slight: nothing bounds it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, REPO } from './guards/scan.ts';

const WEB = path.join(REPO, 'apps', 'web');
const README = path.join(REPO, 'README.md');
const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');

/** Sentences that promise a budget can never be passed, that a cost estimate is a limit, or that an overrun is small. */
const BOUND_CLAIMS: { name: string; pattern: RegExp }[] = [
  { name: 'stops before it would spend more', pattern: /\bstops? and asks? before it would spend\b/i },
  { name: 'the most ... may spend', pattern: /\bthe most [^.]{0,40}\bmay spend\b/i },
  { name: 'never spends more', pattern: /\bnever (?:spends?|goes) (?:more|over)\b/i },
  { name: 'cannot exceed', pattern: /\bcan(?:not|'t|’t) (?:exceed|go over)\b/i },
  { name: 'only slightly over', pattern: /\bslightly (?:over|above|more)\b/i },
];

/**
 * Copy that sizes the overrun by a fallback model byway no longer asks for (ADR-0102 Decision 6): the old sentence's
 * "twice its estimate", a refusal "routed to another model" (or one Anthropic "routes" there), and "refusal fallback".
 */
const STALE = /twice its estimate|rout(?:e|es|ed|ing) to another model|refusal fallbacks?/i;

/** The words both budget sentences and the README use for how far spending can pass a budget. */
const OVERRUN = 'Estimates can be low, so a call can cost more than its estimate, and';

describe('estimates are not bounds (F04)', () => {
  it('no screen, and not the README, promises that a budget cannot be passed', () => {
    const files = [...filesUnder(path.join(WEB, 'src'), /\.tsx?$/), ...filesUnder(path.join(WEB, 'app'), /\.tsx?$/), README];
    const hits = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return BOUND_CLAIMS.filter((c) => c.pattern.test(text)).map((c) => `${rel(file)}: ${c.name}`);
    });
    expect(hits).toEqual([]);
  });

  it('the Recommendation screen labels its cost range an estimate, and both budget sentences say what is checked and how far spending can pass it', () => {
    const recommendation = readFileSync(path.join(WEB, 'src', 'components', 'RecommendationView.tsx'), 'utf8');
    const settings = readFileSync(path.join(WEB, 'src', 'components', 'SettingsView.tsx'), 'utf8');
    expect(recommendation).toContain('<dt>Estimated cost</dt>');
    expect(recommendation).toMatch(/asks before starting a call whose estimated cost would take it over this budget/);
    expect(recommendation).toContain(`${OVERRUN} a run can end over this budget.`);
    expect(settings).toMatch(/does not start a call whose estimated cost would take your spending past this amount/);
    expect(settings).toContain(`${OVERRUN} spending can end over this amount.`);
  });

  it('the README describes the budgets the way the screens do', () => {
    const readme = readFileSync(README, 'utf8');
    expect(readme).toMatch(/A run asks before starting a call whose estimated cost would take it over its budget/);
    expect(readme).toContain(`${OVERRUN} spending can end over a budget.`);
  });

  it('no screen, and not the README, still sizes the overrun by a fallback model that byway no longer asks for (ADR-0102)', () => {
    const files = [...filesUnder(path.join(WEB, 'src'), /\.tsx?$/), ...filesUnder(path.join(WEB, 'app'), /\.tsx?$/), README];
    const stale = files.filter((file) => STALE.test(readFileSync(file, 'utf8'))).map(rel);
    expect(stale).toEqual([]);
  });

  it('the stale-copy guard keeps out every phrase ADR-0102 names', () => {
    for (const phrase of ['a single call can cost twice its estimate or more', 'a refused call routed to another model', 'a refusal Anthropic routes to another model', 'a refused call that Anthropic routed to another model', 'while refusal fallbacks stay on', 'the refusal fallback']) {
      expect(STALE.test(phrase), phrase).toBe(true);
    }
  });

  it('the README says what a decline does to a step and to an image step, for every outcome of the second ask (ADR-0102)', () => {
    const readme = readFileSync(README, 'utf8');
    // The call ends only for the reasons that end it: a second ask byway stopped before making is made by the step's next
    // attempt (ADR-0102 Decision 2), so "cannot be made" names its two final reasons.
    expect(readme).toContain('If it declines again, or that second call fails, or it cannot be made (a budget has no room for it, or paid calls are paused), the call ends there.');
    expect(readme).toContain(
      'A step then stops with a message that says what happened, what was billed (or may have been), and what to do: rephrase the request, or choose another model profile in Settings, and, when a budget had no room, start again with a larger budget or raise the workspace budget.',
    );
    expect(readme).toContain('An image step instead goes on without that image, and its note says what happened and what was billed (or may have been).');
    // A billed call byway could not keep, either one, stops the run, an image step's too (ADR-0090, ADR-0099).
    expect(readme).toContain(
      'One exception: when either call was billed and byway could not keep it (its image, its request and response, or its cost could not be stored or recorded), byway asks nothing more, the message says so instead of that advice, and the run stops, at an image step too, as it does for any billed call byway cannot keep.',
    );
    // The window ADR-0102 names: between a call being settled and its result being kept.
    expect(readme).toContain(
      'A step that runs again (after a restart, or after you raise its budget) does not buy the declined call again, unless byway was killed in the moment between a call being billed and its result being kept.',
    );
    expect(readme).not.toContain('the step stops with a message');
    expect(readme).not.toContain('fails or cannot be made, the call ends there');
  });
});
