/**
 * What the route handlers do, as plain functions over the services. The route files only parse requests and
 * turn results into responses, so this logic is tested directly against the demo services (no server, no
 * network). Errors meant for people are HttpErrors with a status and a plain-language message.
 *
 * Everything here goes through the four contracts: intakes and preferences live in the Store, recipes come from
 * Advisor.recipe (or the intake's composed recipe), and pause and resume are the Runner's.
 */
import { randomUUID } from 'node:crypto';
import type { ChooserAnswer, ComposeResult, EvidenceLabel, IntakeRecord, Preferences, Recommendation, RecipePresentation, RunRecord } from '@byway/contracts';
import type { Recipe } from '@byway/recipe';
import type { z } from 'zod';
import type { Services } from '../services/index.ts';
import { budgetProblem, workspaceSpend } from '../view/history.ts';
import { takesRefs } from '../view/refs.ts';
import { isEnded } from '../view/run.ts';
import { stepIndex, type StepIndex } from '../view/steps.ts';
import { artifactHeaders, isArtifactId } from './artifacts.ts';
import { RefError, storeRef } from './refs.ts';
import type { ControlInput, ProblemInput, RefInput, ResolutionInput, SettingsPatch, StartInput } from './schemas.ts';

export class HttpError extends Error {
  override name = 'HttpError';
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Deps {
  services: Services;
  workspaceId: string;
  /** The model profile runs use (Store preferences). */
  profileId: string;
}

async function requireIntake(deps: Deps, intakeId: string): Promise<IntakeRecord> {
  const intake = await deps.services.store.getIntake(intakeId);
  if (!intake || intake.workspaceId !== deps.workspaceId) throw new HttpError(404, 'That problem was not found. Describe it again on Start.');
  return intake;
}

export async function createIntake(deps: Deps, input: z.infer<typeof ProblemInput>): Promise<{ intakeId: string }> {
  if (input.recipeId && !deps.services.advisor.recipe(input.recipeId)) throw new HttpError(404, 'That recipe is not in the library.');
  const attachments = (input.attachments ?? []).filter((a) => a.text.trim().length > 0);
  const intake = await deps.services.store.createIntake({
    id: randomUUID(),
    workspaceId: deps.workspaceId,
    problem: { text: input.text.trim(), ...(attachments.length > 0 ? { attachments } : {}) },
  });
  return { intakeId: intake.id };
}

/**
 * Recommends for the intake's problem. Answers you flipped are passed in and routing re-runs; the answers and the
 * recommendation are kept on the intake, so coming back to the screen shows them as you left them.
 */
export async function recommendIntake(deps: Deps, intakeId: string, answers?: ChooserAnswer[]): Promise<Recommendation> {
  const intake = await requireIntake(deps, intakeId);
  const given = answers ?? intake.answers;
  const rec = await deps.services.advisor.recommend(intake.problem, {
    workspaceId: deps.workspaceId,
    profileId: deps.profileId,
    ...(given ? { answers: given } : {}),
  });
  await deps.services.store.updateIntake(intakeId, { answers: rec.answers, recommendation: rec });
  return rec;
}

/** The intake's recommendation as last made, or a fresh one the first time. */
export async function currentRecommendation(deps: Deps, intakeId: string): Promise<Recommendation> {
  const intake = await requireIntake(deps, intakeId);
  return intake.recommendation ?? recommendIntake(deps, intakeId);
}

/** What the browser sees of a composed recipe; the recipe itself stays on the server with the intake. */
export type ComposeView = Omit<ComposeResult, 'recipe'> & {
  /** Whether it takes your examples (the "Examples you admire" field). */
  takesRefs: boolean;
};

export function composeView(result: ComposeResult): ComposeView {
  const { recipe, ...view } = result;
  return { ...view, takesRefs: takesRefs(recipe) };
}

export async function composeIntake(deps: Deps, intakeId: string): Promise<ComposeView> {
  const intake = await requireIntake(deps, intakeId);
  const result = await deps.services.advisor.compose(intake.problem, { workspaceId: deps.workspaceId, profileId: deps.profileId });
  await deps.services.store.updateIntake(intakeId, { composed: result });
  return composeView(result);
}

/** Stores one of your examples before the run starts; the run gets its artifact id (StartRunInput.inputs.refs). */
export async function addRef(deps: Deps, input: z.infer<typeof RefInput>): Promise<{ artifactId: string; mediaType: string }> {
  try {
    return await storeRef(deps.services.store, input);
  } catch (err) {
    if (err instanceof RefError) throw new HttpError(400, err.message);
    throw err;
  }
}

export async function startRun(deps: Deps, input: z.infer<typeof StartInput>): Promise<{ runId: string }> {
  const intake = await requireIntake(deps, input.intakeId);
  const { services } = deps;
  let recipe: Recipe | undefined;
  if (input.recipeId) {
    recipe = services.advisor.recipe(input.recipeId);
    if (!recipe) throw new HttpError(404, 'That recipe is not in the library.');
  } else {
    if (!intake.composed) throw new HttpError(400, 'Choose a recipe, or build your own first.');
    // Only a recipe that validates is ever offered (spec §4).
    if (!intake.composed.ok) throw new HttpError(400, 'The composed recipe did not pass the protocol checks, so it cannot run.');
    recipe = intake.composed.recipe;
  }
  const refs = input.refs ?? [];
  if (refs.length > 0) {
    if (!takesRefs(recipe)) throw new HttpError(400, 'This recipe does not use examples. Remove them, or choose another recipe.');
    for (const id of refs) {
      if (!(await services.store.artifacts.has(id))) throw new HttpError(400, 'One of your examples was not found. Add it again.');
    }
  }
  const workspace = await services.store.ensureDefaultWorkspace();
  const spend = workspaceSpend(workspace.budgetUsd, await services.store.listRuns(workspace.id));
  const problem = budgetProblem(input.budgetUsd, spend);
  if (problem) throw new HttpError(400, problem);
  const run = await services.runner.start({
    workspaceId: workspace.id,
    recipe,
    problem: intake.problem,
    profileId: deps.profileId,
    budgetUsd: input.budgetUsd,
    intakeId: intake.id,
    ...(input.routes ? { routes: input.routes } : {}),
    ...(refs.length > 0 ? { inputs: { refs: [...new Set(refs)] } } : {}),
  });
  return { runId: run.id };
}

export interface RunRecipe {
  presentation?: RecipePresentation;
  label?: EvidenceLabel;
  recipe?: Recipe;
  /** Run events → plain step labels (view/steps.ts), when the presentation is known. */
  steps?: StepIndex;
}

/**
 * How a run's recipe is presented: catalog recipes from the advisor, with a computed label; composed ones from the
 * intake the run started from (RunRecord.intakeId), which keeps the composed recipe, its presentation and its label.
 * Unknown gives neither, rather than a guess.
 */
export async function recipeForRun(deps: Deps, run: RunRecord): Promise<RunRecipe> {
  const { advisor, store } = deps.services;
  const recipe = advisor.recipe(run.recipeId);
  const presentation = advisor.catalog().find((p) => p.recipeId === run.recipeId);
  if (recipe && presentation) return { presentation, label: advisor.label(recipe), recipe, steps: stepIndex(presentation, recipe) };
  const composed = run.intakeId ? (await store.getIntake(run.intakeId))?.composed : undefined;
  if (composed && composed.recipe.id === run.recipeId) {
    return { presentation: composed.presentation, label: composed.label, recipe: composed.recipe, steps: stepIndex(composed.presentation, composed.recipe) };
  }
  return {};
}

export async function resolveInRun(deps: Deps, runId: string, checkpointId: string, input: z.infer<typeof ResolutionInput>): Promise<void> {
  const cp = await deps.services.store.getCheckpoint(checkpointId);
  if (!cp || cp.runId !== runId) throw new HttpError(404, 'That question was not found in this run.');
  if (cp.status !== 'open') throw new HttpError(409, 'That question has already been answered.');
  const run = await deps.services.store.getRun(runId);
  if (run && isEnded(run.status)) throw new HttpError(409, 'This run has ended, so it takes no more answers.');
  try {
    await deps.services.runner.resolve({
      checkpointId,
      ...(input.choice ? { choice: input.choice } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.approved !== undefined ? { approved: input.approved } : {}),
    });
  } catch (err) {
    throw new HttpError(400, err instanceof Error && err.message ? err.message : 'That answer was not accepted.');
  }
}

/** Pause, resume or cancel: the Runner's own controls. A run that has ended stays as it ended. */
export async function controlRun(deps: Deps, runId: string, action: z.infer<typeof ControlInput>['action']): Promise<void> {
  const { runner, store } = deps.services;
  const run = await store.getRun(runId);
  if (!run) throw new HttpError(404, 'Run not found.');
  if (isEnded(run.status)) throw new HttpError(409, 'This run has already ended.');
  if (action === 'cancel') return runner.cancel(runId);
  return action === 'pause' ? runner.pause(runId) : runner.resume(runId);
}

/** Settings: the profile, demo mode and technical names are Store preferences; the budget is the workspace's. */
export async function updateSettings(deps: Deps, patch: z.infer<typeof SettingsPatch>): Promise<Preferences> {
  const { gateway, store } = deps.services;
  if (patch.profileId !== undefined && !gateway.profileStatus().some((s) => s.profile.id === patch.profileId)) {
    throw new HttpError(400, `There is no model profile called "${patch.profileId}".`);
  }
  if (patch.workspaceBudgetUsd !== undefined) await store.updateWorkspace(deps.workspaceId, { budgetUsd: patch.workspaceBudgetUsd });
  return store.setPreferences(deps.workspaceId, {
    ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
    ...(patch.demoMode !== undefined ? { demoMode: patch.demoMode } : {}),
    ...(patch.showTechnicalNames !== undefined ? { showTechnicalNames: patch.showTechnicalNames } : {}),
  });
}

/**
 * The artifact route: content-addressed bytes, with the sandboxing headers of src/server/artifacts.ts. `origin`
 * is the one the browser used (from the Host header the guard has already checked), because the CSP must name
 * it exactly: Next.js may report a normalised host in the request URL (localhost for 127.0.0.1).
 */
export async function artifactResponse(services: Services, rawId: string, url: URL, origin: string = url.origin): Promise<Response> {
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // Not percent-encoded; use as is.
  }
  if (!isArtifactId(id)) return new Response('Not a valid artifact id.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!(await services.store.artifacts.has(id))) return new Response('Artifact not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const { record, bytes } = await services.store.artifacts.get(id);
  const download = url.searchParams.get('download') === '1' ? (url.searchParams.get('name') ?? 'byway-result').slice(0, 200) : undefined;
  return new Response(new Uint8Array(bytes), { status: 200, headers: artifactHeaders(record.mediaType, origin, download) });
}
