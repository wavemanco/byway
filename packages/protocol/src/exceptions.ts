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

export const EXCEPTIONS: Record<string, ExceptionDef> = {
  'C1-DR2': {
    id: 'C1-DR2',
    relaxes: ['DR2'],
    scope: 'protocol-declared',
    kinds: ['protocol-config', 'variant', 'ablation'],
    channels: ALL_CHANNELS,
    families: ['C1'],
    source: '03 ordering principle: the article-faithful default keeps all k candidates through D2',
  },
  'C1-DR7': {
    id: 'C1-DR7',
    relaxes: ['DR7'],
    clauses: { DR7: ['judge-after'] },
    scope: 'protocol-declared',
    kinds: ['protocol-config', 'variant', 'ablation'],
    channels: ALL_CHANNELS,
    families: ['C1'],
    source: '03 ordering principle: a score-free, defect-only CRITIC-check runs after D3',
  },
  'SM-1': {
    id: 'SM-1',
    relaxes: ['PR4'],
    clauses: { PR4: ['d3-entry', 'each-in-d3'] },
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: [],
    source: 'Study 1 protocol v1.1: every candidate is evaluated, no pick before D3',
  },
  'SM-2': {
    id: 'SM-2',
    relaxes: ['LS1'],
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: [],
    source: 'Study 1 protocol v1.1: policies decide at non-convergence, the cap and backtracks',
  },
  'SM-3': {
    id: 'SM-3',
    relaxes: ['CH3'],
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: [],
    source: 'Study 1 protocol v1.1: D3-auto CUT is an AI proxy for the human taste owner',
  },
  'SM-4': {
    id: 'SM-4',
    relaxes: ['PR7.2'],
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: [],
    source: 'Study 1 protocol v1.1: a blind AI A/B call replaces the human TELLS comparison',
  },
  'SM-5': {
    id: 'SM-5',
    relaxes: ['PR1', 'PR2', 'DR3', 'DR5'],
    clauses: { PR1: ['not-isolated'], PR2: ['shared-context'], DR3: ['not-isolated'], DR5: ['judge-tier'] },
    scope: 'study-manipulation',
    kinds: ['ablation'],
    channels: ['research-frozen'],
    families: [],
    requiresDerivation: 'critique-self',
    source: 'Study 1 protocol v1.1: CRITIC-self, a non-blind same-model critic, is the manipulation itself',
  },
  'SM-6': {
    id: 'SM-6',
    relaxes: ['PR6', 'DR9'],
    clauses: { DR9: ['fixed-input'] },
    scope: 'study-manipulation',
    kinds: STUDY_KINDS,
    channels: ['research-frozen'],
    families: [],
    source: 'Study 1 protocol v1.1: a fixed human copy deck in every arm holds copy constant',
  },
};
