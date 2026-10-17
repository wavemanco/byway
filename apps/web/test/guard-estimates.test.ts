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
    const stale = files.filter((file) => /twice its estimate|routes? to another model|refusal fallbacks?/i.test(readFileSync(file, 'utf8'))).map(rel);
    expect(stale).toEqual([]);
  });
});
