import { describe, expect, it } from 'vitest';
import { BLOCK_CODES } from '@byway/protocol';
import type { EvidenceLabel, RunStatus } from '@byway/contracts';
import { BLOCK_NAMES, RECIPE_NAMES, TERMS, recipeTitle, stageFromCode, stepTitle, whoLabel } from '../src/view/vocabulary.ts';
import { evidenceHeadline, fitText, runStatusLabel } from '../src/view/labels.ts';

describe('plain vocabulary (spec §5)', () => {
  it('names every block in plain words', () => {
    for (const code of BLOCK_CODES) expect(BLOCK_NAMES[code].length).toBeGreaterThan(0);
    expect(BLOCK_NAMES.SEED).toBe('Random spark');
    expect(BLOCK_NAMES.VISION).toBe('Your direction');
    expect(BLOCK_NAMES.CRITIC).toBe('Outside critique');
    expect(BLOCK_NAMES.ASSET).toBe('Custom imagery');
    expect(BLOCK_NAMES.RELAY).toBe('Motion');
    expect(BLOCK_NAMES.CUT).toBe('Trim');
    expect(BLOCK_NAMES.TELLS).toBe('Cliché sweep');
    expect(BLOCK_NAMES.VOICE).toBe('Your words');
  });

  it('maps chassis stages to Explore, Refine and Finish', () => {
    expect([stageFromCode('D1'), stageFromCode('D2'), stageFromCode('D3')]).toEqual(['Explore', 'Refine', 'Finish']);
    expect(stageFromCode('Refine')).toBe('Refine');
    expect(stageFromCode('nonsense')).toBeUndefined();
  });

  it('names the eight recipes', () => {
    expect(RECIPE_NAMES).toEqual({
      c1: 'Landing Page Studio',
      c2: 'Idea Generator',
      c3: 'Series Writer',
      c4: 'Memo Polish',
      c5: 'Ad Video Chain',
      c6: 'Second Reader',
      c6a: 'Fiction Second Reader',
      c7: 'Lean Code Review',
    });
  });

  it('shows technical names only when the setting is on', () => {
    expect(stepTitle('Random spark', 'SEED', false)).toBe('Random spark');
    expect(stepTitle('Random spark', 'SEED', true)).toBe('Random spark (SEED)');
    expect(stepTitle('Draft', undefined, true)).toBe('Draft');
    expect(recipeTitle({ name: 'Memo Polish', code: 'C4' }, false)).toBe('Memo Polish');
    expect(recipeTitle({ name: 'Memo Polish', code: 'C4' }, true)).toBe('C4 Memo Polish');
    expect(TERMS.checkpoint).toEqual({ plain: 'Your turn', code: '?H' });
    expect(TERMS.optionSet.plain).toBe('Drafts');
    expect(TERMS.threshold.plain).toBe('Quality bar');
  });

  it('says who does a step', () => {
    expect([whoLabel('you'), whoLabel('ai'), whoLabel('tool')]).toEqual(['You', 'AI', 'Tool']);
  });
});

describe('labels', () => {
  const label = (verdict: EvidenceLabel['verdict'], scope: EvidenceLabel['scope']): EvidenceLabel => ({
    verdict,
    scope,
    summary: '',
    studies: [],
  });

  it('reads honestly for untested and composed recipes (CR11)', () => {
    expect(evidenceHeadline(label('Untested', 'None'))).toBe('Untested — not yet studied');
    expect(evidenceHeadline(label('Untested', 'Exact'))).toBe('Untested — not yet studied');
    expect(evidenceHeadline(label('Untested', 'Composed'))).toBe('Composed — not tested');
  });

  it('passes a studied verdict through with its scope', () => {
    expect(evidenceHeadline(label('Inconclusive', 'Exact'))).toBe('Inconclusive (this exact recipe)');
    expect(evidenceHeadline(label('No meaningful effect', 'Derived-from-studied'))).toBe(
      'No meaningful effect (derived from a studied recipe)',
    );
  });

  it('names every run status in plain words', () => {
    const statuses: RunStatus[] = ['queued', 'running', 'waiting', 'done', 'failed', 'cancelled'];
    expect(statuses.map(runStatusLabel)).toEqual(['Queued', 'Working', 'Your turn', 'Done', 'Failed', 'Cancelled']);
  });

  it('describes recommendation fit', () => {
    expect([fitText('strong'), fitText('partial'), fitText('none')]).toEqual(['Strong fit', 'Partial fit', 'No clear fit']);
  });
});
