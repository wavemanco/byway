import { describe, expect, it } from 'vitest';
import { BLOCK_CODES } from '@byway/protocol';
import type { ChooserAnswer, EvidenceLabel, ModelProfile, RunStatus } from '@byway/contracts';
import { BLOCK_NAMES, RECIPE_NAMES, TERMS, codeForLabel, recipeTitle, stageFromCode, stepTitle, whoLabel } from '../src/view/vocabulary.ts';
import { PRESENTATIONS } from '../src/services/demo/catalog.ts';
import {
  answerNote,
  decidingQuestion,
  evidenceHeadline,
  fitText,
  profileNeeds,
  runStatusLabel,
  showAnswerNote,
  videoAvailability,
} from '../src/view/labels.ts';

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

  it('finds the protocol code behind a plain step label', () => {
    expect(codeForLabel('Random spark')).toBe('SEED');
    expect(codeForLabel('Your words')).toBe('VOICE');
    expect(codeForLabel('Your pick')).toBe('pick(H)');
    expect(codeForLabel('Keep or revert')).toBe('TELLS');
    expect(codeForLabel('Something new')).toBeUndefined();
  });

  it('has a protocol code for every step label the recipe presentations use', () => {
    const labels = PRESENTATIONS.flatMap((p) => p.stages.flatMap((s) => s.steps.map((step) => step.label)));
    expect(labels.filter((label) => codeForLabel(label) === undefined)).toEqual([]);
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
    const statuses: RunStatus[] = ['queued', 'running', 'waiting', 'paused', 'done', 'failed', 'cancelled'];
    expect(statuses.map(runStatusLabel)).toEqual(['Queued', 'Working', 'Your turn', 'Paused', 'Done', 'Failed', 'Cancelled']);
  });

  it('says whether a profile can make video clips, and what it still needs', () => {
    const profile = (video?: ModelProfile['video']): ModelProfile => ({
      id: 'p',
      label: 'P',
      tiers: { big: { provider: 'anthropic', model: 'a' }, mid: { provider: 'anthropic', model: 'b' } },
      ...(video ? { video } : {}),
    });
    expect(videoAvailability({ video: true, profile: profile({ provider: 'fal', model: 'v' }) })).toBe('Video clips: available');
    expect(videoAvailability({ video: false, profile: profile({ provider: 'fal', model: 'v' }) })).toBe('Video clips need a fal.ai key');
    expect(videoAvailability({ video: false, profile: profile() })).toBe('Video clips need a fal.ai key');
    expect(videoAvailability(undefined)).toBe('Video clips need a fal.ai key');
    expect(profileNeeds({ usable: true, missing: [] })).toBeNull();
    expect(profileNeeds({ usable: false, missing: ['anthropic'] })).toBe('Needs a key for Anthropic');
    expect(profileNeeds({ usable: false, missing: ['anthropic', 'google', 'openai'] })).toBe('Needs a key for Anthropic, Google and OpenAI');
  });

  it('describes recommendation fit', () => {
    expect([fitText('strong'), fitText('partial'), fitText('none')]).toEqual(['Strong fit', 'Partial fit', 'No clear fit']);
  });

  it('explains each chooser answer: who set it, and how sure the intake was', () => {
    const a = (over: Partial<ChooserAnswer>): ChooserAnswer => ({ questionId: 'q', answer: true, confidence: 0.9, rationale: 'You mention a landing page.', setBy: 'intake', ...over });
    expect(answerNote(a({}))).toBe('You mention a landing page. (AI read, sure)');
    expect(answerNote(a({ confidence: 0.75 }))).toBe('You mention a landing page. (AI read, fairly sure)');
    expect(answerNote(a({ confidence: 0.5 }))).toBe('You mention a landing page. (AI read, unsure)');
    expect(answerNote(a({ setBy: 'user', confidence: 1 }))).toBe('You set this.');
  });

  it('explains yes answers and your own, and keeps plain noes from the intake quiet', () => {
    const a = (over: Partial<ChooserAnswer>): ChooserAnswer => ({ questionId: 'q', answer: false, confidence: 0.6, rationale: 'Nothing points this way.', setBy: 'intake', ...over });
    expect(showAnswerNote(a({}))).toBe(false);
    expect(showAnswerNote(a({ answer: true }))).toBe(true);
    expect(showAnswerNote(a({ setBy: 'user' }))).toBe(true);
  });

  it('finds the question that decides: the first yes', () => {
    const answers: ChooserAnswer[] = ['a', 'b', 'c'].map((id, i) => ({ questionId: id, answer: i > 0, confidence: 1, rationale: '', setBy: 'user' }));
    expect(decidingQuestion(answers)).toBe('b');
    expect(decidingQuestion(answers.map((x) => ({ ...x, answer: false })))).toBeUndefined();
  });
});
