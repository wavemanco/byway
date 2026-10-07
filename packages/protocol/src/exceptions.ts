import type { RuleId } from './rules.ts';

export type RecipeKind = 'protocol-config' | 'variant' | 'ablation' | 'baseline' | 'composed' | 'experimental';
export type Channel = 'protocol' | 'research-frozen' | 'product' | 'workspace';

export interface ExceptionDef {
  id: string;
  relaxes: RuleId[];
  /**
   * Clause scoping. When a relaxed rule has an entry here, the exception suppresses only findings
   * with one of these clauses, so an exception cannot hide an unrelated breach of the same rule.
   */
  clauses?: Partial<Record<RuleId, string[]>>;
  scope: 'protocol-declared' | 'study-manipulation';
  /** Recipe kinds that may cite it. */
  kinds: RecipeKind[];
  /** Channels on which it may be cited. */
  channels: Channel[];
  /** Configuration families that may cite it; empty means any. */
  families: string[];
  /** Only recipes produced by this derivation may cite it. */
  requiresDerivation?: string;
  source: string;
}

const ALL_CHANNELS: Channel[] = ['protocol', 'research-frozen', 'product', 'workspace'];
const STUDY_KINDS: RecipeKind[] = ['variant', 'ablation', 'baseline'];
/** Study 1 manipulations are legal only for the Study 1 arms (the C1 family and the baselines) until lock binding exists. */
const STUDY1_FAMILIES = ['C1', 'baseline'];
/** Kinds that may cite a protocol-declared exception: the configuration itself and what derives from or composes it. */
const DECLARED_KINDS: RecipeKind[] = ['protocol-config', 'variant', 'ablation', 'composed'];

/**
 * A row of 03's "Ordering principle and declared exceptions" table, as a clause-scoped entry limited to its own
 * family (the id's prefix), so it relaxes exactly what 03 says for that configuration and nothing else.
 */
function declared(id: string, rule: RuleId, clauses: string[], source: string): Record<string, ExceptionDef> {
  const family = id.slice(0, id.lastIndexOf('-'));
  return {
    [id]: {
      id,
      relaxes: [rule],
      clauses: { [rule]: clauses },
      scope: 'protocol-declared',
      kinds: DECLARED_KINDS,
      channels: ALL_CHANNELS,
      families: [family],
      source,
    },
  };
}

export const EXCEPTIONS: Record<string, ExceptionDef> = {
  'C1-DR2': {
    id: 'C1-DR2',
    relaxes: ['DR2'],
    scope: 'protocol-declared',
    kinds: ['protocol-config', 'variant', 'ablation', 'composed'],
    channels: ALL_CHANNELS,
    families: ['C1'],
    source: '03 ordering principle: the article-faithful default keeps all k candidates through D2',
  },
  'C1-DR7': {
    id: 'C1-DR7',
    relaxes: ['DR7'],
    clauses: { DR7: ['check-after'] },
    scope: 'protocol-declared',
    kinds: ['protocol-config', 'variant', 'ablation', 'composed'],
    channels: ALL_CHANNELS,
    families: ['C1'],
    source: '03 ordering principle: a score-free, defect-only CRITIC-check runs after D3',
  },
  ...declared('C2-DR4', 'DR4', ['annotation'], '03 ordering principle (C2, rule 4): the critic runs once, as an annotation; the human picks'),
  ...declared('C2-DR7', 'DR7', ['voice-stage'], '03 ordering principle (C2, stage placement): VOICE runs inside D1; C2 is D1-only'),
  ...declared('C4-DR9', 'DR9', ['key-lines'], '03 ordering principle (C4, rule 9): VOICE-lite, the owner reads every line and rewrites the key lines'),
  ...declared(
    'C5-DR7',
    'DR7',
    ['voice-stage', 'gate-after'],
    '03 ordering principle (C5, rule 7): the VO script is written and locked in D1; the critic is a one-shot gate after D3',
  ),
  ...declared('C6-DR4', 'DR4', ['human-stop'], '03 ordering principle (C6, rule 4): no hidden threshold, the human decides when it is done'),
  ...declared('C6-DR7', 'DR7', ['audit'], '03 ordering principle (C6, rule 7): CUT, TELLS and CRITIC run as parallel annotation-only auditors in D2'),
  ...declared('C6a-DR4', 'DR4', ['human-stop'], '03 ordering principle (C6a, rule 4): the same as C6'),
  ...declared('C6a-DR7', 'DR7', ['audit'], '03 ordering principle (C6a, rule 7): the same as C6, and the optional final TELLS read is flags only'),
  ...declared('C7-PR1', 'PR1', ['code-view'], '03 ordering principle (C7, port rule 1): for code, the render is the diff'),
  ...declared('C7-DR7', 'DR7', ['cut-stage'], '03 ordering principle (C7, rule 7): CUT also runs in D2, before and after the review loop'),
  'SM-1': {
    id: 'SM-1',
    relaxes: ['PR4'],
    clauses: { PR4: ['d3-entry', 'each-in-d3'] },
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: STUDY1_FAMILIES,
    source: 'Study 1 protocol v1.1: every candidate is evaluated, no pick before D3',
  },
  'SM-2': {
    id: 'SM-2',
    relaxes: ['LS1'],
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: STUDY1_FAMILIES,
    source: 'Study 1 protocol v1.1: policies decide at non-convergence, the cap and backtracks',
  },
  'SM-3': {
    id: 'SM-3',
    relaxes: ['CH3'],
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: STUDY1_FAMILIES,
    source: 'Study 1 protocol v1.1: D3-auto CUT is an AI proxy for the human taste owner',
  },
  'SM-4': {
    id: 'SM-4',
    relaxes: ['PR7.2'],
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: STUDY1_FAMILIES,
    source: 'Study 1 protocol v1.1: a blind AI A/B call replaces the human TELLS comparison',
  },
  'SM-5': {
    id: 'SM-5',
    relaxes: ['PR1', 'PR2', 'DR3', 'DR4', 'DR5'],
    clauses: { PR1: ['not-isolated'], PR2: ['shared-context'], DR3: ['not-isolated'], DR4: ['shared-context'], DR5: ['judge-tier'] },
    scope: 'study-manipulation',
    kinds: ['ablation'],
    channels: ['research-frozen'],
    families: STUDY1_FAMILIES,
    requiresDerivation: 'critique-self',
    source: 'Study 1 protocol v1.1: CRITIC-self, a non-blind same-model critic, is the manipulation itself',
  },
  'SM-6': {
    id: 'SM-6',
    relaxes: ['PR6', 'DR9'],
    clauses: { PR6: ['fixed-input'], DR9: ['fixed-input'] },
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: STUDY1_FAMILIES,
    source: 'Study 1 protocol v1.1: a fixed human copy deck in every arm holds copy constant',
  },
};
