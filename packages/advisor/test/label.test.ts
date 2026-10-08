import { readFileSync } from 'node:fs';
import { c1, c4, c6a, PROTOCOL_CONFIGS } from '@byway/catalog';
import { withHash, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { labelFor, STUDY_REGISTRY, type StudyEntry } from '../src/index.ts';
import { demoAdvisor } from './helpers.ts';

const composed = (from: Recipe): Recipe => withHash({ ...from, id: 'composed-1', kind: 'composed', channel: 'workspace' });

describe('evidence labels (CR11): computed from the study registry, never typed', () => {
  it('the v1 registry is empty', () => {
    // A tripwire: the registry machinery is not finished. Before the first entry, see docs/backlog.md ("Before the study
    // registry's first entry"): expiry, the CR11 scope tuple, and labels keyed on the ADR-0041 snapshot.
    expect(STUDY_REGISTRY, "see docs/backlog.md, 'Before the study registry's first entry'").toEqual([]);
  });

  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s reads Untested with no scope and no studies', (_id, recipe) => {
    expect(labelFor(recipe)).toEqual({ verdict: 'Untested', scope: 'None', summary: 'Not yet tested.', studies: [] });
  });

  it('the Untested summary asserts nothing the registry does not hold: no planned studies (ENG-13, LABEL-1)', () => {
    // No registry entry names a planned study of any product recipe's hash, so the label may not say one is planned.
    for (const recipe of PROTOCOL_CONFIGS) expect(labelFor(recipe).summary).not.toMatch(/plan|study|studies|will be/i);
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

    it('carries an expiry without acting on it, and the contract promises nothing more (RS)', () => {
      // An entry past its date keeps its verdict: labelFor only passes the date through. Enforcing expiry, with an
      // outcome the verdict union can represent, waits for the registry's first entry (docs/backlog.md).
      expect(labelFor(c4, [{ ...entry, expires: '2020-01-01' }])).toMatchObject({ verdict: 'Inconclusive', expires: '2020-01-01' });
      const contract = readFileSync(new URL('../../contracts/src/advisor.ts', import.meta.url), 'utf8');
      expect(contract).not.toMatch(/degrades? to "Historical"/);
    });
  });
});
