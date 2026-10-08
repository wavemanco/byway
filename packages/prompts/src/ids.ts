import { MEDIA, TELLS_DOMAINS, type Medium, type TellsDomain } from '@byway/protocol';

/**
 * Every prompt id with a template, as a literal list so it can be read in review and imported where the file system
 * is off limits (workflow bundles). A test holds it equal to the templates directory and to the catalog's prompt ids.
 */

/** Recipe-step prompts of the eight protocol configurations (the `prompt` field of their model steps). */
export const RECIPE_PROMPT_IDS = [
  // C1 Studio: the article's prompts (paraphrased) and the 06-runbook templates.
  'article.SEED',
  'article.CRIT-W',
  'article.ASSET',
  'runbook.critic-ok',
  'runbook.cut-apply',
  'runbook.tells-sweep',
  'runbook.tells-swap',
  'runbook.defect-check',
  // C2 Divergence Engine
  'product.c2.seed-option',
  'product.c2.dedupe',
  'product.c2.vanilla-build',
  'product.c2.vanilla-flag',
  'product.c2.critic',
  'product.c2.sharpen',
  'product.c2.option-map',
  'product.c2.mood-boards',
  // C3 Voice Series
  'product.c3.seed-angle',
  'product.c3.vanilla-build',
  'product.c3.vanilla-flag',
  'product.c3.ai-draft',
  'product.c3.critic',
  'product.c3.revise',
  'product.c3.asset',
  'product.c3.apply-cut',
  'product.c3.tells-sweep',
  'product.c3.apply-swaps',
  // C4 Reader-Ready
  'product.c4.framings',
  'product.c4.draft',
  'product.c4.recipient',
  'product.c4.revise',
  'product.c4.apply-cut',
  'product.c4.tells-sweep',
  'product.c4.apply-swaps',
  // C5 Media Relay
  'product.c5.seed-territory',
  'product.c5.dedupe',
  'product.c5.vanilla-build',
  'product.c5.vanilla-flag',
  'product.c5.concept',
  'product.c5.anchor-frames',
  'product.c5.clip',
  'product.c5.shot-check',
  'product.c5.regenerate',
  'product.c5.render-in-scene',
  'product.c5.vo-audio',
  'product.c5.apply-cut',
  'product.c5.tells-sweep',
  'product.c5.apply-swaps',
  'product.c5.gate-critic',
  // C6 Sounding Board
  'product.c6.angles',
  'product.c6.cut-marks',
  'product.c6.tells-flags',
  'product.c6.critic',
  // C6a Fiction Sounding Board
  'product.c6a.seed-card',
  'product.c6a.vanilla-build',
  'product.c6a.vanilla-flag',
  'product.c6a.sharpen',
  'product.c6a.cut-marks',
  'product.c6a.tells-flags',
  'product.c6a.critic',
  'product.c6a.final-tells-flags',
  // C7 Lean Diff
  'product.c7.interview',
  'product.c7.implement',
  'product.c7.defect-check',
  'product.c7.fix-defects',
  'product.c7.scope-cut',
  'product.c7.apply-scope-cut',
  'product.c7.reviewer',
  'product.c7.review-fix',
  'product.c7.bloat-cut',
  'product.c7.apply-bloat-cut',
  'product.c7.tells-sweep',
  'product.c7.apply-swaps',
] as const;

/** Runner helper calls, by the purpose they answer (spec §3.3): purpose `<helper>:<medium>` renders `helper.<helper>`. */
export const HELPER_PROMPTS = {
  'asset.briefs': 'helper.asset.briefs',
  'asset.integrate': 'helper.asset.integrate',
  'voice.apply': 'helper.voice.apply',
  rerank: 'helper.rerank',
} as const;

/** Advisor calls: the purpose and the prompt id are the same. */
export const ADVISOR_PROMPT_IDS = ['advisor.intake', 'advisor.compose', 'advisor.compose.repair'] as const;

/** Tell catalogs: one per medium (the default for a sweep) and one per catalog domain of 01 TELLS. */
export const TELLS_MEDIUM_IDS = MEDIA.map((m) => `tells.${m}`);
export const TELLS_DOMAIN_IDS = TELLS_DOMAINS.map((d) => `tells.${d}`);

export const PROMPT_IDS: readonly string[] = [
  ...RECIPE_PROMPT_IDS,
  ...Object.values(HELPER_PROMPTS),
  ...ADVISOR_PROMPT_IDS,
  ...TELLS_MEDIUM_IDS,
  ...TELLS_DOMAIN_IDS,
];

/**
 * The catalogs a TELLS sweep's `tells` slot is filled from: the step's `knobs.domains` when it names them (C3 sweeps
 * four prose catalogs, C6a only fiction), else the medium's catalog. Render each id and join the texts.
 */
export function tellsPromptIds(medium: Medium, domains?: readonly TellsDomain[]): string[] {
  return domains?.length ? domains.map((d) => `tells.${d}`) : [`tells.${medium}`];
}
