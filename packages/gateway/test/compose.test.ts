import { CATALOG, PROTOCOL_CONFIGS } from '@byway/catalog';
import { parseRecipe, steps, type Recipe, type Step } from '@byway/recipe';
import { validate } from '@byway/validator';
import { describe, expect, it } from 'vitest';
import { mockAdapter } from '../src/providers/mock.ts';
import { lastBlock } from './contract.ts';

/**
 * The demo composer (advisor.compose, advisor.compose.repair) builds from the nearest recipe the prompt carries, with
 * the smallest change that stays valid, keeping that recipe's prompt ids, medium, exceptions and protected checkpoints.
 * Prompts here are laid out as the advisor templates render them: the problem in <problem>, the nearest recipe in a
 * fenced json block (and, for a repair, the failed composition in a second one).
 */

const PROBLEM = 'Something none of the standard recipes quite fits, for my small team';

function composePrompt(nearest: Recipe, failed?: object): string {
  const parts = [`<problem>\n${PROBLEM}\n</problem>`, '<blocks>\nSEED, VISION, CRITIC, ASSET, RELAY, CUT, TELLS, VOICE\n</blocks>', `\`\`\`json\n${JSON.stringify(nearest, null, 2)}\n\`\`\``];
  if (failed) parts.push(`\`\`\`json\n${JSON.stringify(failed, null, 2)}\n\`\`\``, '<violations>\n- PR1 stages[1]: the critic sees the brief\n</violations>');
  return parts.join('\n\n');
}

async function compose(purpose: string, prompt: string): Promise<Recipe> {
  const out = await mockAdapter().complete({
    model: 'mock-big',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    maxOutputTokens: 16000,
    responseFormat: 'text',
    context: { workspaceId: 'ws', purpose, profileId: 'demo' },
  });
  return parseRecipe(JSON.parse(lastBlock(out.text, 'json') as string));
}

/** Prompt ids by role across the catalog's model steps (what the advisor's composed profile allows). */
const catalogPrompts = new Map<string, Set<string>>();
for (const r of CATALOG) for (const { step } of steps(r)) if (step.actor === 'model' && step.prompt) catalogPrompts.set(step.prompt, (catalogPrompts.get(step.prompt) ?? new Set()).add(step.role));

const isProtected = (s: Step) => s.actor === 'human' && ((s.role === 'voice' && s.block === 'VOICE') || s.role === 'build');
const promptsByRole = (r: Recipe) => new Set(steps(r).flatMap(({ step }) => (step.actor === 'model' && step.prompt ? [`${step.role} ${step.prompt}`] : [])));

describe('mock composer: from the nearest recipe', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r] as const))('%s as nearest: parses, validates with only its exceptions, keeps its prompts and checkpoints', async (_id, nearest) => {
    for (const purpose of ['advisor.compose', 'advisor.compose.repair']) {
      const failed = { schema: 'byway.recipe/1', id: 'broken', kind: 'composed', channel: 'workspace', stages: [{ stage: 'D2', body: { op: 'step', id: 'x', role: 'build', actor: 'model', prompt: 'not.a.prompt', consumes: [], produces: [] } }] };
      const recipe = await compose(purpose, composePrompt(nearest, purpose.endsWith('repair') ? failed : undefined));
      const verdict = validate(recipe);
      expect(verdict.violations, `${purpose}: ${JSON.stringify(verdict.violations)}`).toEqual([]);
      expect(verdict.ok).toBe(true);
      expect(recipe).toMatchObject({ kind: 'composed', channel: 'workspace', family: nearest.family, medium: nearest.medium });
      expect(recipe.id).not.toBe(nearest.id);
      expect(recipe.hash).toBeUndefined();
      // Only exceptions the nearest declares.
      for (const ex of [...recipe.exceptions, ...verdict.exceptionsUsed]) expect(nearest.exceptions).toContain(ex);
      // Every model step reuses a prompt the nearest uses for the same role, and so one the catalog uses.
      const allowed = promptsByRole(nearest);
      for (const p of promptsByRole(recipe)) expect(allowed, p).toContain(p);
      for (const { step } of steps(recipe)) if (step.actor === 'model' && step.prompt) expect(catalogPrompts.get(step.prompt)?.has(step.role), step.prompt).toBe(true);
      // The person's own words and own writing stay.
      const kept = new Set(steps(recipe).map(({ step }) => step.id));
      for (const { step } of steps(nearest)) if (isProtected(step)) expect(kept, step.id).toContain(step.id);
      // A composition, not a copy: something changed.
      const strip = (r: Recipe) => JSON.stringify({ ...r, id: '', title: '', kind: '', channel: '', hash: undefined });
      expect(strip(recipe)).not.toBe(strip(nearest));
    }
  });

  it('lowers a loop cap by one (never below its probe), the smallest change', async () => {
    const recipe = await compose('advisor.compose', composePrompt(PROTOCOL_CONFIGS.find((r) => r.id === 'c3') as Recipe));
    const loops = (r: Recipe) => JSON.stringify(r).match(/"max":\d+/g);
    const nearest = PROTOCOL_CONFIGS.find((r) => r.id === 'c3') as Recipe;
    const before = loops(nearest) ?? [];
    const after = loops(recipe) ?? [];
    expect(after.length).toBe(before.length);
    const changed = before.flatMap((m, i) => (m === after[i] ? [] : [[m, after[i]]]));
    expect(changed).toHaveLength(1);
    const [from, to] = (changed[0] as string[]).map((m) => Number(m.split(':')[1]));
    expect(to).toBe((from as number) - 1);
  });
});

describe('mock composer: when no loop can be lowered', () => {
  /** C4 with its critic loop already at one round (max = probe), so the composer must drop an optional instead. */
  function c4AtOneRound(): Recipe {
    const c4 = JSON.parse(JSON.stringify(PROTOCOL_CONFIGS.find((r) => r.id === 'c4'))) as Recipe;
    const json = JSON.stringify(c4).replace(/"max":2/, '"max":1');
    const { hash: _h, ...rest } = JSON.parse(json) as Recipe;
    return rest as Recipe;
  }

  it('drops an optional that holds no protected checkpoint, never the claim log (a human VOICE step)', async () => {
    const nearest = c4AtOneRound();
    expect(validate(nearest).ok).toBe(true);
    const recipe = await compose('advisor.compose', composePrompt(nearest));
    const ids = steps(recipe).map(({ step }) => step.id);
    expect(ids).not.toContain('framings');
    expect(ids).toContain('claim-sign-off');
    expect(validate(recipe).violations).toEqual([]);
  });

  it('declares a sit-out for a block that leaves the recipe with the dropped optional', async () => {
    const nearest = c4AtOneRound();
    // Without the framings optional, the first droppable one is the recipient-critic loop: CRITIC then sits out.
    const d1 = nearest.stages[0]?.body as unknown as { steps: { id?: string }[] };
    d1.steps = d1.steps.filter((s) => s.id !== 'framings-if-wanted');
    const recipe = await compose('advisor.compose', composePrompt(nearest));
    expect(steps(recipe).map(({ step }) => step.block)).not.toContain('CRITIC');
    expect(recipe.sitsOut.map((s) => s.block)).toContain('CRITIC');
    expect(validate(recipe).violations).toEqual([]);
  });
});

describe('mock composer: without a usable nearest recipe', () => {
  it('answers a C4-shaped recipe that uses only C4 prompt ids from the catalog, and validates', async () => {
    for (const problem of ['A short note to my team about Friday', 'A detailed RCA for the outage last week']) {
      const recipe = await compose('advisor.compose', `<problem>${problem}</problem>`);
      expect(validate(recipe).violations).toEqual([]);
      for (const { step } of steps(recipe)) {
        if (step.actor !== 'model') continue;
        expect(step.prompt, step.id).toMatch(/^product\.c4\./);
        expect(catalogPrompts.get(step.prompt as string)?.has(step.role), step.prompt).toBe(true);
      }
    }
  });

  it('ignores a fragment that is not a complete recipe, and never borrows its unknown prompt ids', async () => {
    const fragment = { schema: 'byway.recipe/1', id: 'c4', stages: [{ stage: 'D2', body: { op: 'step', id: 'draft', role: 'build', actor: 'model', prompt: 'runbook.c4.draft-v2', consumes: [], produces: [] } }] };
    const recipe = await compose('advisor.compose', `\`\`\`json\n${JSON.stringify(fragment)}\n\`\`\`\n<problem>A memo</problem>`);
    expect(JSON.stringify(recipe)).not.toContain('runbook.c4.draft-v2');
    expect(validate(recipe).ok).toBe(true);
  });
});
