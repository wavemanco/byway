import { c4, PROTOCOL_CONFIGS } from '@byway/catalog';
import { composedRecipe } from '@byway/gateway';
import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../src/index.ts';
import { demoAdvisor, fencedJson, recordingPrompts, WS } from './helpers.ts';

/**
 * F19 at the composer: a model can write a JSON \u escape for half a surrogate pair into its answer. parseRecipe now
 * refuses text that cannot be hashed, so such an answer is a SCHEMA violation the model can repair, wherever the bad
 * text sits, and never a CanonicalizationError thrown out of the composer.
 */

const prompts = recordingPrompts().renderer;
const check = (raw: unknown) => checkAnswer(fencedJson(raw), c4, { prompts, catalog: PROTOCOL_CONFIGS }, 'composed-probe');

/** c4 with knobs added to its first step that has knobs (the answer a model shown C4 might write). */
function c4WithKnobs(knobs: Record<string, unknown>): unknown {
  const raw = JSON.parse(JSON.stringify(c4)) as Record<string, unknown>;
  let done = false;
  const visit = (node: unknown): void => {
    if (done || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as Record<string, unknown>;
    if (n.op === 'step' && n.knobs) {
      n.knobs = { ...(n.knobs as object), ...knobs };
      done = true;
      return;
    }
    Object.values(n).forEach(visit);
  };
  visit(raw.stages);
  expect(done).toBe(true);
  return raw;
}

describe('compose: a lone surrogate in an answer (F19)', () => {
  it.each([
    ['the title', { ...c4, title: 'Reader-ready \ud800' }],
    ['a knob value', c4WithKnobs({ mode: 'OK\udc00' })],
    ['a knob name', c4WithKnobs({ '\ud800': 'x' })],
  ])('reports one in %s as a SCHEMA violation at the recipe, with no recipe and no throw', (_label, raw) => {
    expect(fencedJson(raw)).toMatch(/\\ud[89a-f][0-9a-f]{2}/);
    const candidate = check(raw);
    expect(candidate.recipe).toBeUndefined();
    expect(candidate.violations).toHaveLength(1);
    expect(candidate.violations[0]).toMatchObject({ ruleId: 'SCHEMA', path: '(recipe)' });
    expect(candidate.violations[0]!.message).toMatch(/^the recipe cannot be hashed: \$\./);
    expect(candidate.violations[0]!.message.isWellFormed()).toBe(true);
  });

  it('repairs such an answer once and offers the repaired recipe', async () => {
    const c4Prompts = { build: 'product.c4.draft', critic: 'product.c4.recipient', fix: 'product.c4.revise', 'cut-apply': 'product.c4.apply-cut', 'tells-sweep': 'product.c4.tells-sweep', 'tells-swap': 'product.c4.apply-swaps' };
    const good = composedRecipe({ id: 'model-picked-id', title: 'Memo with a recipient read', long: true, prompts: c4Prompts });
    const bad = { ...good, title: 'Memo \ud800' };
    const { advisor, gateway, prompts: rendered } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(bad), 'advisor.compose.repair': () => fencedJson(good) } });
    const result = await advisor.compose({ text: 'A status memo to leadership about the billing migration' }, WS);
    expect(result.ok).toBe(true);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.compose', 'advisor.compose.repair']);
    const repair = rendered.renders.find((r) => r.id === 'advisor.compose.repair')!;
    expect(repair.slots.violations).toMatch(/SCHEMA at \(recipe\): the recipe cannot be hashed: \$\.title/);
    expect(repair.slots.violations!.isWellFormed()).toBe(true);
    expect(repair.slots.artifact!.isWellFormed()).toBe(true);
    expect(await gateway.verifyLedger()).toBeNull();
  });
});
