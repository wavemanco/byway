import { randomBytes } from 'node:crypto';
import type { Gateway, ProblemBrief } from '@byway/contracts';
import type { PromptLibrary } from '@byway/prompts';
import { problemSlot } from '@byway/prompts/pure';
import { parseRecipe, RECIPE_SCHEMA_ID, withHash, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { z } from 'zod';
import { fromTemplate, truncation } from './ask.ts';
import { blocksListing } from './blocks.ts';
import { checkComposedProfile, COMPOSED_RULES } from './profile.ts';
import { answerJson, ContractError, jsonSlot } from './text.ts';

/**
 * The composer (product spec §4, ADR-0058): design-time only. A model gets the block registry and the nearest
 * canonical recipe and answers with a `byway.recipe/1` object; the advisor forces what is not the model's to decide
 * (channel, kind, family, id), validates it with @byway/validator and the composed profile, sends violations back for
 * at most two repairs, and offers the recipe only when it validates.
 */

export const COMPOSE_PROMPT = 'advisor.compose';
export const REPAIR_PROMPT = 'advisor.compose.repair';
export const MAX_REPAIRS = 2;
/** Designing a recipe is judgment, so it runs at the big tier (default rule 5). */
export const COMPOSE_TIER = 'big' as const;
/** A recipe as JSON runs to a few thousand tokens (C5's is the longest); the allowance leaves room for reasoning. */
export const COMPOSE_MAX_OUTPUT_TOKENS = 16000;

export interface Violation {
  ruleId: string;
  /** Which clause of the rule, when the validator names one (e.g. ST12 'writer-undeclared'). */
  clause?: string;
  /** Where in the recipe, when known. */
  path?: string;
  message: string;
}

export interface Candidate {
  /** The recipe as the advisor would register it, when the answer parsed against the schema. */
  recipe?: Recipe;
  /**
   * The answer's JSON object with the forced fields applied (and no hash), whether or not it met the schema: what a
   * repair is shown as the recipe that failed. Undefined when the answer held no JSON object.
   */
  draft?: Record<string, unknown>;
  violations: Violation[];
}

export interface ComposeDeps {
  gateway: Gateway;
  /** The templates: rendered for the composer, and read by the composed profile (a reused prompt's contract and slots). */
  prompts: PromptLibrary;
  /** The canonical recipes: their blocks' wiring goes into the prompt, and their step prompts may be reused. */
  catalog: readonly Recipe[];
  newId?: () => string;
}

export const freshComposedId = (): string => `composed-${randomBytes(6).toString('hex')}`;

/**
 * Fields forced on whatever the model returned: a composed recipe lives on the workspace channel as kind 'composed'
 * in its nearest recipe's family (so only that family's declared exceptions can apply), under a fresh id. A `hash` or
 * `parent` the model wrote is dropped: the advisor hashes the result itself, and a composed recipe is not a registered
 * derivation of anything (claiming one could suspend rules). Missing housekeeping fields default from the nearest
 * recipe, so a model that leaves out `inputs` or `bank` does not spend a repair on it.
 */
export function forceComposed(raw: Record<string, unknown>, nearest: Recipe, id: string): Record<string, unknown> {
  const { hash: _hash, parent: _parent, ...rest } = raw;
  return {
    ...rest,
    schema: RECIPE_SCHEMA_ID,
    id,
    kind: 'composed',
    channel: 'workspace',
    family: nearest.family,
    title: typeof rest.title === 'string' && rest.title.trim() ? rest.title : `Composed from ${nearest.title}`,
    ...(rest.medium === undefined && nearest.medium ? { medium: nearest.medium } : {}),
    inputs: rest.inputs ?? nearest.inputs,
    sitsOut: rest.sitsOut ?? [],
    exceptions: rest.exceptions ?? [],
    bank: rest.bank ?? true,
  };
}

const MAX_SCHEMA_ISSUES = 12;

/** Validator violations at a knob path that the composed profile also reports there are dropped (same finding, once). */
function merge(validator: Violation[], profile: Violation[]): Violation[] {
  const knobPaths = new Set(profile.filter((v) => v.ruleId === COMPOSED_RULES.knob).map((v) => v.path));
  return [...validator.filter((v) => !(v.ruleId === 'ST7' && v.path !== undefined && knobPaths.has(v.path))), ...profile];
}

/**
 * Parse, force, schema-check, validate and profile-check one composer answer. Never throws for what the answer holds:
 * anything the checks themselves cannot handle (a pathological shape, say) is reported as COMPOSED-INTERNAL, so the
 * answer is refused rather than the compose call failing.
 */
export function checkAnswer(text: string, nearest: Recipe, deps: Pick<ComposeDeps, 'prompts' | 'catalog'>, id: string): Candidate {
  try {
    return checkAnswerUnguarded(text, nearest, deps, id);
  } catch (e) {
    return { violations: [{ ruleId: COMPOSED_RULES.internal, message: `the recipe could not be checked, so it cannot be offered: ${e instanceof Error ? e.message : String(e)}` }] };
  }
}

function checkAnswerUnguarded(text: string, nearest: Recipe, deps: Pick<ComposeDeps, 'prompts' | 'catalog'>, id: string): Candidate {
  let raw: unknown;
  try {
    raw = answerJson(text);
  } catch (e) {
    if (!(e instanceof ContractError)) throw e;
    return { violations: [{ ruleId: 'FORMAT', message: e.message }] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { violations: [{ ruleId: 'FORMAT', message: 'the answer must be one JSON object holding a byway.recipe/1 recipe' }] };

  const draft = forceComposed(raw as Record<string, unknown>, nearest, id);
  let recipe: Recipe;
  try {
    recipe = withHash(parseRecipe(draft));
  } catch (e) {
    if (!(e instanceof z.ZodError)) throw e;
    return {
      draft,
      violations: e.issues.slice(0, MAX_SCHEMA_ISSUES).map((i) => ({ ruleId: 'SCHEMA', path: i.path.map(String).join('.') || '(recipe)', message: i.message })),
    };
  }
  const verdict = validate(recipe);
  const fromValidator: Violation[] = verdict.violations.map((v) => ({ ruleId: v.ruleId, ...(v.clause ? { clause: v.clause } : {}), path: v.path, message: v.message }));
  const fromProfile: Violation[] = checkComposedProfile(recipe, { nearest, catalog: deps.catalog, prompts: deps.prompts });
  return { recipe, draft, violations: merge(fromValidator, fromProfile) };
}

/** The `violations` slot: one line per violation, with its rule and place. */
export function violationsSlot(violations: readonly Violation[]): string {
  return violations.map((v) => `- ${v.ruleId}${v.clause ? ` (${v.clause})` : ''}${v.path ? ` at ${v.path}` : ''}: ${v.message}`).join('\n');
}

export interface ComposeOutcome {
  /** The last answer that parsed as a recipe (the offered one when ok). */
  recipe?: Recipe;
  ok: boolean;
  violations: Violation[];
}

/**
 * The repair's `artifact` slot: the recipe that failed, as the advisor read it (forced fields applied, no hash), so the
 * model repairs what would actually be registered. An answer that held no JSON object goes in as a JSON string of its
 * text: the template fences the slot as json, and the model still sees what it wrote.
 */
export function failedSlot(answer: string, candidate: Candidate): string {
  return jsonSlot(candidate.draft ?? answer);
}

/**
 * Compose a recipe near `nearest`: one compose call and up to two repairs. Each repair is a fresh call rendered from
 * the repair template, which carries everything it needs (the problem, the blocks, the nearest recipe, the recipe that
 * failed and the violations). A fresh turn rather than a continued conversation keeps the ledger's prompt ref true to
 * what was sent, and does not pay for the blocks and the nearest recipe twice.
 */
export async function composeRecipe(deps: ComposeDeps, problem: ProblemBrief, nearest: Recipe, opts: { workspaceId: string; profileId: string }): Promise<ComposeOutcome> {
  // The templates fence the nearest recipe as json themselves, so the slot is the bare JSON.
  const slots = { problem: problemSlot(problem), blocks: blocksListing(deps.catalog), nearest: jsonSlot(nearest) };
  const id = (deps.newId ?? freshComposedId)();
  let prompt = deps.prompts.render(COMPOSE_PROMPT, slots);
  let best: Candidate | undefined;
  let last: Candidate = { violations: [] };

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const result = await deps.gateway.complete({
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      purpose: attempt === 0 ? COMPOSE_PROMPT : REPAIR_PROMPT,
      tier: COMPOSE_TIER,
      ...fromTemplate(prompt),
      maxOutputTokens: COMPOSE_MAX_OUTPUT_TOKENS,
    });
    const cut = truncation(result);
    last = cut ? { violations: [{ ruleId: 'FORMAT', message: cut }] } : checkAnswer(result.text, nearest, deps, id);
    if (last.recipe) best = last;
    if (last.recipe && last.violations.length === 0) return { recipe: last.recipe, ok: true, violations: [] };
    if (attempt === MAX_REPAIRS) break;
    prompt = deps.prompts.render(REPAIR_PROMPT, { ...slots, artifact: failedSlot(result.text, last), violations: violationsSlot(last.violations) });
  }
  // Never offered: report the last recipe that parsed, with its own violations.
  return best?.recipe ? { recipe: best.recipe, ok: false, violations: best.violations } : { ok: false, violations: last.violations };
}
