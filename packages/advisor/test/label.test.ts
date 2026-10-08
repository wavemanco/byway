import { c1, c4, c6a, PROTOCOL_CONFIGS } from '@byway/catalog';
import { withHash, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { labelFor, STUDY_REGISTRY, type StudyEntry } from '../src/index.ts';
import { demoAdvisor } from './helpers.ts';

const composed = (from: Recipe): Recipe => withHash({ ...from, id: 'composed-1', kind: 'composed', channel: 'workspace' });

describe('evidence labels (CR11): computed from the study registry, never typed', () => {
  it('the v1 registry is empty', () => {
    expect(STUDY_REGISTRY).toEqual([]);
  });

  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s reads Untested with no scope and no studies', (_id, recipe) => {
    expect(labelFor(recipe)).toEqual({ verdict: 'Untested', scope: 'None', summary: 'Not yet tested. Studies of this recipe are planned.', studies: [] });
  });

  it('a composed recipe reads "Composed for you — not tested."', () => {
    expect(labelFor(composed(c4))).toEqual({ verdict: 'Untested', scope: 'Composed', summary: 'Composed for you — not tested.', studies: [] });
  });

  it('the advisor computes the same labels', () => {
    const { advisor } = demoAdvisor();
    expect(advisor.label(c1)).toEqual(labelFor(c1));
    expect(advisor.label(composed(c6a)).scope).toBe('Composed');
  });

  describe('with a registry entry (none exist in v1)', () => {
    const entry: StudyEntry = {
      id: 'study-x',
      recipeHash: c4.hash as string,
      reported: '2027-03-01',
      verdict: 'Inconclusive',
      summary: 'Tested once; the result was inconclusive.',
    };

    it('labels the exact recipe it studied, with the study id', () => {
      expect(labelFor(c4, [entry])).toEqual({ verdict: 'Inconclusive', scope: 'Exact', summary: entry.summary, studies: ['study-x'] });
    });

    it('never lends a verdict to another recipe, an edited copy or a composed recipe', () => {
      expect(labelFor(c1, [entry]).verdict).toBe('Untested');
      expect(labelFor(withHash({ ...c4, title: 'C4 edited' }), [entry]).verdict).toBe('Untested');
      expect(labelFor(composed(c4), [{ ...entry, recipeHash: composed(c4).hash as string }]).scope).toBe('Composed');
    });

    it('uses the latest report when several match, and carries its expiry', () => {
      const later = { ...entry, id: 'study-y', reported: '2027-09-01', verdict: 'Supported' as const, summary: 'Later.', expires: '2029-01-01' };
      expect(labelFor(c4, [later, entry])).toEqual({ verdict: 'Supported', scope: 'Exact', summary: 'Later.', studies: ['study-y', 'study-x'], expires: '2029-01-01' });
    });
  });
});
