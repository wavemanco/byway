/**
 * Prompt templates (implemented by @byway/prompts). The runner and the advisor render prompts through this
 * interface so they can be built and tested before the templates exist (tests inject a fake).
 *
 * Prompt ids:
 * - recipe steps: the step's `prompt` field (`article.*`, `runbook.*`, `product.<config>.<step-id>`);
 * - helpers: `helper.asset.briefs`, `helper.asset.integrate`, `helper.voice.apply`, `helper.rerank`,
 *   `advisor.intake`, `advisor.compose`, `advisor.compose.repair`;
 * - tell catalogs (the TELLS sweep's `tells` port): `tells.<medium>`.
 * A template may vary by medium; `render` receives the medium as a slot.
 */

export const PROMPT_SLOTS = [
  /** The user's problem (the `intent` port), with brief fields. */
  'problem',
  'brief',
  /** The current artifact's text (HTML, Markdown, JSON, diff). Never given to judging steps (port rule 1). */
  'artifact',
  /** A text view of the artifact as its audience meets it (text media); screenshot views are attached images instead. */
  'view',
  'critique',
  'taste',
  'voice',
  /** The tell catalog text — only TELLS sweep templates may use it (port rule 7). */
  'tells',
  /** The random string for SEED steps — only SEED templates may use it (port rule 3). */
  'seed',
  'medium',
  /** Loop round number, 1-based. */
  'round',
  /** A rendered list of options or candidates with labels. */
  'options',
  /**
   * References. For a GREAT-mode critic: the number of references R as digits (non-blank selects GREAT mode; blank
   * means OK mode, ADR-0071); reference texts or images travel in the lineup.
   */
  'refs',
  /** Image URLs and alt texts for ASSET integration. */
  'images',
  /**
   * For a GREAT-mode critic: "M items, labelled A–X". The critic is never told which item is ours (06-runbook);
   * it ranks the whole lineup and the runner finds our rank (ADR-0072).
   */
  'labels',
  /** Advisor: the chooser questions, the block registry, the nearest recipe, validator violations. */
  'questions',
  'blocks',
  'nearest',
  'violations',
  /** C6/C6a: the author's draft. C3: earlier pieces in the series. */
  'draft',
  'series',
] as const;
export type PromptSlot = (typeof PROMPT_SLOTS)[number];

export interface RenderedPrompt {
  id: string;
  version: number;
  /** "sha256:<hex>" of the template file, recorded with every call. */
  hash: string;
  /** How faithful the text is to its source: the article verbatim, a paraphrase of it, or written by the project. */
  fidelity: 'verbatim' | 'paraphrase' | 'project';
  system?: string;
  user: string;
}

export interface PromptRenderer {
  has(id: string): boolean;
  /** Throws if the template is unknown or a slot it uses is missing. */
  render(id: string, slots: Partial<Record<PromptSlot, string>>): RenderedPrompt;
}
