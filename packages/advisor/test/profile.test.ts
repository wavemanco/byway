import { c3, c4, c6, c6a, PROTOCOL_CONFIGS } from '@byway/catalog';
import { steps, withHash, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { describe, expect, it } from 'vitest';
import { alwaysRunSteps, catalogPrompts, checkAnswer, checkComposedProfile } from '../src/index.ts';
import { fencedJson, recordingPrompts } from './helpers.ts';

const prompts = recordingPrompts().renderer;
const ctx = (nearest: Recipe) => ({ nearest, catalog: PROTOCOL_CONFIGS, prompts });

describe('the composed profile on the canonical recipes themselves', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s, recomposed as itself, passes the profile and validates', (_id, recipe) => {
    const candidate = checkAnswer(fencedJson(recipe), recipe, { prompts, catalog: PROTOCOL_CONFIGS }, `composed-${recipe.id}`);
    expect(candidate.violations).toEqual([]);
    expect(candidate.recipe).toMatchObject({ kind: 'composed', channel: 'workspace', family: recipe.family });
    expect(validate(candidate.recipe!).ok).toBe(true);
  });

  it('every model step of the catalog names a prompt the catalog uses for its role', () => {
    const roles = catalogPrompts(PROTOCOL_CONFIGS);
    for (const r of PROTOCOL_CONFIGS) for (const { step } of steps(r)) if (step.actor === 'model') expect(roles.get(step.prompt!)?.has(step.role)).toBe(true);
  });
});

describe('protected checkpoints', () => {
  const ids = (r: Recipe) => alwaysRunSteps(r).map((s) => s.id);

  it('counts only steps every run passes through', () => {
    expect(ids(c4)).toContain('voice');
    expect(ids(c4)).not.toContain('claim-sign-off');
    expect(ids(c4)).not.toContain('recipient');
    expect(ids(c3)).not.toContain('own-draft');
    expect(ids(c6)).toContain('write');
  });

  it('protects authorship where every run has you write (C6, C6a), not where it is one branch of a choice (C3)', () => {
    const aiDrafted = (from: Recipe): Recipe => withHash({ ...c4, id: 'composed-x', kind: 'composed', channel: 'workspace', family: from.family, exceptions: [] });
    const rules = (nearest: Recipe) => checkComposedProfile(aiDrafted(nearest), ctx(nearest)).map((v) => v.ruleId);
    expect(rules(c6)).toContain('COMPOSED-AUTHOR');
    expect(rules(c6a)).toContain('COMPOSED-AUTHOR');
    expect(rules(c3)).not.toContain('COMPOSED-AUTHOR');
  });

  it('protects VOICE for every configuration that has one', () => {
    for (const nearest of PROTOCOL_CONFIGS) {
      const voiceless = withHash({
        ...nearest,
        id: 'composed-y',
        kind: 'composed',
        channel: 'workspace',
        stages: nearest.stages.map((s) => (s.body.op === 'step' && s.body.role === 'voice' ? { ...s, body: { ...s.body, actor: 'model' as const } } : s.body.op === 'seq' ? { ...s, body: { ...s.body, steps: s.body.steps.map((n) => (n.op === 'step' && n.role === 'voice' ? { ...n, actor: 'model' as const } : n)) } } : s)),
      });
      expect(checkComposedProfile(voiceless, ctx(nearest)).map((v) => v.ruleId)).toContain('COMPOSED-VOICE');
    }
  });
});
