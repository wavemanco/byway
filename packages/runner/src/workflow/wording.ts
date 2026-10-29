/**
 * What the run asks a person, in plain words (spec §5: plain by default, no protocol jargon). Pure: workflow code.
 */
import type { CheckpointKind, Medium } from '@byway/contracts';
import type { Step } from '@byway/recipe';
import { HUMAN_WRITE_ROLES, voiceScope } from '@byway/recipe/semantics';
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

/**
 * The text port a person's step revises in place (ADR-0090): a reaction (humanKind 'react') that both consumes and
 * produces the same text port, as C7's spec answers the interview's questions in the brief they came in. Its checkpoint
 * opens with the port's text, and the answer replaces the port, so the questions, the answers and the defaults the
 * person left alone travel on together. Keyed on the step's shape, not on a recipe.
 */
export function revisesInPlace(step: Pick<Step, 'role' | 'consumes' | 'produces'>): 'brief' | 'taste' | undefined {
  if (humanKind(step) !== 'react') return undefined;
  return (['brief', 'taste'] as const).find((p) => step.consumes.includes(p) && step.produces.includes(p));
}

/** A brief of questions with their defaults (C7's interview wrote it), answered in place: what C7's spec asks. */
export const SPEC_IN_PLACE_PROMPT =
  'Answer the questions below in place, or change their defaults; anything you leave as it is keeps its default. What you send is the brief the next step works from.';

/**
 * The prompts whose brief is a list of questions with their defaults (C7's spec interview). A person who revises that
 * brief in place answers them (SPEC_IN_PLACE_PROMPT); any other brief revised in place gets the general question, so the
 * question is keyed on where the brief came from (Ports.briefQuestions), not on the step that revises it (R-C7 in the P2
 * design). A list of prompt ids in workflow code is the simplest key (Claude's choice).
 */
export const QUESTION_BRIEF_PROMPTS: ReadonlySet<string> = new Set(['product.c7.interview']);

/** What a VOICE's question needs from the run: what the VOICE covers, and whether its script is locked after it. */
export interface VoiceContext {
  /** The run's medium: a storyboard's early VOICE writes its script (voiceScope). */
  medium?: Medium;
  /** Nothing the person writes later can change this script (@byway/recipe/semantics lockedScripts). */
  locked?: boolean;
  /**
   * A web page's VOICE with the work in front of it, whose lines the activity offers from the page: its question ends
   * with how a page's lines are written (PAGE_LINES_RULE), and the activity adds what it reads from the page after it.
   */
  page?: boolean;
}

/**
 * How a page's lines are written in a VOICE's box, the same for every page (ADR-0081): the one sentence of the page's
 * rules the workflow can say (R-SUFFIX in the P2 design). The rest (the bracket rule, where each link goes, the lines not
 * offered) is read from the page by the activity, since the copy code may never be bundled into the workflow, and follows
 * it, so the question as shown is what it was when the activity wrote all of it.
 */
export const PAGE_LINES_RULE = 'One line per block of text; leave a line empty to remove its text.';

/** A script VOICE that nothing later can change (lockedScripts): the only question that says the script is locked. */
export const SCRIPT_LOCKED_PROMPT = 'Write the script yourself: change any line below. It is locked after this, and used exactly as you write it.';
/** A script VOICE that the person can change later (a later script or claims VOICE, their own draft, or this step asked again): no lock is claimed. */
export const SCRIPT_PROMPT = 'Write the script yourself: change any line below. Your lines are used exactly as you write them.';

/**
 * What a person's step asks. `revising` is set when the step revises a text port in place (revisesInPlace) and that
 * port has text to revise: the question then says so, and the text is in the box. It is 'questions' when that text is a
 * brief of questions with their defaults (Ports.briefQuestions), which the person answers in place. A VOICE is asked by
 * what it covers in the run's medium, a script VOICE says it is locked only where `voice.locked` says so, and a page's
 * VOICE with its work in front of it ends with how the page's lines are written (`voice.page`).
 */
export function humanPrompt(step: Pick<Step, 'role' | 'variant' | 'produces' | 'consumes' | 'knobs'>, round?: number, revising: boolean | 'questions' = false, voice: VoiceContext = {}): string {
  const port = revising ? revisesInPlace(step) : undefined;
  if (port === 'brief')
    return revising === 'questions' ? SPEC_IN_PLACE_PROMPT : 'Revise this brief in place: change what you want and leave the rest. What you send is the brief the next step works from.';
  if (port === 'taste') return 'Revise this direction in place: change what you want and leave the rest. What you send is the direction the next step works from.';
  switch (step.role) {
    case 'vision':
      return step.produces.includes('brief')
        ? 'In a few lines, in your own words: what is this for, and what is the one point it must land?'
        : 'What pulls you here, what feels off, and what should the next version avoid?';
    case 'cut':
      return 'What should go? List what to remove, one item per line.';
    case 'tells-compare':
      return 'Keep the version from before the cliché sweep, or the one after the swaps?';
    case 'voice': {
      const asked = voiceQuestion(step, voice);
      return voice.page ? `${asked} ${PAGE_LINES_RULE}` : asked;
    }
    case 'build':
    case 'fix':
      return round && round > 1 ? 'Revise your draft. The readers’ notes are beside it.' : 'Write your draft. Every sentence is yours.';
    default:
      return 'What do you think? Your answer guides the next step.';
  }
}

/** A VOICE's question by what it covers in the run's medium (humanPrompt). */
function voiceQuestion(step: Pick<Step, 'variant' | 'knobs'>, voice: VoiceContext): string {
  const scope = voiceScope(step, voice.medium);
  if (scope.base === 'claims')
    return 'Sign off every number, date, name and causal claim below, one per line: correct any that is wrong, and your correction replaces it in the document. Leave just "-" on a line to take that claim out. You own them.';
  if (scope.base === 'script') return voice.locked ? SCRIPT_LOCKED_PROMPT : SCRIPT_PROMPT;
  if (scope.keyLines) return 'Rewrite the key lines yourself: the ask and the lines a reader acts on. Your lines are used exactly as you write them.';
  return 'Write the words yourself: change any line below. Your lines are used exactly as you write them.';
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
/** A gate with no retry: no other try ran, so the question does not say one did. */
export const GATE_FAILED_NO_RETRY_PROMPT = 'It did not pass the final check. Use it anyway?';
export const GATE_RETRY_NOTE = 'It did not pass the final check, so the earlier stage runs again with the same brief.';
export const budgetPrompt = (amountUsd: number, scope: 'run' | 'workspace'): string =>
  scope === 'workspace' ? `Raise the workspace budget by $${amountUsd}?` : `Raise the budget by $${amountUsd}?`;
/** A fix after an empty CUT directive ("Nothing to remove."): it makes no change, and its step says so. */
export const NOTHING_TO_REMOVE = 'Nothing to remove';
/**
 * A fix after an optional the person declined that would have put its critique in place (R-DECLINED): the critique is
 * left empty, so the fix makes no change, and its step says why, as after an empty CUT.
 */
export const DECLINED_CRITIQUE_NOTE = 'Nothing to apply: you chose not to run the step that would have said what to change';
/** TELLS decided hit by hit (TELLS-1, convention C2): which of the sweep's hits the swap step acts on. */
export const SWAPS_PROMPT = 'Which of these should be swapped? Choose any, or none.';
/** The swap step when the person chose none of the hits: it makes no change, and says so (convention C2). */
export const NO_SWAPS_CHOSEN = 'No swaps chosen';
/** The swap step when the sweep found nothing: no question, no change. */
export const NOTHING_TO_SWAP = 'Nothing to swap: the sweep found no clichés';
/** A keep-or-revert after a swap step that changed nothing: both versions are the same, so nobody is asked. */
export const NOTHING_TO_COMPARE = 'Nothing was swapped, so there was nothing to compare';
