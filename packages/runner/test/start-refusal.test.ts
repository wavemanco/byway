/**
 * Runner.start refuses what the engine cannot run (F02, ADR-0092 stage 2), whoever admitted the recipe: counts past
 * the engine's limits, a C pick nobody can decide, a retrying gate inside a fan-out (G1) and an ASSET step whose slots
 * knob is not a whole number of at least 1 (SLOTS-KNOB). It throws RecipeRefused
 * before any run record or workflow exists, and before the brief is stored, so nothing is left "queued" or wedged
 * "running", and nothing is written for it. A recipe holding a lone surrogate, which no hash can be taken of, is refused
 * earlier still, by parseRecipe's ZodError (F19, ADR-0083), with nothing written either.
 */
import { describe, expect, it, vi } from 'vitest';
import { c1 } from '@byway/catalog';
import { RecipeRefusedError, type Store } from '@byway/contracts';
import { loop, pick, replicate, seq, step, withHash, type Node, type Recipe } from '@byway/recipe';
import { createRunnerClient } from '../src/client.ts';

type N = Record<string, any>;

function runner() {
  const createRun = vi.fn(async (r: N) => ({ ...r, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' }));
  const start = vi.fn(async () => undefined);
  // The brief is stored before the run is written (P2): the file's id is all the workflow is handed.
  const putText = vi.fn(async () => ({ id: `sha256:${'b'.repeat(64)}` }));
  const store = { createRun, updateRun: vi.fn(), artifacts: { putText } } as unknown as Store;
  const client = { workflow: { start } } as never;
  return { r: createRunnerClient({ client, store }), createRun, start, putText };
}

const startWith = (recipe: Recipe) => runner().r.start({ workspaceId: 'default', recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5 });

const variant = (edit: (r: N) => void): Recipe => {
  const r = structuredClone(c1) as N;
  delete r.hash;
  edit(r);
  return withHash(r as Recipe);
};
const d2Candidate = (r: N): N => r.stages[1].body.steps[0].body;
/** C1's optional ASSET step, wherever it sits. */
const c1Asset = (r: N): N => {
  const find = (n: N): N | undefined => (n.op === 'step' && n.role === 'asset' ? n : [...(n.steps ?? []), ...(n.body ? [n.body] : [])].map(find).find(Boolean));
  return r.stages.map((s: N) => find(s.body)).find(Boolean)!;
};

describe('Runner.start refuses what the engine cannot run, before a run exists', () => {
  it.each([
    ['a billion seeded drafts', (r: N) => (r.stages[0].body.n = 1e9), /replicate "seeded-x4"'s count is 1000000000; the engine allows at most 500/],
    ['a C pick with no judge', (r: N) => Object.assign(r.stages[1].body.steps[1], { mode: 'C', actor: 'model' }), /pick "pick-one" chooses by a judge/],
    [
      'G1: a retrying gate inside each-candidate',
      (r: N) =>
        d2Candidate(r).steps.push(
          { op: 'step', id: 'gate-render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] },
          { op: 'gate', id: 'g', body: { ...d2Candidate(r).steps[0].body.steps[1], id: 'gate-critic' }, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, retry: { stage: 'D1', times: 1 }, onFail: 'human' },
        ),
      /gate "g" retries a stage from inside replicate, each or an audit lens/,
    ],
    // An ASSET step whose slots knob is below 1 would pay for its briefs and make no image; one between whole numbers,
    // a fraction of one (SLOTS-KNOB).
    ['an ASSET step whose slots knob is 0.5', (r: N) => (c1Asset(r).knobs.slots = 0.5), /ASSET step "asset"'s slots knob is 0\.5; it must be a whole number of at least 1/],
    ['an ASSET step whose slots knob is 1.5', (r: N) => (c1Asset(r).knobs.slots = 1.5), /ASSET step "asset"'s slots knob is 1\.5; it must be a whole number of at least 1/],
  ] as [string, (r: N) => void, RegExp][])('%s', async (_name, edit, message) => {
    const { r, createRun, start, putText } = runner();
    const recipe = variant(edit);
    const refused = await r.start({ workspaceId: 'default', recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(RecipeRefusedError);
    expect((refused as Error).name).toBe('RecipeRefused');
    expect((refused as RecipeRefusedError).problems).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
    expect(createRun).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    // Nor is anything stored for it: the brief is written only for a start the engine can run (P2).
    expect(putText).not.toHaveBeenCalled();
  });

  it('a catalog recipe starts', async () => {
    await expect(startWith(c1)).resolves.toMatchObject({ recipeId: 'c1', status: 'queued' });
  });
});

describe('Runner.start checks the product rules for a recipe that is not a catalog or research recipe (F01 (d))', () => {
  // Every product run used to reach Runner.start through the web start, which admits a composed recipe again; a second
  // entry point (a CLI, the agent channel, a hosted API) would have run one without them (ADR-0092, ADR-0093).
  const composed = (body: Node): Recipe =>
    withHash({ schema: 'byway.recipe/1', id: 'composed-x', title: 'composed-x', kind: 'composed', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: [{ stage: 'D1', body }], sitsOut: [], exceptions: [], bank: false } as Recipe);
  const draft = (id: string) => step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: `product.test.${id}`, consumes: ['intent'], produces: ['artifact'], writes: true });
  const yours = step({ id: 'yours', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true });
  const look = step({ id: 'look', role: 'vision', block: 'VISION', actor: 'human', consumes: ['artifact'], produces: ['taste'] });

  it.each([
    ['a pick after your words', composed(seq(replicate('drafts', 2, draft('d')), yours, pick('p', 'H', 1, 'human'))), /"yours", a person's write, set aside/],
    [
      'LS1: a loop you hold that hands its last round to a policy',
      composed(seq(draft('d'), loop('l', look, { metric: 'human', hidden: false, holder: 'human', probe: 1, max: 3, onCap: 'policy-best-snapshot', onNoConverge: 'continue' }))),
      /loop "l" is yours to end, but hands its last round to a policy/,
    ],
  ] as [string, Recipe, RegExp][])('%s is refused before a run exists', async (_name, recipe, message) => {
    const { r, createRun, start, putText } = runner();
    const refused = await r.start({ workspaceId: 'default', recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(RecipeRefusedError);
    expect((refused as RecipeRefusedError).problems).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
    expect(createRun).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(putText).not.toHaveBeenCalled();
  });

  it('a composed recipe that keeps them starts', async () => {
    await expect(startWith(composed(seq(replicate('drafts', 2, draft('d')), pick('p', 'H', 1, 'human'), yours)))).resolves.toMatchObject({ status: 'queued' });
  });
});

describe('Runner.start refuses a recipe holding a lone surrogate, before a run exists and before anything is stored (F19)', () => {
  /**
   * C1 read back from JSON text with `edit` applied to that text first: a lone surrogate reaches a recipe only as a JSON
   * backslash-u escape (a model's answer, a file), and the recipe arrives as JSON.parse leaves it, with no hash.
   */
  const fromText = (edit: (text: string) => string): unknown => {
    const r = structuredClone(c1) as N;
    delete r.hash;
    return JSON.parse(edit(JSON.stringify(r)));
  };
  const knobs = (json: string) => fromText((t) => t.replace(/"knobs":\{/, `"knobs":{"extra":${json},`));

  it.each([
    ['the title', fromText((t) => t.replace(/"title":"[^"]*"/, '"title":"C1 \\ud800"')), /\$\.title: string contains a lone surrogate/],
    ['a knob value', knobs('"v\\udfff"'), /\.knobs\.extra: string contains a lone surrogate/],
    ['a knob name', knobs('{"a\\udbff":1}'), /\.knobs\.extra: property name "a\\udbff" contains a lone surrogate/],
  ] as [string, unknown, RegExp][])('in %s: one issue naming where it is, and no run, workflow or file', async (_name, recipe, where) => {
    const { r, createRun, start, putText } = runner();
    const refused = await r.start({ workspaceId: 'default', recipe: recipe as Recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5 }).catch((e: unknown) => e);
    // parseRecipe's ZodError (ADR-0083): the web start and the CLI handle it on their existing path.
    expect((refused as Error).name).toBe('ZodError');
    const issues = (refused as { issues: { path: unknown[]; message: string }[] }).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toEqual([]);
    expect(issues[0]!.message).toMatch(/^the recipe cannot be hashed: /);
    expect(issues[0]!.message).toMatch(where);
    expect(issues[0]!.message.isWellFormed()).toBe(true);
    expect(createRun).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    // The recipe is read before the brief is stored (P2), so such a start writes nothing to the store.
    expect(putText).not.toHaveBeenCalled();
  });
});
