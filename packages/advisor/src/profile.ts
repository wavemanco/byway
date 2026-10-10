import { outputForStep, PromptTemplateError, slotsForStep, type PromptLibrary } from '@byway/prompts';
import { BLOCKS, EXCEPTIONS, ROLE_KNOBS, type KnobDef, type Medium, type PortType } from '@byway/protocol';
import {
  authorWrite,
  changesWork,
  checkpoints,
  composedLimitProblems,
  declaresVoice,
  inputsOf,
  matchCheckpoints,
  placements,
  promptShows,
  steps,
  voiceScope,
  voiceWrite,
  voiceWrites,
  type Checkpoint,
  type Json,
  type Recipe,
  type Step,
  type VoiceScope,
} from '@byway/recipe';
import { flowRecipe } from '@byway/validator';

/**
 * The composed validator profile of ADR-0058, enforced in code on top of the validator: a composed recipe may use only
 * registered blocks with knobs in range, reuse only the catalog's step prompts in the role and medium they are written
 * for (frozen prompts stay untouched), take in only what a reused prompt shows the model (ADR-0097), cite no study
 * manipulation and no exception its nearest canonical recipe does not declare, and must keep the protected human
 * checkpoints (VOICE, and the author's own writing in C6/C6a) in substance as well as in name (COMP-1).
 *
 * Every protection here is read from what the recipe runs (@byway/recipe semantics, ADR-0092), never from what a step
 * declares: a checkpoint counts only where a person's write runs every time; writers are writers by role and actor.
 *
 * A model chose its counts, so it is held to COMPOSED_LIMITS (COMPOSED-LIMIT, F02): far inside the engine's own, which
 * the validator applies to every recipe (ST3 'limit').
 */

export interface ProfileViolation {
  ruleId: string;
  path: string;
  message: string;
}

export const COMPOSED_RULES = {
  block: 'COMPOSED-BLOCK',
  knob: 'COMPOSED-KNOB',
  study: 'COMPOSED-STUDY',
  exception: 'COMPOSED-EXCEPTION',
  voice: 'COMPOSED-VOICE',
  author: 'COMPOSED-AUTHOR',
  prompt: 'COMPOSED-PROMPT',
  internal: 'COMPOSED-INTERNAL',
  limit: 'COMPOSED-LIMIT',
} as const;

function knobDefs(step: Step): Record<string, KnobDef> {
  if (step.block) return BLOCKS[step.block]?.knobs ?? {};
  if (step.role === 'build' || step.role === 'fix' || step.role === 'select') return ROLE_KNOBS[step.role];
  return {};
}

export function knobValueOk(def: KnobDef, value: Json): boolean {
  switch (def.type) {
    case 'enum':
      return typeof value === 'string' && def.values.includes(value);
    case 'enum[]':
      return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && def.values.includes(v)) && new Set(value).size === value.length;
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) && value >= def.min && value <= def.max;
    case 'bool':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'string[]':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
  }
}

/** Prompt ids the catalog's model steps use, with the roles they are written for. */
export function catalogPrompts(recipes: readonly Recipe[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of recipes) {
    for (const { step } of steps(r)) {
      if (step.actor !== 'model' || !step.prompt) continue;
      const roles = out.get(step.prompt) ?? new Set<string>();
      roles.add(step.role);
      out.set(step.prompt, roles);
    }
  }
  return out;
}

export interface ProfileContext {
  nearest: Recipe;
  /** The canonical recipes whose step prompts a composed recipe may reuse. */
  catalog: readonly Recipe[];
  /** The templates: a reused prompt must answer the step's contract in the recipe's medium, with the slots the step fills. */
  prompts: PromptLibrary;
}

/**
 * Whether a reused prompt fits the step it is put on: its template answers the output contract the runner will parse
 * for this role in this medium, and it renders with exactly the slots the runner fills for this step (so a template that
 * needs a port the step does not consume is refused here, not in a paid run).
 */
function promptProblem(step: Step, prompt: string, medium: Medium | undefined, prompts: PromptLibrary): string | undefined {
  // A composed recipe always carries its nearest recipe's medium (forceComposed); without one there is no contract to hold.
  if (!medium) return undefined;
  let want: string;
  let output: string;
  try {
    want = outputForStep(step, medium);
    output = prompts.info(prompt, medium).output;
  } catch (e) {
    return `step "${step.id}" uses prompt "${prompt}", which cannot run as a ${step.role} step on ${medium}: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (output !== want) return `step "${step.id}" is a ${step.role} step on ${medium}, whose answer is read as ${want}, but prompt "${prompt}" answers as ${output} there`;
  const slots = Object.fromEntries([...slotsForStep(step, medium)].map((s) => [s, s === 'medium' ? medium : `(${s})`]));
  try {
    prompts.render(prompt, slots);
  } catch (e) {
    if (e instanceof PromptTemplateError && e.code === 'missing-slot') {
      return `prompt "${prompt}" needs "${e.slot}", which step "${step.id}" does not provide (it takes in ${[...step.consumes, ...(step.reads ?? [])].join(', ') || 'nothing'})`;
    }
    return `prompt "${prompt}" does not render for step "${step.id}": ${e instanceof Error ? e.message : String(e)}`;
  }
  return undefined;
}

/**
 * The ports a step takes in that its prompt never shows the model (@byway/recipe promptShows, ADR-0097): the runner fills
 * a slot for each, and the template never renders it. A step that says it takes in what its prompt never shows would be
 * read, explained and admitted as acting on it (a fix that "removes" a list it never sees), so a composed recipe may not
 * have one. Every catalog step shows every port it takes in.
 */
function unshownPorts(step: Step, medium: Medium): PortType[] {
  return inputsOf(step).filter((p) => !promptShows(step, p, medium));
}

const STAGE_WORDS: Record<string, string> = { D1: 'Explore', D2: 'Refine', D3: 'Finish' };

/** What a VOICE covers, in plain words. */
function scopeWords(s: VoiceScope): string {
  const base = { claims: 'the claims', script: 'the voice-over script', 'on-screen': 'the on-screen copy', all: 'the reader-facing words' }[s.base];
  return s.keyLines ? `the key lines of ${base}` : base;
}

/**
 * Machine steps that can change the work after a marked step has run, on some path along the exit-aware flow (loops
 * run twice, so a writer earlier in the same loop counts for the next round). A writer is one by its role and actor
 * wherever its output reaches the work; a contained one counts only if it declares writes. Each is reported once.
 */
export function writersAfter(recipe: Recipe, mark: (s: Step) => boolean): { step: Step; path: string }[] {
  const found = new Map<string, { step: Step; path: string }>();
  flowRecipe<boolean>(recipe, false, {
    step(step, path, _stage, armed, contained) {
      if (armed && step.actor !== 'human' && changesWork(step, contained) && !found.has(path)) found.set(path, { step, path });
      return armed || (!contained && mark(step));
    },
    join: (states) => states.some(Boolean),
    key: (armed) => (armed ? '1' : '0'),
  });
  return [...found.values()];
}

function byRole(writers: { step: Step; path: string }[]): Map<string, { step: Step; path: string }[]> {
  const out = new Map<string, { step: Step; path: string }[]>();
  for (const w of writers) out.set(w.step.role, [...(out.get(w.step.role) ?? []), w]);
  return out;
}

/**
 * The writer allowance per VOICE: after each VOICE of the composed recipe, no more machine writers of a role than its
 * nearest recipe has after the counterpart VOICE (C5 makes frames and clips after the locked script, on purpose). A
 * VOICE with no counterpart, or a step that only declares VOICE, allows none. keepsVoice is no excuse here: the runner
 * holds such a write to the latest VOICE answer only, so a writer moved past a later VOICE could change an earlier one.
 */
function extraWritersPerVoice(recipe: Recipe, nearest: Recipe): { step: Step; path: string; after: string }[] {
  const keyed = (r: Recipe): Checkpoint[] => voiceWrites(r).map((p) => ({ kind: 'voice', stage: p.stage, scope: voiceScope(p.step, r.medium), placement: p }));
  const counterpart = new Map<Step, Step>();
  for (const [w, h] of matchCheckpoints(keyed(nearest), keyed(recipe))) if (h) counterpart.set(h.placement.step, w.placement.step);
  const marks = [
    ...voiceWrites(recipe).map((p) => p.step),
    ...placements(recipe)
      .filter((p) => declaresVoice(p.step) && !voiceWrite(p.step))
      .map((p) => p.step),
  ];
  const out: { step: Step; path: string; after: string }[] = [];
  for (const mark of marks) {
    const from = counterpart.get(mark);
    const allowed = from ? byRole(writersAfter(nearest, (s) => s === from)) : new Map<string, unknown[]>();
    for (const [role, writers] of byRole(writersAfter(recipe, (s) => s === mark))) {
      for (const w of writers.slice(allowed.get(role)?.length ?? 0)) out.push({ ...w, after: mark.id });
    }
  }
  return out;
}

export function checkComposedProfile(recipe: Recipe, ctx: ProfileContext): ProfileViolation[] {
  const out: ProfileViolation[] = [];
  const add = (rule: keyof typeof COMPOSED_RULES, path: string, message: string) => out.push({ ruleId: COMPOSED_RULES[rule], path, message });
  const promptRoles = catalogPrompts(ctx.catalog);

  for (const { path, message } of composedLimitProblems(recipe)) add('limit', path, message);

  for (const { step, path } of steps(recipe)) {
    if (step.block && !Object.hasOwn(BLOCKS, step.block)) add('block', path, `step "${step.id}" uses "${step.block}", which is not a registered block`);
    const defs = knobDefs(step);
    for (const [name, value] of Object.entries(step.knobs ?? {})) {
      const def = defs[name];
      if (!def) add('knob', `${path}.knobs.${name}`, `knob "${name}" is not registered for ${step.block ?? step.role} (step "${step.id}")`);
      else if (!knobValueOk(def, value)) add('knob', `${path}.knobs.${name}`, `knob "${name}" of step "${step.id}" is out of range: ${JSON.stringify(value)}`);
    }
    if (step.actor !== 'model') continue;
    if (!step.prompt) {
      add('prompt', path, `model step "${step.id}" names no prompt; reuse the prompt of a ${step.role} step from the nearest recipe`);
      continue;
    }
    const roles = promptRoles.get(step.prompt);
    if (!roles) add('prompt', `${path}.prompt`, `step "${step.id}" uses prompt "${step.prompt}", which no canonical recipe's step uses`);
    else if (!roles.has(step.role)) add('prompt', `${path}.prompt`, `step "${step.id}" is a ${step.role} step, but prompt "${step.prompt}" is written for ${[...roles].join(', ')} steps`);
    else if (!ctx.prompts.has(step.prompt)) add('prompt', `${path}.prompt`, `step "${step.id}" uses prompt "${step.prompt}", which has no template`);
    else {
      const problem = promptProblem(step, step.prompt, recipe.medium, ctx.prompts);
      if (problem) add('prompt', `${path}.prompt`, problem);
      else if (recipe.medium) {
        for (const port of unshownPorts(step, recipe.medium)) {
          add('prompt', `${path}.prompt`, `step "${step.id}" takes in the ${port} port, but its prompt "${step.prompt}" never shows it to the model on ${recipe.medium}: use a prompt that shows it, or leave the port out`);
        }
      }
    }
  }

  recipe.exceptions.forEach((id, i) => {
    const def = Object.hasOwn(EXCEPTIONS, id) ? EXCEPTIONS[id] : undefined;
    if (def?.scope === 'study-manipulation' || id.startsWith('SM-')) add('study', `exceptions[${i}]`, `"${id}" is a study manipulation; composed recipes may not cite one`);
    else if (!ctx.nearest.exceptions.includes(id)) add('exception', `exceptions[${i}]`, `"${id}" is not an exception the nearest recipe (${ctx.nearest.id}) declares (${ctx.nearest.exceptions.join(', ') || 'it declares none'})`);
  });

  // COMP-1: every protected checkpoint the nearest recipe runs every time has its own counterpart here, one to one: a
  // VOICE that writes at least as much of the same copy in the same stage, and the author's own write in the same stage.
  // A checkpoint counts only where it runs every time: not in an optional, a choice, a candidate or a container, and
  // not after a check that can end its loop's round first.
  const want = checkpoints(ctx.nearest);
  for (const [w, h] of matchCheckpoints(want, checkpoints(recipe))) {
    if (h) continue;
    if (w.kind === 'voice') {
      add('voice', 'stages', `the nearest recipe (${ctx.nearest.id}) has you write ${scopeWords(w.scope)} yourself in ${STAGE_WORDS[w.stage]} on every run; keep a VOICE step that does, where every run reaches it (not in an optional, a choice, a candidate, or after a check that can end its loop's round)`);
    } else {
      add('author', 'stages', `in the nearest recipe (${ctx.nearest.id}) you write the work yourself in ${STAGE_WORDS[w.stage]} on every run; keep a step where you do (a human build or fix that writes the work) where every run reaches it`);
    }
  }

  // The checkpoints hold in substance: no AI step writes the work after the author has in C6/C6a, and no more AI
  // writers follow each VOICE than the nearest recipe has after its counterpart.
  if (want.some((c) => c.kind === 'author')) {
    for (const { step, path } of writersAfter(recipe, authorWrite)) {
      add('author', path, `step "${step.id}" lets the AI change the work after you wrote it; in ${ctx.nearest.id} every sentence is yours, so no AI step may write the work once you have`);
    }
  }
  for (const { step, path, after } of extraWritersPerVoice(recipe, ctx.nearest)) {
    add('voice', path, `step "${step.id}" lets the AI write the work after your own words in "${after}", which ${ctx.nearest.id} does not do there; your words stay the last word on the work`);
  }
  return out;
}
