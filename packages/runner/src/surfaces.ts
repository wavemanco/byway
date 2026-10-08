/**
 * The surfaces a web page is rendered as (RENDER-1, 06-runbook §1 RENDER) and how they are named: to the person
 * beside each screenshot, and to a model in the line before each surface's screenshots. The critic, defect-check and
 * tells-sweep prompts describe exactly these three ("a wide screen, a phone, and the first screen"). A step's `renders`
 * knob (the C1 critic's `["desktop","mobile","fold"]`, Study 1's `["desktop"]`) says which of them it is shown.
 */
import type { Surface } from './types.ts';

/** Every surface, in the order they are rendered and shown. */
export const SURFACES: readonly Surface[] = ['desktop', 'mobile', 'fold'];

export const isSurface = (s: unknown): s is Surface => typeof s === 'string' && (SURFACES as readonly string[]).includes(s);

/** The name shown with a surface's screenshots. */
export const SURFACE_NAMES: Readonly<Record<Surface, string>> = { desktop: 'Wide screen', mobile: 'Phone', fold: 'First screen' };

/** The line a prompt puts before a surface's screenshots. */
export const SURFACE_CAPTIONS: Readonly<Record<Surface, string>> = {
  desktop: 'Wide screen, the whole page from top to bottom:',
  mobile: 'Phone, the whole page from top to bottom:',
  fold: 'First screen, as a visitor lands:',
};

/** A step's `renders` knob as surfaces (unknown names dropped); undefined when the step has no such knob. */
export function rendersKnob(knobs: Readonly<Record<string, unknown>> | undefined): Surface[] | undefined {
  const r = knobs?.renders;
  if (!Array.isArray(r)) return undefined;
  return SURFACES.filter((s) => r.includes(s));
}
