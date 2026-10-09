import { changesWork, voiceArm, type Recipe } from '@byway/recipe';
import type { Findings } from '../context.ts';
import { flowRecipe } from '../flow.ts';

interface VoiceState {
  /** Human copy came in as a recipe input (a fixed copy deck). */
  fromInput: boolean;
  /** A VOICE step may already have written human copy on some path. */
  fromStep: boolean;
}

/**
 * PR6, human voice is locked: no machine write may run once human copy may exist on any path, unless it is declared
 * to keep that copy verbatim (`keepsVoice`, which the runner enforces by diff). The lock guards the owner's words
 * against later automated passes (01 VOICE: "Later passes overwrite the copy. Lock it."); the owner editing their
 * own words is not a write over them, so human writers are exempt. The clause says where the copy came from, so
 * SM-6 (a fixed deck) cannot hide a model writing over a human VOICE step's copy.
 *
 * Both halves read what runs, not what is declared (ADR-0092): the lock arms on an executed VOICE write (or a step that
 * declares one, since a declaration may only add), and a step is a writer by its role and actor wherever its output
 * reaches the work, whatever its `writes` flag says. A writer inside an audit lens or a gate body changes nothing,
 * unless it declares that it does.
 */
export function checkVoiceLock(recipe: Recipe, findings: Findings): void {
  flowRecipe<VoiceState>(recipe, { fromInput: recipe.inputs.includes('voice'), fromStep: false }, {
    step(step, path, _stage, state, contained) {
      const overwrites = step.actor !== 'human' && changesWork(step, contained) && !step.keepsVoice;
      if (overwrites && (state.fromInput || state.fromStep)) {
        findings.add(
          'PR6',
          path,
          `step "${step.id}" writes to the artifact after human copy ${state.fromStep ? 'from a VOICE step' : 'from the fixed copy deck'} may exist`,
          state.fromStep ? 'voice-step' : 'fixed-input',
        );
      }
      return !contained && voiceArm(step) ? { ...state, fromStep: true } : state;
    },
    join(states) {
      return { fromInput: states.some((s) => s.fromInput), fromStep: states.some((s) => s.fromStep) };
    },
  });
}
