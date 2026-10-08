/**
 * The mock composer's answer: a `byway.recipe/1` object on the workspace channel, shaped after C4 Reader-Ready
 * (03-configurations): a one-line human direction, a mid-tier draft, an optional recipient-critic loop for long
 * documents, then human-led Distill (CUT, TELLS, VOICE). It is plain data so the gateway does not depend on the recipe
 * package; the gateway's tests validate it with @byway/validator.
 *
 * Differences from canonical C4, so it validates with no exceptions (a composed recipe may cite only the exceptions
 * its nearest canonical recipe declares, and those are WP-A's to define): VOICE covers every line, not key lines.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type RecipeJson = { [key: string]: Json };

/** Prompt ids used when the composer prompt does not show the nearest recipe's own ids for a role. */
export const DEFAULT_PROMPTS: Record<string, string> = {
  build: 'runbook.c4-draft',
  critic: 'runbook.critic-ok',
  fix: 'article.CRIT-W',
  'cut-apply': 'runbook.cut-apply',
  'tells-sweep': 'runbook.tells-sweep',
  'tells-swap': 'runbook.tells-swap',
};

export interface ComposeOptions {
  id: string;
  title: string;
  /** Add the recipient-critic loop (C4 runs it only for documents over about 300 words). */
  long: boolean;
  /** Prompt ids by role, read from the nearest canonical recipe when the prompt includes it. */
  prompts?: Partial<Record<string, string>>;
}

const step = (s: RecipeJson): RecipeJson => ({ op: 'step', ...s });
const render = (id: string) => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

export function composedRecipe(o: ComposeOptions): RecipeJson {
  const p = (role: string) => o.prompts?.[role] ?? DEFAULT_PROMPTS[role] ?? `runbook.${role}`;
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
