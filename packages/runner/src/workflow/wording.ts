/**
 * What the run asks a person, in plain words (spec §5: plain by default, no protocol jargon). Pure: workflow code.
 */
import type { CheckpointKind } from '@byway/contracts';
import type { Step } from '@byway/recipe';

/** Human checkpoint kinds by role (spec §3.2): vision → react, cut → directive, tells-compare → compare, voice → write. */
export function humanKind(step: Pick<Step, 'role'>): CheckpointKind {
  switch (step.role) {
    case 'vision':
      return 'react';
    case 'cut':
      return 'directive';
    case 'tells-compare':
      return 'compare';
    case 'voice':
    case 'build':
    case 'fix':
      // VOICE, and the author's own draft in C3, C6 and C6a.
      return 'write';
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

export const optionalPrompt = (trigger: string): string => `Run this step? It is meant for when ${trigger.replace(/[.\s]+$/, '')}.`;
export const routePrompt = (on: string): string => `Choose: ${on.replace(/[.\s]+$/, '')}.`;
export const READY_PROMPT = 'Is this ready?';
export const BEST_SO_FAR_PROMPT = 'Use the best version so far?';
export const NOT_CONVERGING_PROMPT = 'The outside critique is not improving the work. Keep going anyway?';
export const GATE_FAILED_PROMPT = 'It did not pass the final check, even after another try. Use it anyway?';
export const GATE_RETRY_NOTE = 'It did not pass the final check, so the earlier stage runs again with the same brief.';
export const budgetPrompt = (amountUsd: number, scope: 'run' | 'workspace'): string =>
  scope === 'workspace' ? `Raise the workspace budget by $${amountUsd}?` : `Raise the budget by $${amountUsd}?`;
/** A fix after an empty CUT directive ("Nothing to remove."): it makes no change, and its step says so. */
export const NOTHING_TO_REMOVE = 'Nothing to remove';
