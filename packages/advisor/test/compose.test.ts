import { c4, c6a, presentationOf } from '@byway/catalog';
import { composedRecipe } from '@byway/gateway';
import { problemSlot } from '@byway/prompts/pure';
import type { Recipe } from '@byway/recipe';
import { recipeHash, walk } from '@byway/recipe';
import { validate } from '@byway/validator';
import { describe, expect, it } from 'vitest';
import { diffFromNearest } from '../src/index.ts';
import { demoAdvisor, fencedJson, sequence, WS } from './helpers.ts';

const MEMO = { text: 'A status memo to leadership about the billing migration' };
const LONG_MEMO = { text: 'A detailed strategy memo on the billing migration for leadership' };

/** The mock composer's C4-shaped recipe, reusing C4's prompt ids (what a model shown C4 would write). */
const c4Prompts = { build: 'product.c4.draft', critic: 'product.c4.recipient', fix: 'product.c4.revise', 'cut-apply': 'product.c4.apply-cut', 'tells-sweep': 'product.c4.tells-sweep', 'tells-swap': 'product.c4.apply-swaps' };
const goodRecipe = () => composedRecipe({ id: 'model-picked-id', title: 'Memo with a recipient read', long: true, prompts: c4Prompts });

/** The good recipe with its stages changed. */
function variant(change: (r: ReturnType<typeof goodRecipe>) => void) {
  const r = goodRecipe();
  change(r);
  return r;
}
const withoutVoice = () =>
  variant((r) => {
    const d3 = (r.stages as { stage: string; body: { steps: { id: string }[] } }[])[2]!;
    d3.body.steps = d3.body.steps.filter((s) => s.id !== 'voice');
  });
const withKnob = (knobs: Record<string, unknown>) =>
  variant((r) => {
    const d1 = (r.stages as { body: Record<string, unknown> }[])[0]!;
    d1.body = { ...d1.body, knobs };
  });

const ids = (r: Recipe) => {
  const out: string[] = [];
  walk(r, (n) => {
    if ('id' in n && n.id) out.push(n.id);
  });
  return out;
};

describe('compose: success in demo mode', () => {
  it('asks the intake for the nearest recipe, then the composer once, and offers a recipe that validates', async () => {
    const { advisor, gateway, prompts } = demoAdvisor();
    const result = await advisor.compose(LONG_MEMO, WS);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.compose']);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.nearestRecipeId).toBe('c4');
    expect(validate(result.recipe).ok).toBe(true);

    const compose = prompts.renders.find((r) => r.id === 'advisor.compose')!;
    expect(compose.slots.problem).toBe(problemSlot(LONG_MEMO));
    // The template fences the nearest recipe itself, so the slot is the bare JSON.
    expect(compose.slots.nearest).toBe(JSON.stringify(c4, null, 2));
    expect(compose.rendered.user).toContain(`\`\`\`json\n${compose.slots.nearest}\n\`\`\``);
    for (const code of ['SEED', 'VISION', 'CRITIC', 'ASSET', 'RELAY', 'CUT', 'TELLS', 'VOICE']) expect(compose.slots.blocks).toContain(code);
    expect(compose.slots.blocks).toContain('Inject variety from outside the model');
    expect(compose.slots.blocks).toMatch(/refs: a whole number from 0 to 10/);
    expect(compose.slots.blocks).toMatch(/intent → artifact/);
  });

  it('forces the workspace channel, the composed kind, the nearest family and a fresh id, and hashes the result', async () => {
    const { advisor } = demoAdvisor({ advisor: { newId: () => 'composed-fresh01' } });
    const { recipe } = await advisor.compose(MEMO, WS);
    expect(recipe).toMatchObject({ id: 'composed-fresh01', kind: 'composed', channel: 'workspace', family: 'C4', medium: 'prose' });
    expect(recipe.parent).toBeUndefined();
    expect(recipe.hash).toBe(recipeHash(recipe));
  });

  it('ignores what the model says about channel, kind, family, id, hash and parent', async () => {
    const claimed = { ...goodRecipe(), channel: 'protocol', kind: 'protocol-config', family: 'C1', id: 'c4', hash: `sha256:${'1'.repeat(64)}`, parent: { hash: c4.hash, derivation: { transform: 'leave-one-out', version: 1, target: 'SEED' } } };
    const { advisor } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(claimed) } });
    const { recipe, ok } = await advisor.compose(MEMO, WS);
    expect(ok).toBe(true);
    expect([recipe.channel, recipe.kind, recipe.family, recipe.id === 'c4', recipe.parent]).toEqual(['workspace', 'composed', 'C4', false, undefined]);
  });

  it('labels the result "Composed", estimates it, and presents it with every node covered once', async () => {
    const { advisor } = demoAdvisor();
    const result = await advisor.compose(LONG_MEMO, WS);
    expect(result.label).toEqual({ verdict: 'Untested', scope: 'Composed', summary: 'Composed for you — not tested.', studies: [] });
    expect(result.estimate).toEqual(advisor.estimate(result.recipe, 'demo'));
    const p = result.presentation;
    expect(p).toMatchObject({ recipeId: result.recipe.id, medium: 'prose' });
    expect(p.name).toContain('Memo Polish');
    const shown = p.stages.flatMap((s) => s.steps.flatMap((x) => x.stepIds));
    expect(shown.sort()).toEqual(ids(result.recipe).sort());
    expect(p.stages.map((s) => s.stage)).toEqual(['Explore', 'Refine', 'Finish']);
    const labels = p.stages.flatMap((s) => s.steps.map((x) => x.label));
    expect(labels).toEqual(expect.arrayContaining(['Your direction', 'Outside critique', 'Trim', 'Cliché sweep', 'Keep or revert', 'Your words']));
    const words = p.stages.flatMap((s) => s.steps).find((x) => x.label === 'Your words')!;
    expect(words.who).toBe('you');
  });

  it('describes the differences from the nearest recipe in plain words', async () => {
    // The demo composer answers the nearest recipe with the smallest valid change: C4's critic loop one round shorter.
    const { advisor } = demoAdvisor();
    const { diff } = await advisor.compose(LONG_MEMO, WS);
    expect(diff).toEqual(['Changed: Outside critique repeats up to 1 round instead of 2']);
  });

  it('describes a composition that rewires the nearest recipe, without quoting hidden thresholds', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(goodRecipe()) } });
    const { diff, ok } = await advisor.compose(LONG_MEMO, WS);
    expect(ok).toBe(true);
    expect(diff).toEqual(expect.arrayContaining(['Removed: Framings to react to (Explore)', 'Removed: Sign off the facts (Finish)']));
    expect(diff.some((d) => /^Changed: Your words \(Finish\): .*every line/.test(d))).toBe(true);
    // Plain words by default (spec §5, UX-13): no step ids, which belong behind "Show technical names".
    expect(diff.join('\n')).not.toMatch(/\((?:framings|claim-sign-off|voice|critic-loop)\)/);
    expect(diff.join('\n')).not.toMatch(/threshold|\b8\b|\b3\b(?= or better)/);
  });

  it('records which template asked on every composer call (spec §3.3 provenance)', async () => {
    const { advisor, gateway, prompts, ledger } = demoAdvisor();
    await advisor.compose(LONG_MEMO, WS);
    // The composed profile also renders each reused step prompt once, with the slots its step fills, to check it fits
    // (ADR-0092); those renders are checks, not calls, so only the advisor's own templates go to the model.
    const refs = prompts.renders.filter(({ id }) => id.startsWith('advisor.')).map(({ rendered: r }) => ({ id: r.id, version: r.version, hash: r.hash, fidelity: r.fidelity }));
    expect(refs.map((r) => r.id)).toEqual(['advisor.intake', 'advisor.compose']);
    expect(gateway.calls.map((c) => c.prompt)).toEqual(refs);
    expect((await ledger()).map((e) => e.prompt)).toEqual(refs);
  });
});

describe('diffFromNearest: plain words', () => {
  const withMax = (max: number) => {
    const r = JSON.parse(JSON.stringify(c4)) as Recipe;
    walk(r, (n) => {
      if (n.op === 'loop' && n.id === 'critic-loop') n.gate.max = max;
    });
    return r;
  };

  it('counts rounds in the singular and the plural', () => {
    expect(diffFromNearest(withMax(1), c4, 'Memo Polish')).toEqual(['Changed: Outside critique repeats up to 1 round instead of 2']);
    expect(diffFromNearest(withMax(3), c4, 'Memo Polish')).toEqual(['Changed: Outside critique repeats up to 3 rounds instead of 2']);
    expect(diffFromNearest(c4, withMax(1), 'Memo Polish')).toEqual(['Changed: Outside critique repeats up to 2 rounds instead of 1']);
  });
});

describe('compose: repair and rejection', () => {
  it('sends the violations back for a repair and offers the repaired recipe', async () => {
    const composer = sequence(fencedJson(withoutVoice()));
    const repair = sequence(fencedJson(goodRecipe()));
    const { advisor, gateway, prompts } = demoAdvisor({ responders: { 'advisor.compose': composer, 'advisor.compose.repair': repair } });
    const result = await advisor.compose(MEMO, WS);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.compose', 'advisor.compose.repair']);
    expect(result.ok).toBe(true);
    const sent = prompts.renders.find((r) => r.id === 'advisor.compose.repair')!;
    expect(sent.slots.violations).toMatch(/COMPOSED-VOICE/);
    const compose = prompts.renders.find((r) => r.id === 'advisor.compose')!;
    for (const slot of ['problem', 'blocks', 'nearest'] as const) expect(sent.slots[slot]).toBe(compose.slots[slot]);
  });

  it('shows the repair the recipe that failed, as the advisor read it (the artifact slot)', async () => {
    const { advisor, prompts } = demoAdvisor({
      responders: { 'advisor.compose': () => fencedJson({ ...withoutVoice(), hash: `sha256:${'1'.repeat(64)}`, channel: 'protocol' }), 'advisor.compose.repair': () => fencedJson(goodRecipe()) },
      advisor: { newId: () => 'composed-fresh01' },
    });
    await advisor.compose(MEMO, WS);
    const sent = prompts.renders.find((r) => r.id === 'advisor.compose.repair')!;
    const failed = JSON.parse(sent.slots.artifact ?? 'null') as Record<string, unknown>;
    // The forced fields as the advisor will register them, and no hash (the template says to leave it out).
    expect(failed).toMatchObject({ id: 'composed-fresh01', kind: 'composed', channel: 'workspace', family: 'C4', stages: withoutVoice().stages });
    expect(failed).not.toHaveProperty('hash');
    expect(sent.rendered.user).toContain(`\`\`\`json\n${sent.slots.artifact}\n\`\`\``);
  });

  it('asks for each repair in a fresh turn of its own template, so the ledger names the prompt that was sent', async () => {
    const { advisor, gateway, prompts } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(withoutVoice()), 'advisor.compose.repair': () => fencedJson(withoutVoice()) } });
    await advisor.compose(MEMO, WS);
    const repairs = prompts.renders.filter((r) => r.id === 'advisor.compose.repair');
    const calls = gateway.calls.filter((c) => c.purpose === 'advisor.compose.repair');
    expect(calls).toHaveLength(2);
    calls.forEach((call, i) => {
      const r = repairs[i]!.rendered;
      expect(call.prompt).toEqual({ id: r.id, version: r.version, hash: r.hash, fidelity: r.fidelity });
      expect(call.system).toBe(r.system);
      expect(call.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: r.user }] }]);
    });
  });

  it('cannot let a backtick run in a model-written answer close the fence around it', async () => {
    const title = 'Memo ```json with ```` fences';
    // A recipe that parsed (its own fence is longer than any run inside), and an answer whose fence the title broke.
    const parsed = `\`\`\`\`\`json\n${JSON.stringify({ ...withoutVoice(), title }, null, 2)}\n\`\`\`\`\``;
    const broken = fencedJson({ ...withoutVoice(), title });
    for (const answer of [parsed, broken]) {
      const { advisor, prompts } = demoAdvisor({ responders: { 'advisor.compose': () => answer, 'advisor.compose.repair': () => fencedJson(goodRecipe()) } });
      expect((await advisor.compose(MEMO, WS)).ok).toBe(true);
      const sent = prompts.renders.find((r) => r.id === 'advisor.compose.repair')!;
      expect(sent.slots.artifact).not.toContain('`');
      const shown = JSON.parse(sent.slots.artifact ?? 'null') as { title: string } | string;
      expect(typeof shown === 'string' ? shown : shown.title).toBe(answer === parsed ? title : answer);
    }
  });

  it('repairs at most twice, then rejects with the violations and never offers the recipe', async () => {
    const { advisor, gateway } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(withoutVoice()), 'advisor.compose.repair': () => fencedJson(withoutVoice()) } });
    const result = await advisor.compose(MEMO, WS);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.compose', 'advisor.compose.repair', 'advisor.compose.repair']);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('COMPOSED-VOICE');
    expect(result.recipe.kind).toBe('composed');
    expect(result.label.scope).toBe('Composed');
  });

  it('treats an answer that is not JSON as a violation to repair, showing the answer as a JSON string', async () => {
    const idea = 'Here is my idea: draft, then critique.';
    const { advisor, prompts } = demoAdvisor({ responders: { 'advisor.compose': () => idea, 'advisor.compose.repair': () => fencedJson(goodRecipe()) } });
    const result = await advisor.compose(MEMO, WS);
    expect(result.ok).toBe(true);
    const sent = prompts.renders.find((r) => r.id === 'advisor.compose.repair')!;
    expect(JSON.parse(sent.slots.artifact ?? 'null')).toBe(idea);
    expect(sent.slots.violations).toMatch(/FORMAT/);
  });

  it('fails clearly when no answer was ever shaped like a recipe', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.compose': () => 'no', 'advisor.compose.repair': () => fencedJson({ stages: 'none' }) } });
    await expect(advisor.compose(MEMO, WS)).rejects.toMatchObject({ name: 'AdvisorError', code: 'compose-unreadable' });
  });

  it('rejects schema errors and validator violations alike', async () => {
    const broken = variant((r) => {
      (r.stages as { stage: string; body: Record<string, unknown> }[])[1]!.body = { op: 'step', id: 'draft', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'mid', prompt: 'product.c4.recipient', consumes: ['artifact', 'brief'], produces: ['critique'] };
    });
    const { advisor } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(broken), 'advisor.compose.repair': () => fencedJson({ ...broken, stages: [] }) } });
    const result = await advisor.compose(MEMO, WS);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => /^(PR|DR|ST)/.test(v.ruleId))).toBe(true);
  });
});

describe('compose: the composed profile (ADR-0058)', () => {
  const rejected = async (recipe: unknown, problem = MEMO) => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(recipe), 'advisor.compose.repair': () => fencedJson(recipe) } });
    const result = await advisor.compose(problem, WS);
    expect(result.ok).toBe(false);
    return result.violations.map((v) => `${v.ruleId}: ${v.message}`).join('\n');
  };

  it('keeps the human VOICE checkpoint the nearest recipe has', async () => {
    expect(await rejected(withoutVoice())).toMatch(/COMPOSED-VOICE/);
  });

  it('does not accept a VOICE step that only runs sometimes in place of one that always runs', async () => {
    const optionalVoice = variant((r) => {
      const d3 = (r.stages as { body: { steps: Record<string, unknown>[] } }[])[2]!;
      d3.body.steps = d3.body.steps.map((s) => (s.id === 'voice' ? { op: 'optional', id: 'voice-if-wanted', trigger: 'you want to', body: s } : s));
    });
    expect(await rejected(optionalVoice)).toMatch(/COMPOSED-VOICE/);
  });

  it("keeps the author's own writing in C6a (protected authorship)", async () => {
    // The C4-shaped recipe has the AI draft: for a short story (nearest C6a) that removes your authorship.
    const out = await rejected(goodRecipe(), { text: 'A short story about a lighthouse keeper who stops answering letters' });
    expect(out).toMatch(/COMPOSED-AUTHOR/);
    expect(out).not.toMatch(/COMPOSED-VOICE/);
  });

  it('accepts a C6a-family recipe that keeps your authorship and your words', async () => {
    const fiction = JSON.parse(JSON.stringify(c6a)) as Record<string, unknown>;
    const { advisor } = demoAdvisor({ responders: { 'advisor.compose': () => fencedJson(fiction) } });
    const result = await advisor.compose({ text: 'A short story about a lighthouse keeper who stops answering letters' }, WS);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.nearestRecipeId).toBe('c6a');
    expect(result.diff).toEqual(['The same steps as Fiction Second Reader.']);
  });

  it('allows no study manipulations and no exceptions the nearest recipe does not declare', async () => {
    const out = await rejected({ ...goodRecipe(), exceptions: ['SM-3', 'C1-DR7', 'C4-DR9'] });
    expect(out).toMatch(/COMPOSED-STUDY: .*SM-3/);
    expect(out).toMatch(/COMPOSED-EXCEPTION: .*C1-DR7/);
    expect(out).not.toMatch(/COMPOSED-EXCEPTION: .*"C4-DR9" is not/);
  });

  it('allows only registered knobs, within range', async () => {
    const out = await rejected(withKnob({ route: 'direct', boldness: 11 }));
    expect(out).toMatch(/COMPOSED-KNOB: .*boldness/);
    const range = await rejected(
      variant((r) => {
        const d3 = (r.stages as { body: { steps: Record<string, unknown>[] } }[])[2]!;
        d3.body.steps = d3.body.steps.map((s) => (s.id === 'tells-sweep' ? { ...s, knobs: { catalog: 'everything' } } : s));
      }),
    );
    expect(range).toMatch(/COMPOSED-KNOB: .*catalog/);
  });

  it('allows only prompt templates the catalog uses for the same role, and that exist', async () => {
    const swapped = variant((r) => {
      const d2 = (r.stages as { body: { steps: Record<string, unknown>[] } }[])[1]!;
      d2.body.steps = d2.body.steps.map((s) => (s.id === 'draft' ? { ...s, prompt: 'product.c4.recipient' } : s));
    });
    expect(await rejected(swapped)).toMatch(/COMPOSED-PROMPT: .*product\.c4\.recipient/);
    const invented = variant((r) => {
      const d2 = (r.stages as { body: { steps: Record<string, unknown>[] } }[])[1]!;
      d2.body.steps = d2.body.steps.map((s) => (s.id === 'draft' ? { ...s, prompt: 'product.composed.draft' } : s));
    });
    expect(await rejected(invented)).toMatch(/COMPOSED-PROMPT: .*product\.composed\.draft/);

    const { advisor } = demoAdvisor({ has: (id) => id !== 'product.c4.draft' });
    const result = await advisor.compose(MEMO, WS);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.message).join('\n')).toMatch(/product\.c4\.draft.*no template/);
  });

  it('never reports the same knob twice (the validator already checks knob ranges)', async () => {
    const out = await rejected(withKnob({ route: 'sideways' }));
    expect(out.split('\n').filter((l) => /route/.test(l))).toHaveLength(1);
  });
});

describe('the nearest recipe and its presentation', () => {
  it('composes from the recipe the chooser recommends', async () => {
    const { advisor } = demoAdvisor();
    const result = await advisor.compose({ text: 'A landing page for my neighborhood bakery' }, WS);
    expect(result.nearestRecipeId).toBe('c1');
    expect(result.presentation.name).toContain(presentationOf('c1')!.name);
  });
});

describe('compose: trying again (UX-3)', () => {
  it('composes again for the same problem after a recipe that failed the checks, with a fresh recipe each time', async () => {
    // The web app's "Try building again" calls compose for the same intake; the advisor keeps no state between calls,
    // so a second attempt asks the composer afresh and can pass where the first did not.
    let answers = 0;
    const { advisor } = demoAdvisor({
      responders: { 'advisor.compose': () => fencedJson(++answers === 1 ? withoutVoice() : goodRecipe()), 'advisor.compose.repair': () => fencedJson(withoutVoice()) },
    });
    const first = await advisor.compose(LONG_MEMO, WS);
    expect(first.ok).toBe(false);
    const second = await advisor.compose(LONG_MEMO, WS);
    expect(second.ok).toBe(true);
    expect(second.recipe.id).not.toBe(first.recipe.id);
  });
});
