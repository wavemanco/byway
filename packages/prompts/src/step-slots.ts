import type { PromptSlot } from '@byway/contracts';
import type { Medium } from '@byway/protocol';

/** The parts of a recipe step that decide which slots its model call fills (structural: no @byway/recipe import). */
export interface SlotStep {
  role: string;
  consumes: readonly string[];
  /** Ports the step reads when they are there (ADR-0089): their slots are filled too, empty when absent. */
  reads?: readonly string[];
}

/** Roles that judge the work and so never see its source (port rule 1; the runner's JUDGING_ROLES). */
const JUDGING: ReadonlySet<string> = new Set(['critic', 'judge', 'check', 'tells-sweep', 'tells-compare', 'rerank']);

/** The slot each consumed port fills (spec §3.2 "Prompt slots by port"); score, anchor and asset fill none. */
const BY_PORT: Readonly<Record<string, readonly PromptSlot[]>> = {
  intent: ['problem'],
  brief: ['brief'],
  view: ['view'],
  'option_set<artifact>': ['options'],
  critique: ['critique'],
  taste: ['taste'],
  voice: ['voice'],
  tells: ['tells'],
  seed: ['seed'],
  refs: ['refs', 'labels'],
};

/**
 * The slots the runner fills for a recipe step's own prompt, every time it runs (its activities' buildPrompt plus the
 * per-role conventions): the medium; the slot of each port it consumes or reads (a read port's slot is empty when no
 * step made it, so a template tests it with {{#if}}; the artifact never for a judging step); a SEED
 * step's random string; a judge's options; a RELAY link's storyboard and shot; an ASSET step's work (and option labels
 * on options). Slots the runner fills only sometimes are left out, so a template must not need them: `round` (only
 * inside a loop), a critic's GREAT lineup without the refs port (only with enough references), and a model
 * keep-or-revert's two versions (only once there is a previous version).
 *
 * The composed profile renders a step's template with exactly these (ADR-0092), so a template that needs a slot the
 * step will not fill is refused at admission rather than failing a paid run.
 */
export function slotsForStep(step: SlotStep, medium: Medium): Set<PromptSlot> {
  const out = new Set<PromptSlot>(['medium']);
  const judging = JUDGING.has(step.role);
  for (const port of [...step.consumes, ...(step.reads ?? [])]) {
    if (port === 'artifact') {
      if (!judging) out.add('artifact');
      continue;
    }
    for (const slot of BY_PORT[port] ?? []) out.add(slot);
  }
  switch (step.role) {
    case 'seed':
      out.add('seed');
      break;
    case 'judge':
    case 'select':
      out.add('options');
      break;
    case 'relay':
      out.add('artifact').add('brief');
      break;
    case 'asset':
      out.add('artifact');
      if (medium === 'options') out.add('options');
      break;
  }
  return out;
}
