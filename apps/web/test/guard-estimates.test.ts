/**
 * Guard (F04, ADR-0091): the app never tells a person that an estimate is a bound. The gateway admits a call against
 * its planning estimate, and a call can settle above it (the true cost is recorded and later calls are refused), so a
 * budget is described by what byway checks before a call, and cost figures are called estimates.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, REPO } from './guards/scan.ts';

const WEB = path.join(REPO, 'apps', 'web');
const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');

/** Sentences that promise a budget can never be passed, or that a cost estimate is a limit. */
const BOUND_CLAIMS: { name: string; pattern: RegExp }[] = [
  { name: 'stops before it would spend more', pattern: /\bstops? and asks? before it would spend\b/i },
  { name: 'the most ... may spend', pattern: /\bthe most [^.]{0,40}\bmay spend\b/i },
  { name: 'never spends more', pattern: /\bnever (?:spends?|goes) (?:more|over)\b/i },
  { name: 'cannot exceed', pattern: /\bcan(?:not|'t|’t) (?:exceed|go over)\b/i },
];

describe('estimates are not bounds (F04)', () => {
  it('no screen promises that a budget cannot be passed', () => {
    const files = [...filesUnder(path.join(WEB, 'src'), /\.tsx?$/), ...filesUnder(path.join(WEB, 'app'), /\.tsx?$/)];
    const hits = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return BOUND_CLAIMS.filter((c) => c.pattern.test(text)).map((c) => `${rel(file)}: ${c.name}`);
    });
    expect(hits).toEqual([]);
  });

  it('the Recommendation screen labels its cost range an estimate, and both budget sentences say what is checked', () => {
    const recommendation = readFileSync(path.join(WEB, 'src', 'components', 'RecommendationView.tsx'), 'utf8');
    const settings = readFileSync(path.join(WEB, 'src', 'components', 'SettingsView.tsx'), 'utf8');
    expect(recommendation).toContain('<dt>Estimated cost</dt>');
    expect(recommendation).toMatch(/asks before starting a call whose estimated cost would take it over this budget/);
    expect(settings).toMatch(/does not start a call whose estimated cost would take your spending past this amount/);
  });
});
