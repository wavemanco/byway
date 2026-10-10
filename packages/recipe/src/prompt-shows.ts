/**
 * What a model step's prompt shows of the ports it takes in (ADR-0097): the one fact admission reads for whether a step
 * takes a port in. A step's `consumes` and `reads` say which slots the runner fills for it (buildPrompt); its template
 * says which of those the model is shown. The renderer ignores a slot the template does not use, so a port whose slot
 * the template never uses reaches no model: a fix on a draft prompt that renders no critique never sees the person's
 * list, however the step declares it.
 *
 * It mirrors the runner (activities/prompting.ts buildPrompt, and what model-step.ts, asset.ts and relay.ts add or put
 * in its place), and a runner test holds it to them on every catalog prompt and medium (runner/test/prompt-shows.test.ts):
 * - A port's own value goes in one slot (`PORT_SLOT`). The template the runner renders for the step's prompt in the run's
 *   medium (its medium's variant, else its base) shows it where it uses that slot (`TEMPLATE_SLOTS`, generated from
 *   @byway/prompts and held to it by a test there).
 * - Images ride along whatever the template says: a view's screenshots, on the media judged by screenshots; the options'
 *   screenshots there, to every role but an overlap flag; a relay link's start frame.
 * - Some slots the runner fills with something else: a relay link's brief slot holds its shot ("Shot N"), never the
 *   brief; an ASSET step's options slot on the options medium holds the work's own option labels; on a web page the
 *   options slot holds only "(The screenshots under this label show it.)"; a judging step is never given the work (port
 *   rule 1). The `refs` slot holds only the references' count: the references travel in a critic's GREAT lineup.
 * - A score never reaches a prompt (port rule 2), nor do the images beside the work (`asset`), a credential or a
 *   failed prompt.
 * - An ASSET step's prompt is its own where the library holds it, else the image-briefs helper (asset.ts).
 * - Where byway's library holds no template for the step's prompt in that medium (a research recipe's harness prompt, a
 *   helper written for other media, or no prompt), byway cannot see what the model is shown, and the step is read by
 *   the ports it declares, as before ADR-0097. The composed profile admits only library prompts that render for the
 *   recipe's medium, so every composed step is read by its template.
 * - A person's, a tool's or a policy's step has no prompt: what it takes in is what it declares (a person's question
 *   shows what the runner's human() shows, which the semantics decide elsewhere).
 *
 * Whether a step runs at all is another fact (`hasNoExecutor`): a voice-over ASSET's template shows the voice, and it
 * finishes skipped.
 *
 * Pure data and functions, with type-only imports from the schema and no Node built-ins. No workflow code reads it, so
 * the workflow bundle does not hold it: the runner's build test pins that an edit to it or to the table leaves the
 * bundle's hash alone.
 */
import { MEDIUM_FORMAT, OPTION_SET, type Medium, type PortType } from '@byway/protocol';
import type { Role, Step } from './schema.ts';
import { TEMPLATE_SLOTS } from './template-slots.ts';

/**
 * The slots each prompt template uses, by id and medium ('*' for the template every medium without a variant of its
 * own uses).
 */
export type TemplateSlots = Readonly<Record<string, Readonly<Partial<Record<Medium | '*', readonly string[]>>>>>;

/** The slot that carries a port's own value into a prompt (buildPrompt, spec §3.2 "Prompt slots by port"). */
export const PORT_SLOT: Readonly<Partial<Record<PortType, string>>> = {
  intent: 'problem',
  brief: 'brief',
  artifact: 'artifact',
  view: 'view',
  'option_set<artifact>': 'options',
  critique: 'critique',
  taste: 'taste',
  voice: 'voice',
  tells: 'tells',
  seed: 'seed',
};

/** Roles that judge the work and so are never given its source (port rule 1; the runner's JUDGING_ROLES). */
export const JUDGING_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'judge', 'check', 'tells-sweep', 'tells-compare']);

/** The prompt the runner asks a model step with: an ASSET step's own where the library holds it, else the image-briefs helper. */
export const promptOf = (s: Pick<Step, 'role' | 'prompt'>): string | undefined =>
  s.role === 'asset' && !(s.prompt !== undefined && Object.hasOwn(TEMPLATE_SLOTS, s.prompt)) ? 'helper.asset.briefs' : s.prompt;

/** The slots the template the runner renders for this prompt in this medium uses; undefined where the library holds none. */
export function templateSlots(prompt: string | undefined, medium: Medium | undefined): readonly string[] | undefined {
  if (prompt === undefined || !Object.hasOwn(TEMPLATE_SLOTS, prompt)) return undefined;
  const byMedium = TEMPLATE_SLOTS[prompt]!;
  return (medium !== undefined ? byMedium[medium] : undefined) ?? byMedium['*'];
}

/** The slot that holds a port's own value for a step of this role on this medium; undefined where none does. */
function carryingSlot(role: Role, port: PortType, medium: Medium | undefined): string | undefined {
  if (port === 'brief' && role === 'relay') return undefined;
  if (port === 'artifact' && JUDGING_ROLES.has(role)) return undefined;
  if (port === OPTION_SET && (medium === 'web-page' || (role === 'asset' && medium === 'options'))) return undefined;
  return PORT_SLOT[port];
}

/**
 * Whether a step's prompt shows the model what it takes in by this port, on some run: the one fact admission reads for
 * whether a step takes a port in (ADR-0097). False for a port the step does not consume or read.
 */
export function promptShows(s: Pick<Step, 'actor' | 'role' | 'prompt' | 'consumes' | 'reads'>, port: PortType, medium: Medium | undefined): boolean {
  if (!s.consumes.includes(port) && !(s.reads?.includes(port) ?? false)) return false;
  if (s.actor !== 'model') return true;
  const screenshots = medium !== undefined && MEDIUM_FORMAT[medium].view === 'screenshots';
  if (port === 'view' && screenshots) return true;
  if (port === OPTION_SET && screenshots && s.role !== 'overlap') return true;
  if (port === 'anchor') return s.role === 'relay';
  if (port === 'refs') return s.role === 'critic';
  const slot = carryingSlot(s.role, port, medium);
  if (slot === undefined) return false;
  const slots = templateSlots(promptOf(s), medium);
  return slots === undefined || slots.includes(slot);
}
