import type { ChooserAnswer } from '@byway/contracts';
import { CHOOSER, CHOOSER_FALLBACK } from '@byway/catalog';
import { describe, expect, it } from 'vitest';
import { mergeAnswers, needsIntake, route, STRONG_FIT } from '../src/index.ts';

const no = (questionId: string, setBy: ChooserAnswer['setBy'] = 'intake'): ChooserAnswer => ({ questionId, answer: false, confidence: 0.8, rationale: 'No.', setBy });
const yes = (questionId: string, confidence = 0.9, setBy: ChooserAnswer['setBy'] = 'intake'): ChooserAnswer => ({ questionId, answer: true, confidence, rationale: 'Yes.', setBy });
const allNo = () => CHOOSER.map((q) => no(q.id));
const withAnswer = (a: ChooserAnswer) => allNo().map((x) => (x.questionId === a.questionId ? a : x));

describe('route: the first yes decides (03 "Choosing a configuration")', () => {
  it.each(CHOOSER.map((q) => [q.id, q.routesTo]))('a lone yes to %s routes to %s', (id, target) => {
    expect(route(CHOOSER, withAnswer(yes(id)), CHOOSER_FALLBACK).recipeId).toBe(target);
  });

  it('takes the earliest yes in chooser order, not answer order', () => {
    const answers = allNo().map((a) => (a.questionId === 'visual' || a.questionId === 'decision' ? { ...a, answer: true } : a)).reverse();
    expect(route(CHOOSER, answers, CHOOSER_FALLBACK).recipeId).toBe('c2');
  });

  it(`is a strong fit at confidence >= ${STRONG_FIT} and partial below`, () => {
    expect(route(CHOOSER, withAnswer(yes('fiction', 0.7)), CHOOSER_FALLBACK).fit).toBe('strong');
    expect(route(CHOOSER, withAnswer(yes('fiction', 0.69)), CHOOSER_FALLBACK).fit).toBe('partial');
  });

  it('falls back to C4 as a partial fit when nothing is answered yes', () => {
    const r = route(CHOOSER, allNo(), CHOOSER_FALLBACK);
    expect(r).toMatchObject({ recipeId: 'c4', fit: 'partial', fallback: true, alternatives: [] });
    expect(r.deciding).toBeUndefined();
  });

  it('offers up to two alternatives from later yes answers, skipping the recommended recipe', () => {
    const answers = allNo().map((a) => (['decision', 'media', 'visual', 'series'].includes(a.questionId) ? { ...a, answer: true } : a));
    const r = route(CHOOSER, answers, CHOOSER_FALLBACK);
    expect(r.recipeId).toBe('c2');
    expect(r.alternatives.map((a) => a.question.routesTo)).toEqual(['c5', 'c1']);
  });

  it('ignores answers to questions it does not know', () => {
    expect(route(CHOOSER, [...allNo(), yes('not-a-question')], CHOOSER_FALLBACK).recipeId).toBe('c4');
  });
});

describe('mergeAnswers: user answers win', () => {
  it('keeps the intake answer unless the user set one, and gives user answers confidence 1', () => {
    const merged = mergeAnswers(CHOOSER, allNo(), [{ ...yes('fiction', 0.2, 'user') }]);
    expect(merged.find((a) => a.questionId === 'fiction')).toEqual({ questionId: 'fiction', answer: true, confidence: 1, rationale: 'Yes.', setBy: 'user' });
    expect(merged.filter((a) => a.setBy === 'intake')).toHaveLength(CHOOSER.length - 1);
  });

  it('lets a fresh intake replace earlier intake answers the caller passed back', () => {
    const stale = [yes('fiction', 0.9, 'intake')];
    const merged = mergeAnswers(CHOOSER, allNo(), stale);
    expect(merged.find((a) => a.questionId === 'fiction')?.answer).toBe(false);
  });

  it('answers every question in chooser order, marking ones nobody answered as unanswered noes', () => {
    const merged = mergeAnswers(CHOOSER, [no('decision')], []);
    expect(merged.map((a) => a.questionId)).toEqual(CHOOSER.map((q) => q.id));
    expect(merged[1]).toMatchObject({ questionId: 'code-change', answer: false, confidence: 0, setBy: 'intake' });
  });

  it('uses the answers passed in when there is no intake', () => {
    const passed = CHOOSER.map((q) => (q.id === 'media' ? yes('media', 0.6) : no(q.id)));
    expect(mergeAnswers(CHOOSER, undefined, passed)).toEqual(passed);
  });

  it('asks the intake only when some question has no answer from the caller', () => {
    expect(needsIntake(CHOOSER, undefined)).toBe(true);
    expect(needsIntake(CHOOSER, [yes('fiction', 1, 'user')])).toBe(true);
    expect(needsIntake(CHOOSER, allNo())).toBe(false);
  });
});
