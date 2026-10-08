import type { PromptRenderer } from '@byway/contracts';
import { BLOCKS, EXCEPTIONS, ROLE_KNOBS, type KnobDef } from '@byway/protocol';
import { steps, type Json, type Node, type Recipe, type Step } from '@byway/recipe';
import { stepsAfter } from './flow.ts';

/**
 * The composed validator profile of ADR-0058, enforced in code on top of the validator: a composed recipe may use only
 * registered blocks with knobs in range, reuse only the catalog's step prompts (frozen prompts stay untouched; a step
 * cannot borrow another role's prompt), cite no study manipulation and no exception its nearest canonical recipe does
 * not declare, and must keep the protected human checkpoints (VOICE, and the author's own writing in C6/C6a), in
 * substance as well as in name: no AI step may write the work after the author has in C6/C6a, and no more AI writers may
 * follow your own words than the nearest recipe has there (COMP-1).
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

/** A human VOICE step: the reader-facing words are the person's own (02 §3 port rule 6). */
const isHumanVoice = (s: Step) => s.role === 'voice' && s.block === 'VOICE' && s.actor === 'human' && s.produces.includes('artifact');
/** The author writing the work themselves (C3 "own draft", C6, C6a). */
const isAuthorship = (s: Step) => s.role === 'build' && s.actor === 'human' && s.writes === true;

/**
 * Steps every run passes through: not inside an optional (which a run may skip) or a route (which takes one branch).
 * Pick judges are excluded: they run only for AI picks. A protected checkpoint counts only where it always runs, so a
 * composed recipe cannot keep VOICE in name while making it skippable.
 */
export function alwaysRunSteps(recipe: Recipe): Step[] {
  const out: Step[] = [];
  const visit = (n: Node): void => {
    switch (n.op) {
      case 'step':
        out.push(n);
        return;
      case 'seq':
        n.steps.forEach(visit);
        return;
      case 'optional':
      case 'route':
      case 'pick':
        return;
      case 'audit':
        n.lenses.forEach((l) => visit(l.body));
        return;
      default:
        visit(n.body);
    }
  };
  recipe.stages.forEach((s) => visit(s.body));
  return out;
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
  prompts: PromptRenderer;
}

export function checkComposedProfile(recipe: Recipe, ctx: ProfileContext): ProfileViolation[] {
  const out: ProfileViolation[] = [];
  const add = (rule: keyof typeof COMPOSED_RULES, path: string, message: string) => out.push({ ruleId: COMPOSED_RULES[rule], path, message });
  const promptRoles = catalogPrompts(ctx.catalog);

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
  }

  recipe.exceptions.forEach((id, i) => {
    const def = Object.hasOwn(EXCEPTIONS, id) ? EXCEPTIONS[id] : undefined;
    if (def?.scope === 'study-manipulation' || id.startsWith('SM-')) add('study', `exceptions[${i}]`, `"${id}" is a study manipulation; composed recipes may not cite one`);
    else if (!ctx.nearest.exceptions.includes(id)) add('exception', `exceptions[${i}]`, `"${id}" is not an exception the nearest recipe (${ctx.nearest.id}) declares (${ctx.nearest.exceptions.join(', ') || 'it declares none'})`);
  });

  const nearestAlways = alwaysRunSteps(ctx.nearest);
  const always = alwaysRunSteps(recipe);
  if (nearestAlways.some(isHumanVoice) && !always.some(isHumanVoice)) {
    add('voice', 'stages', `the nearest recipe (${ctx.nearest.id}) always has you write the reader-facing words (a human VOICE step that edits the work); keep one that always runs`);
  }
  if (nearestAlways.some(isAuthorship) && !always.some(isAuthorship)) {
    add('author', 'stages', `in the nearest recipe (${ctx.nearest.id}) you write the work yourself (a human build step that writes it); keep one that always runs`);
  }

  // COMP-1: the protected checkpoints must hold in substance, not only in name. A composed recipe that keeps your own
  // writing, or your own words, but lets the AI write over the work afterwards keeps the checkpoint and undoes it.
  if (nearestAlways.some(isAuthorship)) {
    for (const { step, path } of modelWritersAfter(recipe, isAuthorship)) {
      add('author', path, `step "${step.id}" lets the AI change the work after you wrote it; in ${ctx.nearest.id} every sentence is yours, so no AI step may write the work once you have`);
    }
  }
  for (const { step, path } of extraWritersAfterVoice(recipe, ctx.nearest)) {
    add('voice', path, `step "${step.id}" lets the AI write the work after your own words, which ${ctx.nearest.id} does not do there; your words stay the last word on the work`);
  }
  return out;
}

/** A step that puts the person's own words into the work (a VOICE step), as the validator's PR6 reads it. */
const writesVoice = (s: Step) => s.produces.includes('voice');

/**
 * Model steps that write the work and can run after a `mark` step has run on some path (flow.ts: along the control flow,
 * loops run twice, so a writer earlier in the same loop counts for the next round). Each is reported once, at its path.
 */
export function modelWritersAfter(recipe: Recipe, mark: (s: Step) => boolean): { step: Step; path: string }[] {
  return stepsAfter(recipe, mark).filter(({ step }) => step.actor === 'model' && step.writes === true);
}

/**
 * Model writers after your own words that the nearest recipe does not have there. The validator's PR6 already refuses
 * writers that do not declare keepsVoice; keepsVoice only checks that your lines survive, so added AI copy would pass.
 * Some configurations do write after your words on purpose (C5 makes frames and clips, and applies the swaps you chose,
 * after the voice-over is locked), so the bar is the nearest recipe: per role, no more model writers after your words
 * than it has.
 */
function extraWritersAfterVoice(recipe: Recipe, nearest: Recipe): { step: Step; path: string }[] {
  const allowed = new Map<string, number>();
  for (const { step } of modelWritersAfter(nearest, writesVoice)) allowed.set(step.role, (allowed.get(step.role) ?? 0) + 1);
  const extra: { step: Step; path: string }[] = [];
  for (const w of modelWritersAfter(recipe, writesVoice)) {
    const left = allowed.get(w.step.role) ?? 0;
    if (left > 0) allowed.set(w.step.role, left - 1);
    else extra.push(w);
  }
  return extra;
}
