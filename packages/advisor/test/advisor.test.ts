import * as catalog from '@byway/catalog';
import type { Advisor } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { createAdvisor } from '../src/index.ts';
import { demoAdvisor, demoGateway, recordingPrompts, WS } from './helpers.ts';

describe('the Advisor contract', () => {
  const { advisor } = demoAdvisor();

  it('is implemented by createAdvisor', () => {
    const typed: Advisor = advisor;
    expect(Object.keys(typed).sort()).toEqual(['admit', 'catalog', 'compose', 'estimate', 'label', 'questions', 'recipe', 'recommend']);
  });

  it('asks the chooser questions from the catalog, in order, as copies', () => {
    expect(advisor.questions()).toEqual(catalog.CHOOSER);
    advisor.questions()[0]!.text = 'changed';
    expect(advisor.questions()[0]!.text).toBe(catalog.CHOOSER[0]!.text);
  });

  it('lists the eight presentations', () => {
    expect(advisor.catalog().map((p) => p.recipeId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c6a', 'c7']);
  });

  it('returns the canonical protocol-channel recipe by id, and nothing for anything else', () => {
    for (const r of catalog.PROTOCOL_CONFIGS) expect(advisor.recipe(r.id)).toBe(r);
    expect(advisor.recipe('c1h')).toBeUndefined();
    expect(advisor.recipe('nope')).toBeUndefined();
  });

  it('accepts the catalog package itself, or a smaller catalog', async () => {
    const gateway = demoGateway();
    const whole = createAdvisor({ gateway, prompts: recordingPrompts().renderer, catalog });
    expect(whole.catalog()).toHaveLength(8);
    const small = createAdvisor({
      gateway,
      prompts: recordingPrompts().renderer,
      catalog: { ...catalog, CHOOSER: catalog.CHOOSER.filter((q) => q.id === 'fiction') },
    });
    expect(small.questions().map((q) => q.id)).toEqual(['fiction']);
    expect((await small.recommend({ text: 'A landing page for my bakery' }, WS)).recipeId).toBe('c4');
    expect((await small.recommend({ text: 'A short story about a lighthouse' }, WS)).recipeId).toBe('c6a');
  });
});
