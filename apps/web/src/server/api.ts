/**
 * What the route handlers do, as plain functions over the services. The route files only parse requests and
 * turn results into responses, so this logic is tested directly against the real services on a temp folder, with a
 * fake Runner (no server, no network). Errors meant for people are HttpErrors with a status and a plain-language message.
 *
 * Everything here goes through the four contracts: intakes and preferences live in the Store, recipes come from
 * Advisor.recipe (or the intake's composed recipe), and pause and resume are the Runner's.
 */
import { randomUUID } from 'node:crypto';
import type { ChooserAnswer, ComposeResult, EvidenceLabel, IntakeRecord, Preferences, Recommendation, RecipePresentation, RunRecord, SpendRecords } from '@byway/contracts';
import type { Recipe } from '@byway/recipe';
import type { z } from 'zod';
import { isEngineUnavailable } from '../services/engine-runner.ts';
import type { Services } from '../services/index.ts';
import { budgetProblem, workspaceSpend, type WorkspaceSpend } from '../view/history.ts';
import { auditText } from '../view/spending.ts';
import { takesRefs } from '../view/refs.ts';
import { isEnded } from '../view/run.ts';
import { stepIndex, type StepIndex } from '../view/steps.ts';
import { artifactHeaders, isArtifactId, mediaServing } from './artifacts.ts';
import { exportsInline, selfContained } from './export.ts';
import { firstRecommendation } from './first-recommendation.ts';
import type { HeldKeyIn } from './http.ts';
import { modelProblem } from './model-errors.ts';
import { RefError, storeRef } from './refs.ts';
import type { ControlInput, ProblemInput, RecommendInput, RefInput, ResolutionInput, SettingsPatch, SpendAction, StartInput } from './schemas.ts';

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
  /** Names a provider key byway holds found in a request body (ADR-0088); routes hand it to parseBody. */
  heldKeyIn: HeldKeyIn;
}

/** Runs a model-backed advisor call; a model error becomes an HttpError the person can act on (UX-2). */
async function asking<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    const problem = modelProblem(err);
    if (problem) throw new HttpError(problem.status, problem.message);
    throw err;
  }
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
 * recommendation are kept on the intake, so coming back to the screen shows them as you left them. The route choices
 * the intake model read from the problem are passed back too, so a re-route with every answer given (no new intake
 * call) keeps them.
 */
export async function recommendIntake(deps: Deps, intakeId: string, answers?: ChooserAnswer[]): Promise<Recommendation> {
  const intake = await requireIntake(deps, intakeId);
  const given = answers ?? intake.answers;
  const routes = intake.recommendation?.routes;
  const rec = await asking(() =>
    deps.services.advisor.recommend(intake.problem, {
      workspaceId: deps.workspaceId,
      profileId: deps.profileId,
      ...(given ? { answers: given } : {}),
      ...(routes && Object.keys(routes).length > 0 ? { routes } : {}),
    }),
  );
  await deps.services.store.updateIntake(intakeId, { answers: rec.answers, recommendation: rec });
  return rec;
}

/**
 * The intake's recommendation as last made, or a fresh one the first time. Concurrent first asks for one intake (two
 * tabs, a reload, a render and Try again) share one advisor call (firstRecommendation, F03). Inside the shared call the
 * intake is read again, so an ask that arrives just after another call stored its answer gets that answer, not a second call.
 */
export async function currentRecommendation(deps: Deps, intakeId: string): Promise<Recommendation> {
  const intake = await requireIntake(deps, intakeId);
  if (intake.recommendation) return intake.recommendation;
  return firstRecommendation(deps.services.store, intakeId, async () => (await requireIntake(deps, intakeId)).recommendation ?? recommendIntake(deps, intakeId));
}

/**
 * For the Recommendation screen: the recommendation, or what stopped it in words, so a model error is shown on the
 * screen with a way forward instead of failing the whole screen. Nothing is stored on failure, so trying again asks
 * again.
 */
export async function recommendationOrProblem(deps: Deps, intakeId: string): Promise<{ recommendation: Recommendation } | { problem: string }> {
  try {
    return { recommendation: await currentRecommendation(deps, intakeId) };
  } catch (err) {
    if (err instanceof HttpError && err.status !== 404) return { problem: err.message };
    throw err;
  }
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
  const result = await asking(() => deps.services.advisor.compose(intake.problem, { workspaceId: deps.workspaceId, profileId: deps.profileId }));
  await deps.services.store.updateIntake(intakeId, { composed: result });
  return composeView(result);
}

/**
 * The workspace's budget, spend and what is left, as of now: settled spend, calls under way and calls that may have
 * been billed, from the spend book (ADR-0095).
 */
export async function workspaceRemaining(deps: Deps): Promise<WorkspaceSpend & { workspaceId: string }> {
  const workspace = await deps.services.store.ensureDefaultWorkspace();
  return { ...workspaceSpend(workspace.budgetUsd, await deps.services.gateway.spend(workspace.id)), workspaceId: workspace.id };
}

/**
 * Settings' "Check the spend ledger" (GET /api/ledger; ADR-0091, ADR-0095): the ledger's hash chain and head, and every
 * call the spend book holds as written there found at the same cost, checked when the person asks rather than on every
 * page. The gateway keeps the chain's result until the ledger or its head changes, so asking again is cheap.
 */
export async function checkLedger(deps: Deps): Promise<{ intact: boolean; message: string }> {
  const audit = await deps.services.gateway.auditLedger();
  return { intact: audit.brokenAt === null && audit.missing.length === 0, message: auditText(audit) };
}

/** Settings' "Spending records" (ADR-0095): calls under way, calls that may have been billed, faults, set-aside tails. */
export async function spendRecords(deps: Deps): Promise<{ records: SpendRecords; spend: WorkspaceSpend }> {
  const workspace = await deps.services.store.ensureDefaultWorkspace();
  const records = await deps.services.gateway.spendRecords(workspace.id);
  return { records, spend: workspaceSpend(workspace.budgetUsd, await deps.services.gateway.spend(workspace.id)) };
}

/**
 * The two Spending records actions (POST /api/spend): clear calls that may have been billed (the person checked them in
 * the provider's dashboard), or acknowledge a line of the audit file the book could not read, which lets paid calls go
 * on. Returns the records and spend as they are after it, so the screen applies them in one step.
 */
export async function spendAction(deps: Deps, input: z.infer<typeof SpendAction>): Promise<{ records: SpendRecords; spend: WorkspaceSpend }> {
  // Both are idempotent: a second click, or a call that settled meanwhile, simply finds nothing left to change.
  const book = deps.services.store.spendBook;
  if ('clear' in input) await book.clearUncertain(deps.workspaceId, input.clear);
  else await book.acknowledgeFault(input.acknowledge);
  return spendRecords(deps);
}

/**
 * What a Recommendation screen command returns: everything it changes that the screen shows, so the screen applies it
 * in one step and never re-runs its server render (F14, ADR-0082). That render is not a pure read: while no
 * recommendation is stored it asks the model for one, so re-running it to refresh a figure could make an unrequested call.
 * The remaining amount is read after the command, so it includes what the command itself spent.
 */
export interface RecommendResult {
  recommendation: Recommendation;
  remainingUsd: number;
}

export interface ComposeResultView {
  composed: ComposeView;
  remainingUsd: number;
}

/**
 * POST /recommend: `{ answers }` re-routes with the chooser answers as the person left them; `{ ensure: true }` (Try
 * again) returns the stored recommendation, or makes and stores the first one. Called in sequence, ensure asks the model
 * at most once, and at the same time as a first page render it shares that render's call (currentRecommendation).
 */
export async function recommendCommand(deps: Deps, intakeId: string, input: z.infer<typeof RecommendInput>): Promise<RecommendResult> {
  const recommendation = 'ensure' in input ? await currentRecommendation(deps, intakeId) : await recommendIntake(deps, intakeId, input.answers);
  return { recommendation, remainingUsd: (await workspaceRemaining(deps)).remainingUsd };
}

/** POST /compose ("Build my own"). It never asks for a recommendation, so it works while recommending is refused. */
export async function composeCommand(deps: Deps, intakeId: string): Promise<ComposeResultView> {
  const composed = await composeIntake(deps, intakeId);
  return { composed, remainingUsd: (await workspaceRemaining(deps)).remainingUsd };
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
  const spend = await workspaceRemaining(deps);
  const problem = budgetProblem(input.budgetUsd, spend);
  if (problem) throw new HttpError(400, problem);
  const run = await services.runner.start({
    workspaceId: spend.workspaceId,
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
  // The store's two closed states read differently: an answered question, or one taken back when its run ended.
  if (cp.status === 'withdrawn') throw new HttpError(409, 'This question was withdrawn: its run was cancelled or failed.');
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
    if (isEngineUnavailable(err)) throw err;
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
 * The artifact routes: content-addressed bytes, with the sandboxing headers of src/server/artifacts.ts. `origin`
 * is the one the browser used (from the Host header the guard has already checked), because the CSP must name
 * it exactly: Next.js may report a normalised host in the request URL (localhost for 127.0.0.1).
 *
 * `route` is which address was asked for. `/artifacts/<id>` serves everything. `/api/artifacts/<id>` (`media`) is the
 * address generated pages and documents use for generated images and clips (spec §3.3), and serves only those: a page
 * there would be one a generated page could navigate itself to, and SVG, which can carry script, is a download there.
 */
export async function artifactResponse(services: Services, rawId: string, url: URL, origin: string = url.origin, route: 'artifacts' | 'media' = 'artifacts'): Promise<Response> {
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // Not percent-encoded; use as is.
  }
  if (!isArtifactId(id)) return new Response('Not a valid artifact id.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!(await services.store.artifacts.has(id))) return new Response('Artifact not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const { record, bytes } = await services.store.artifacts.get(id);
  const media = route === 'media' ? mediaServing(record.mediaType) : 'inline';
  if (media === 'refuse') return new Response('Artifact not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const requested = url.searchParams.get('download') === '1' ? (url.searchParams.get('name') ?? 'byway-result').slice(0, 200) : undefined;
  const download = requested ?? (media === 'attachment' ? 'byway-media' : undefined);
  // A downloaded page or Markdown file carries its images inline, so it works away from byway (EXP-1).
  if (requested !== undefined && exportsInline(record.mediaType)) {
    const text = await selfContained(new TextDecoder().decode(bytes), services.store.artifacts);
    return new Response(text, { status: 200, headers: artifactHeaders(record.mediaType, origin, download) });
  }
  return new Response(new Uint8Array(bytes), { status: 200, headers: artifactHeaders(record.mediaType, origin, download) });
}
