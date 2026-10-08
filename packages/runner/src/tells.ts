/**
 * The `tells` port (spec §3.1): the tell catalogs a TELLS sweep reads. The run's own catalog wins
 * (StartRunInput.inputs.tells); otherwise every catalog the step's `domains` knob names (C3 sweeps four prose catalogs,
 * C6a only fiction), or the medium's catalog when it names none, as @byway/prompts' tellsPromptIds lists them. Each is
 * rendered and their texts joined in order. Only sweep steps consume `tells` (port rule 7).
 */
import type { Medium, PromptRenderer } from '@byway/contracts';
import { TELLS_DOMAINS, type TellsDomain } from '@byway/protocol';
import { tellsPromptIds } from '@byway/prompts/pure';
import type { StepSpec } from './types.ts';

const isDomain = (d: unknown): d is TellsDomain => typeof d === 'string' && (TELLS_DOMAINS as readonly string[]).includes(d);

export function tellsText(prompts: Pick<PromptRenderer, 'has' | 'render'>, medium: Medium, step: Pick<StepSpec, 'knobs'>, own?: string): string {
  if (own?.trim()) return own;
  const knob = step.knobs?.domains;
  const domains = Array.isArray(knob) ? knob.filter(isDomain) : [];
  let ids = tellsPromptIds(medium, domains).filter((id) => prompts.has(id));
  // Catalogs for the named domains that the templates do not have yet: the medium's own catalog still applies.
  if (!ids.length && domains.length) ids = tellsPromptIds(medium).filter((id) => prompts.has(id));
  return ids.map((id) => prompts.render(id, { medium }).user.trim()).join('\n\n');
}
