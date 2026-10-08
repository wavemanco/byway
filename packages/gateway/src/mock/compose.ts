/**
 * The mock composer's answer (advisor.compose and advisor.compose.repair, demo mode): a `byway.recipe/1` object on the
 * workspace channel. Plain data, so the gateway does not depend on the recipe package; its tests validate the answer
 * with @byway/validator.
 *
 * With the nearest canonical recipe in the prompt (the templates put it in a fenced json block; a repair prompt also
 * carries the failed composition, which is skipped), the answer is that recipe with the smallest change that stays
 * valid, as the composer prompt asks ("prefer the smallest change from the nearest recipe"):
 * - one loop's `max` lowered by one, while it stays at or above its `probe` (one round fewer to wait through); or,
 *   where no loop can be lowered, one optional block dropped whose body holds no protected checkpoint (the person's
 *   VOICE or their own writing), with a sit-out for any block that leaves the recipe with it;
 * - the nearest recipe's medium, family, prompt ids, exceptions, inputs and protected checkpoints kept as they are.
 * Without a usable nearest recipe, it answers a short C4-shaped recipe (below) that uses only C4's own prompt ids, so
 * the mock never names a prompt the catalog does not use.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type RecipeJson = { [key: string]: Json };

/** C4 Reader-Ready's prompt ids by role, for the fallback recipe: real catalog prompts (product.c4.*). */
export const DEFAULT_PROMPTS: Record<string, string> = {
  build: 'product.c4.draft',
  critic: 'product.c4.recipient',
  fix: 'product.c4.revise',
  'cut-apply': 'product.c4.apply-cut',
  'tells-sweep': 'product.c4.tells-sweep',
  'tells-swap': 'product.c4.apply-swaps',
};

const isObject = (v: unknown): v is RecipeJson => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * The nearest canonical recipe in a composer prompt: the first fenced JSON object that is a complete `byway.recipe/1`
 * recipe (stages, family, inputs, sit-outs and exceptions present) and not itself a composition.
 */
export function nearestRecipeIn(blocks: readonly string[]): RecipeJson | undefined {
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    if (!isObject(parsed) || parsed.schema !== 'byway.recipe/1' || parsed.kind === 'composed' || parsed.channel === 'workspace') continue;
    const complete =
      Array.isArray(parsed.stages) && parsed.stages.length > 0 && typeof parsed.family === 'string' && Array.isArray(parsed.inputs) && Array.isArray(parsed.sitsOut) && Array.isArray(parsed.exceptions);
    if (complete) return parsed;
  }
  return undefined;
}

/** The child nodes of a recipe node, by operator (02 §2). */
function childrenOf(n: RecipeJson): RecipeJson[] {
  switch (n.op) {
    case 'seq':
      return Array.isArray(n.steps) ? n.steps.filter(isObject) : [];
    case 'route':
      return Array.isArray(n.branches) ? n.branches.filter(isObject).map((b) => b.body).filter(isObject) : [];
    case 'audit':
      return Array.isArray(n.lenses) ? n.lenses.filter(isObject).map((l) => l.body).filter(isObject) : [];
    case 'pick':
      return isObject(n.judge) ? [n.judge] : [];
    case 'step':
      return [];
    default:
      return isObject(n.body) ? [n.body] : [];
  }
}

/** Every node under the stages, pre-order, with the seq (and index) that holds it when there is one. */
function nodesOf(recipe: RecipeJson): { node: RecipeJson; parent?: RecipeJson; index?: number }[] {
  const out: { node: RecipeJson; parent?: RecipeJson; index?: number }[] = [];
  const visit = (node: RecipeJson, parent?: RecipeJson, index?: number) => {
    out.push({ node, ...(parent ? { parent, index: index as number } : {}) });
    childrenOf(node).forEach((c, i) => visit(c, node.op === 'seq' ? node : undefined, i));
  };
  for (const stage of Array.isArray(recipe.stages) ? recipe.stages : []) if (isObject(stage) && isObject(stage.body)) visit(stage.body);
  return out;
}

const stepsUnder = (n: RecipeJson): RecipeJson[] => (n.op === 'step' ? [n] : childrenOf(n).flatMap(stepsUnder));

/** The person's own words (a human VOICE step) or their own writing (a human build step): never composed away. */
const isProtected = (s: RecipeJson) => s.actor === 'human' && ((s.role === 'voice' && s.block === 'VOICE') || s.role === 'build');

const blocksIn = (recipe: RecipeJson) => new Set(nodesOf(recipe).flatMap(({ node }) => (node.op === 'step' && typeof node.block === 'string' ? [node.block] : [])));

/** Lowers the first loop whose `max` can drop by one and stay at or above its `probe`. Returns a plain description. */
function lowerALoop(recipe: RecipeJson): string | undefined {
  for (const { node } of nodesOf(recipe)) {
    if (node.op !== 'loop' || !isObject(node.gate)) continue;
    const { max, probe } = node.gate;
    if (typeof max !== 'number' || typeof probe !== 'number' || max - 1 < Math.max(1, probe)) continue;
    node.gate.max = max - 1;
    return `loop "${String(node.id)}" runs at most ${max - 1} rounds instead of ${max}`;
  }
  return undefined;
}

/** Drops the first optional (from a seq that keeps other steps) whose body holds no protected checkpoint. */
function dropAnOptional(recipe: RecipeJson): string | undefined {
  const before = blocksIn(recipe);
  for (const { node, parent, index } of nodesOf(recipe)) {
    if (node.op !== 'optional' || !parent || index === undefined || !Array.isArray(parent.steps) || parent.steps.length < 2) continue;
    if (stepsUnder(node).some(isProtected)) continue;
    parent.steps.splice(index, 1);
    const after = blocksIn(recipe);
    const sitting = new Set((recipe.sitsOut as Json[]).filter(isObject).map((s) => s.block));
    for (const block of before) {
      if (!after.has(block) && !sitting.has(block)) {
        (recipe.sitsOut as Json[]).push({ block, reason: `Left out of this composition with the optional step "${String(node.id)}" (${String(node.trigger)}).` });
      }
    }
    return `optional "${String(node.id)}" is left out`;
  }
  return undefined;
}

/**
 * The nearest recipe as a composition: workspace channel, kind composed, a new id and title, and the smallest change
 * that keeps it valid (see the module comment). Everything else, prompt ids and exceptions included, is the nearest's.
 */
export function composeFromNearest(nearest: RecipeJson, o: { id: string; title: string }): RecipeJson {
  const { hash: _hash, parent: _parent, ...rest } = clone(nearest);
  const recipe: RecipeJson = { ...rest, id: o.id, title: o.title, kind: 'composed', channel: 'workspace' };
  if (!Array.isArray(recipe.sitsOut)) recipe.sitsOut = [];
  lowerALoop(recipe) ?? dropAnOptional(recipe);
  return recipe;
}

export interface ComposeOptions {
  id: string;
  title: string;
  /** Add the recipient-critic loop (C4 runs it only for documents over about 300 words). */
  long: boolean;
  /** Prompt ids by role in place of C4's own (DEFAULT_PROMPTS), for callers that build test recipes. */
  prompts?: Partial<Record<string, string>>;
}

const step = (s: RecipeJson): RecipeJson => ({ op: 'step', ...s });
const render = (id: string) => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

/**
 * The fallback composition, shaped after C4 Reader-Ready (03-configurations): a one-line human direction, a mid-tier
 * draft, a recipient-critic loop for long documents, then human-led Distill (CUT, TELLS, VOICE). It differs from C4 so
 * that it validates with no exceptions: VOICE covers every line, not only the key lines (C4 cites C4-DR9 for that).
 */
export function composedRecipe(o: ComposeOptions): RecipeJson {
  const p = (role: string) => (o.prompts?.[role] ?? DEFAULT_PROMPTS[role]) as string;
  const applyDirective = (id: string, prompt: string) =>
    step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt, consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });

  const draft = step({ id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: p('build'), consumes: ['intent', 'brief'], produces: ['artifact'], writes: true });
  const recipientLoop: RecipeJson = {
    op: 'loop',
    id: 'recipient-loop',
    body: {
      op: 'seq',
      steps: [
        render('recipient-render'),
        step({
          id: 'recipient-critic',
          role: 'critic',
          block: 'CRITIC',
          actor: 'model',
          tier: 'big',
          isolated: true,
          frozenPrompt: true,
          prompt: p('critic'),
          consumes: ['view'],
          produces: ['critique', 'score'],
          knobs: { mode: 'OK', renders: ['document as opened'], calibration: false },
        }),
        applyDirective('revise', p('fix')),
      ],
    },
    gate: {
      metric: 'critic-score',
      threshold: 8,
      hidden: true,
      holder: 'harness',
      probe: 1,
      max: 2,
      onCap: 'human',
      onNoConverge: 'recalibrate-human',
    },
  };

  const sitsOut: RecipeJson[] = [
    { block: 'SEED', reason: 'A single-answer document: variety comes from the owner, not a seed.' },
    { block: 'ASSET', reason: 'No generated imagery; charts only from real data, outside the run.' },
    { block: 'RELAY', reason: 'No specialist media chain.' },
  ];
  if (!o.long) sitsOut.push({ block: 'CRITIC', reason: 'Short document: a human read is cheaper than a critic loop.' });

  return {
    schema: 'byway.recipe/1',
    id: o.id,
    title: o.title,
    kind: 'composed',
    family: 'C4',
    channel: 'workspace',
    medium: 'prose',
    inputs: ['intent', 'tells'],
    stages: [
      {
        stage: 'D1',
        body: step({ id: 'direction', role: 'vision', block: 'VISION', actor: 'human', consumes: ['intent'], produces: ['brief'], knobs: { route: 'direct' } }),
      },
      { stage: 'D2', body: o.long ? { op: 'seq', steps: [draft, recipientLoop] } : draft },
      {
        stage: 'D3',
        body: {
          op: 'seq',
          steps: [
            render('cut-render'),
            step({ id: 'cut', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }),
            applyDirective('apply-cut', p('cut-apply')),
            render('tells-render'),
            step({
              id: 'tells-sweep',
              role: 'tells-sweep',
              block: 'TELLS',
              actor: 'model',
              tier: 'big',
              isolated: true,
              frozenPrompt: true,
              prompt: p('tells-sweep'),
              consumes: ['view', 'tells'],
              produces: ['critique'],
              knobs: { catalog: 'extended', variants: 'combined' },
            }),
            applyDirective('apply-swaps', p('tells-swap')),
            render('compare-render'),
            step({ id: 'tells-compare', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }),
            step({
              id: 'voice',
              role: 'voice',
              block: 'VOICE',
              actor: 'human',
              consumes: ['artifact'],
              produces: ['voice', 'artifact'],
              writes: true,
              knobs: { scope: 'every-line' },
            }),
          ],
        },
      },
    ],
    sitsOut,
    exceptions: [],
    bank: true,
  };
}
