/**
 * @byway/advisor (product spec §4): recommends one of the eight configurations through the chooser and an intake
 * model, composes a recipe from the blocks when none fits (ADR-0058), computes evidence labels from the study registry
 * (CR11) and estimates cost. `createAdvisor(...)` implements the `Advisor` contract from @byway/contracts.
 */
export { createAdvisor, type AdvisorCatalog, type AdvisorOptions } from './advisor.ts';
export { AdvisorError, type AdvisorErrorCode } from './errors.ts';
export { mergeAnswers, needsIntake } from './answers.ts';
export { MAX_ALTERNATIVES, route, STRONG_FIT, type Routed, type RoutedAnswer } from './routing.ts';
export { INTAKE_PROMPT, parseIntake, questionsSlot, routesFor, runIntake, type IntakeResult } from './intake.ts';
export { COMPOSE_PROMPT, REPAIR_PROMPT, MAX_REPAIRS, checkAnswer, composeRecipe, failedSlot, forceComposed, violationsSlot, type Candidate, type ComposeOutcome, type Violation } from './compose.ts';
export { alwaysRunSteps, catalogPrompts, checkComposedProfile, COMPOSED_RULES, type ProfileViolation } from './profile.ts';
export { blocksListing, describeKnob, portSignatures } from './blocks.ts';
export { diffFromNearest } from './diff.ts';
export { nodeIds, presentComposed, stepLabel, type ComposedCopy } from './present.ts';
export { COMPOSED_SUMMARY, isComposed, labelFor, STUDY_REGISTRY, UNTESTED_SUMMARY, type StudyEntry } from './registry.ts';
export {
  ARTIFACT_TOKENS,
  CLIP_SECONDS,
  estimateRecipe,
  HUMAN_MINUTES,
  PROMPT_TOKENS,
  STORYBOARD_SHOTS,
  TOKEN_ASSUMPTIONS,
  TOKEN_BAND,
  VIEW_TOKENS,
  type PricingContext,
} from './estimate.ts';
export { jsonSlot } from './text.ts';
