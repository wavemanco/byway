/**
 * What the route handlers do, as plain functions over the services. The route files only parse requests and
 * turn results into responses, so this logic is tested directly against the demo services (no server, no
 * network). Errors meant for people are HttpErrors with a status and a plain-language message.
 */
import type { ChooserAnswer, ComposeResult, EvidenceLabel, Recommendation, RecipePresentation, RunRecord } from '@byway/contracts';
import type { z } from 'zod';
import type { Preferences, Services } from '../services/index.ts';
import { budgetProblem, workspaceSpend } from '../view/history.ts';
import { artifactHeaders, isArtifactId } from './artifacts.ts';
import type { IntakeStore } from './intakes.ts';
import type { ControlInput, ProblemInput, ResolutionInput, SettingsPatch, StartInput } from './schemas.ts';

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
  intakes: IntakeStore;
  workspaceId: string;
  profileId: string;
}

function requireIntake(deps: Deps, intakeId: string) {
  const intake = deps.intakes.get(intakeId);
  if (!intake) throw new HttpError(404, 'That problem is no longer here (byway may have restarted). Describe it again on Start.');
  return intake;
}

export async function createIntake(deps: Deps, input: z.infer<typeof ProblemInput>): Promise<{ intakeId: string }> {
  if (input.recipeId && !deps.services.recipes.get(input.recipeId)) throw new HttpError(404, 'That recipe is not in the library.');
  const attachments = (input.attachments ?? []).filter((a) => a.text.trim().length > 0);
  const intake = deps.intakes.create({
    problem: { text: input.text.trim(), ...(attachments.length > 0 ? { attachments } : {}) },
    ...(input.recipeId ? { recipeId: input.recipeId } : {}),
  });
  return { intakeId: intake.id };
}

/** Recommends for the intake's problem; answers you flipped are passed back in and routing re-runs. */
export async function recommendIntake(deps: Deps, intakeId: string, answers?: ChooserAnswer[]): Promise<Recommendation> {
  const intake = requireIntake(deps, intakeId);
  return deps.services.advisor.recommend(intake.problem, {
    workspaceId: deps.workspaceId,
    profileId: deps.profileId,
    ...(answers ? { answers } : {}),
  });
}

/** What the browser sees of a composed recipe; the recipe itself stays on the server with the intake. */
export type ComposeView = Omit<ComposeResult, 'recipe'>;

export async function composeIntake(deps: Deps, intakeId: string): Promise<ComposeView> {
  const intake = requireIntake(deps, intakeId);
  const result = await deps.services.advisor.compose(intake.problem, { workspaceId: deps.workspaceId, profileId: deps.profileId });
  deps.intakes.setComposed(intakeId, result);
  const { recipe: _recipe, ...view } = result;
  return view;
}

export async function startRun(deps: Deps, input: z.infer<typeof StartInput>): Promise<{ runId: string }> {
  const intake = requireIntake(deps, input.intakeId);
  const { services } = deps;
  let recipe;
  if (input.recipeId) {
    recipe = services.recipes.get(input.recipeId);
    if (!recipe) throw new HttpError(404, 'That recipe is not in the library.');
  } else {
    if (!intake.composed) throw new HttpError(400, 'Choose a recipe, or build your own first.');
    // Only a recipe that validates is ever offered (spec §4).
    if (!intake.composed.ok) throw new HttpError(400, 'The composed recipe did not pass the protocol checks, so it cannot run.');
    recipe = intake.composed.recipe;
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
    ...(input.routes ? { routes: input.routes } : {}),
  });
  if (!input.recipeId && intake.composed) deps.intakes.rememberRun(run.id, { presentation: intake.composed.presentation, label: intake.composed.label });
  return { runId: run.id };
}

/**
 * How a run's recipe is presented: library recipes from the catalog with a computed label; composed ones as
 * remembered when they started. Unknown (a composed run after a restart) gives neither, rather than a guess.
 */
export function recipeForRun(deps: Deps, run: RunRecord): { presentation?: RecipePresentation; label?: EvidenceLabel } {
  const { services } = deps;
  const presentation = services.advisor.catalog().find((p) => p.recipeId === run.recipeId);
  const recipe = services.recipes.get(run.recipeId);
  if (presentation && recipe) return { presentation, label: services.advisor.label(recipe) };
  return deps.intakes.runRecipe(run.id) ?? {};
}

export async function resolveInRun(deps: Deps, runId: string, checkpointId: string, input: z.infer<typeof ResolutionInput>): Promise<void> {
  const cp = await deps.services.store.getCheckpoint(checkpointId);
  if (!cp || cp.runId !== runId) throw new HttpError(404, 'That question was not found in this run.');
  if (cp.status !== 'open') throw new HttpError(409, 'That question has already been answered.');
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

export async function controlRun(deps: Deps, runId: string, action: z.infer<typeof ControlInput>['action']): Promise<void> {
  const { services } = deps;
  if (!(await services.store.getRun(runId))) throw new HttpError(404, 'Run not found.');
  if (action === 'cancel') return services.runner.cancel(runId);
  if (!services.controls) throw new HttpError(400, 'This runner cannot pause runs.');
  return action === 'pause' ? services.controls.pause(runId) : services.controls.resume(runId);
}

export async function updateSettings(deps: Deps, patch: z.infer<typeof SettingsPatch>): Promise<Preferences> {
  const { services } = deps;
  if (patch.profileId !== undefined && !services.gateway.profiles().some((p) => p.id === patch.profileId)) {
    throw new HttpError(400, `There is no model profile called "${patch.profileId}".`);
  }
  if (patch.workspaceBudgetUsd !== undefined) await services.store.updateWorkspace(deps.workspaceId, { budgetUsd: patch.workspaceBudgetUsd });
  return services.preferences.set({
    ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
    ...(patch.demoMode !== undefined ? { demoMode: patch.demoMode } : {}),
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
