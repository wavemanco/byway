/**
 * What the run asks a person, in plain words (spec §5: plain by default, no protocol jargon). Pure: workflow code.
 */
import type { CheckpointKind } from '@byway/contracts';
import type { Step } from '@byway/recipe';
import { HUMAN_WRITE_ROLES } from '@byway/recipe/semantics';
import { labelOf } from '@byway/prompts/pure';

/**
 * Human checkpoint kinds by role (spec §3.2): vision → react, cut → directive, tells-compare → compare, and a write for
 * the roles @byway/recipe's semantics names (VOICE, and the author's own draft in C3, C6 and C6a), so the runner and
 * admission read one list.
 */
export function humanKind(step: Pick<Step, 'role'>): CheckpointKind {
  if (HUMAN_WRITE_ROLES.has(step.role)) return 'write';
  switch (step.role) {
    case 'vision':
      return 'react';
    case 'cut':
      return 'directive';
    case 'tells-compare':
      return 'compare';
    default:
      return 'react';
  }
}

export function humanPrompt(step: Pick<Step, 'role' | 'variant' | 'produces' | 'knobs'>, round?: number): string {
  switch (step.role) {
    case 'vision':
      return step.produces.includes('brief')
        ? 'In a few lines, in your own words: what is this for, and what is the one point it must land?'
        : 'What pulls you here, what feels off, and what should the next version avoid?';
    case 'cut':
      return 'What should go? List what to remove, one item per line.';
    case 'tells-compare':
      return 'Keep the version from before the cliché sweep, or the one after the swaps?';
    case 'voice':
      if (step.variant === 'claim-log')
        return 'Sign off every number, date, name and causal claim below, one per line: correct any that is wrong, and your correction replaces it in the document. Leave just "-" on a line to take that claim out. You own them.';
      if (step.variant === 'VOICE-early') return 'Write the script yourself: change any line below. It is locked after this, and used exactly as you write it.';
      if (step.knobs?.scope === 'key-lines') return 'Rewrite the key lines yourself: the ask and the lines a reader acts on. Your lines are used exactly as you write them.';
      return 'Write the words yourself: change any line below. Your lines are used exactly as you write them.';
    case 'build':
    case 'fix':
      return round && round > 1 ? 'Revise your draft. The readers’ notes are beside it.' : 'Write your draft. Every sentence is yours.';
    default:
      return 'What do you think? Your answer guides the next step.';
  }
}

/** A recipe's trigger, said to the person it is about ("a human calls the design plain" → "you call the design plain"). */
const toYou = (trigger: string): string => trigger.replace(/^(?:a|the) (?:human|person|user) (\w+?)s\b/i, 'you $1');

/**
 * "Run this step?" for an optional, saying what each answer does (UX-4). Inside a candidate (C1 asks once per draft)
 * it names the draft, by the letter the pick will show it under.
 */
export const optionalPrompt = (trigger: string, candidate?: number): string =>
  `Run this step${candidate !== undefined ? ` on draft ${labelOf(candidate)}` : ''}? It is meant for when ${toYou(trigger.replace(/[.\s]+$/, ''))}. Yes runs it; No skips it.`;
/** The note of an optional the person declined (UX-1, convention C1): the step is shown as skipped, with this. */
export const DECLINED_NOTE = 'You chose not to run this step.';
export const routePrompt = (on: string): string => `Choose: ${on.replace(/[.\s]+$/, '')}.`;
/** A person's loop gate, saying what each answer does (UX-4): No is another round, not a stop. */
export const READY_PROMPT = 'Is this ready? Yes keeps this version and moves on; No starts another round.';
export const BEST_SO_FAR_PROMPT = 'Use the best version so far?';
/**
 * A person's loop at its last planned round (ADR-0093): their answer, not the cap, ends it. No allows the planned number
 * of rounds again, once.
 */
export const humanCapPrompt = (more: number): string => `That was the last planned round. Use this version? No allows up to ${more} more round${more === 1 ? '' : 's'}, once.`;
/** A person's loop at its raised cap: no more rounds, so they keep this version or stop the run. */
export const FINAL_CHOICE_PROMPT = 'That was the last round. Use this version, or stop the run?';
export const FINAL_CHOICE_OPTIONS = [
  { id: 'use', label: 'Use this version' },
  { id: 'stop', label: 'Stop the run' },
] as const;
/** What a run stopped at a loop's last choice says: nothing failed, the person ended it. */
export const STOPPED_AT_CAP = 'You stopped the run at the last round.';
export const NOT_CONVERGING_PROMPT = 'The outside critique is not improving the work. Keep going anyway?';
export const GATE_FAILED_PROMPT = 'It did not pass the final check, even after another try. Use it anyway?';
export const GATE_RETRY_NOTE = 'It did not pass the final check, so the earlier stage runs again with the same brief.';
export const budgetPrompt = (amountUsd: number, scope: 'run' | 'workspace'): string =>
  scope === 'workspace' ? `Raise the workspace budget by $${amountUsd}?` : `Raise the budget by $${amountUsd}?`;
/** A fix after an empty CUT directive ("Nothing to remove."): it makes no change, and its step says so. */
export const NOTHING_TO_REMOVE = 'Nothing to remove';
/** TELLS decided hit by hit (TELLS-1, convention C2): which of the sweep's hits the swap step acts on. */
export const SWAPS_PROMPT = 'Which of these should be swapped? Choose any, or none.';
/** The swap step when the person chose none of the hits: it makes no change, and says so (convention C2). */
export const NO_SWAPS_CHOSEN = 'No swaps chosen';
/** The swap step when the sweep found nothing: no question, no change. */
export const NOTHING_TO_SWAP = 'Nothing to swap: the sweep found no clichés';
/** A keep-or-revert after a swap step that changed nothing: both versions are the same, so nobody is asked. */
export const NOTHING_TO_COMPARE = 'Nothing was swapped, so there was nothing to compare';
