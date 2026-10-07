import type { Recipe } from '@byway/recipe';
import type { Findings } from '../context.ts';
import { flowRecipe } from '../flow.ts';

interface VoiceState {
  /** Human copy came in as a recipe input (a fixed copy deck). */
  fromInput: boolean;
  /** A VOICE step may already have written human copy on some path. */
  fromStep: boolean;
}

/**
 * PR6, human voice is locked: no writing step may run once human copy may exist on any path. The clause says
 * where the copy came from, so SM-6 (a fixed deck) cannot hide a model writing over a human VOICE step's copy.
 */
export function checkVoiceLock(recipe: Recipe, findings: Findings): void {
  flowRecipe<VoiceState>(recipe, { fromInput: recipe.inputs.includes('voice'), fromStep: false }, {
    step(step, path, _stage, state) {
      if (step.writes && (state.fromInput || state.fromStep)) {
        findings.add(
          'PR6',
          path,
          `step "${step.id}" writes to the artifact after human copy ${state.fromStep ? 'from a VOICE step' : 'from the fixed copy deck'} may exist`,
          state.fromStep ? 'voice-step' : 'fixed-input',
        );
      }
      return step.produces.includes('voice') ? { ...state, fromStep: true } : state;
    },
    join(states) {
      return { fromInput: states.some((s) => s.fromInput), fromStep: states.some((s) => s.fromStep) };
    },
  });
}
