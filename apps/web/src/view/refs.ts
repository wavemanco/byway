/**
 * "Examples you admire": the references a recipe's outside critique can rank your work against (the `refs` port,
 * StartRunInput.inputs.refs). With at least three, a GREAT-mode critic ranks against them; with fewer it scores
 * against the hidden quality bar instead (ADR-0071). Shared by the Recommendation screen and the route handlers.
 */

/** From this many examples on, the outside critique ranks against them (ADR-0071). */
export const MIN_RANKING_REFS = 3;
/** The most examples a run takes: C3's critic uses up to 9 (its `refs` knob), the largest of the eight. */
export const MAX_REFS = 9;
/** A pasted example's longest length, in characters. */
export const MAX_REF_TEXT = 50_000;
/** An added image's largest size, in bytes. */
export const MAX_REF_IMAGE_BYTES = 5 * 1024 * 1024;
/** Images the gateway can attach to a critic's prompt (contracts MediaType); SVG is refused, it can carry script. */
export const REF_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type RefImageType = (typeof REF_IMAGE_TYPES)[number];

/** The one plain line under the field (ADR-0071), with no claim about which way works better. */
export const REFS_NOTE =
  'Optional. With three or more examples, the outside critique ranks your work against them; with fewer, it scores your work against a quality bar instead.';

/** Whether a recipe takes your examples: it declares the `refs` port as an input. */
export function takesRefs(recipe: { inputs: readonly string[] } | undefined | null): boolean {
  return recipe?.inputs.includes('refs') ?? false;
}

/** What the examples you have added will do, said as you add them. */
export function refsStatus(count: number): string {
  if (count <= 0) return 'No examples added.';
  const added = `${count} ${count === 1 ? 'example' : 'examples'} added.`;
  if (count >= MIN_RANKING_REFS) return `${added} The outside critique will rank your work against them.`;
  const more = MIN_RANKING_REFS - count;
  return `${added} Add ${more} more for the outside critique to rank against them.`;
}
