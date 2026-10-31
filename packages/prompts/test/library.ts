import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROTOCOL_CONFIGS } from '@byway/catalog';
import { PROMPT_SLOTS, type PromptSlot } from '@byway/contracts';
import type { Medium } from '@byway/protocol';
import { steps, type Recipe, type Step } from '@byway/recipe';
import { ACTIVITY_PROMPT_IDS, createPromptRenderer, DEFAULT_TEMPLATES_DIR, parseTemplateFile, type Template } from '../src/index.ts';

/** Shared fixtures for the template tests: the package's own library, its raw files and the catalog's prompt steps. */

export const library = createPromptRenderer();

export interface TemplateFile {
  name: string;
  raw: string;
  template: Template;
}

export const FILES: TemplateFile[] = readdirSync(DEFAULT_TEMPLATES_DIR)
  .filter((n) => n.endsWith('.md'))
  .sort()
  .map((name) => {
    const raw = readFileSync(join(DEFAULT_TEMPLATES_DIR, name), 'utf8');
    return { name, raw, template: parseTemplateFile(raw, name) };
  });

export interface PromptStep {
  recipe: Recipe;
  medium: Medium;
  step: Step;
}

/** Every model step with a prompt in the eight protocol configurations. */
export const PROMPT_STEPS: PromptStep[] = PROTOCOL_CONFIGS.flatMap((recipe) =>
  steps(recipe)
    .filter(({ step }) => step.actor === 'model' && step.prompt)
    .map(({ step }) => ({ recipe, medium: recipe.medium as Medium, step })),
);

/** The roles that use each recipe prompt id (an id may serve several steps, e.g. a shared critic). */
export const ROLES_BY_PROMPT = new Map<string, Set<string>>();
for (const { step } of PROMPT_STEPS) {
  const set = ROLES_BY_PROMPT.get(step.prompt as string) ?? new Set();
  set.add(step.role);
  ROLES_BY_PROMPT.set(step.prompt as string, set);
}

/** The medium a template works in: its variant suffix, else the medium of the recipe that uses it. */
export function mediumOf(t: Template): Medium | undefined {
  if (t.medium) return t.medium;
  const step = PROMPT_STEPS.find((p) => p.step.prompt === t.id);
  if (step) return step.medium;
  // A prompt an activity calls inside a step (ACTIVITY_PROMPT_IDS) is in its configuration's medium: product.c5.*, C5's.
  const configuration = /^product\.[^.]+\./.exec(t.id)?.[0];
  return (ACTIVITY_PROMPT_IDS as readonly string[]).includes(t.id) && configuration ? PROMPT_STEPS.find((p) => p.step.prompt?.startsWith(configuration))?.medium : undefined;
}

/** A recognizable value for every slot, so a test can see where each one lands in the rendered text. */
export function sampleSlots(medium: Medium | undefined, extra: Partial<Record<PromptSlot, string>> = {}): Partial<Record<PromptSlot, string>> {
  const slots: Partial<Record<PromptSlot, string>> = {};
  for (const s of PROMPT_SLOTS) slots[s] = `SLOT_${s.toUpperCase()}`;
  if (medium) slots.medium = medium;
  else delete slots.medium;
  return { ...slots, ...extra };
}

/** Slots a step's template may use, from the ports it consumes (spec §3.2 "Prompt slots by port"). */
export function slotsForPorts(consumes: readonly string[]): Set<PromptSlot> {
  const map: Record<string, PromptSlot[]> = {
    intent: ['problem'],
    brief: ['brief'],
    artifact: ['artifact'],
    view: ['view'],
    'option_set<artifact>': ['options'],
    critique: ['critique'],
    taste: ['taste'],
    voice: ['voice'],
    tells: ['tells'],
    seed: ['seed'],
    refs: ['refs'],
    anchor: [],
  };
  const out = new Set<PromptSlot>(['medium']);
  for (const p of consumes) for (const s of map[p] ?? []) out.add(s);
  return out;
}
