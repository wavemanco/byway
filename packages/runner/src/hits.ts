/**
 * TELLS sweep hits as text (TELLS-1, convention C2): the line a swap step acts on, and the label a person chooses by.
 * Pure: the workflow bundle imports it.
 */
import type { TellsHit } from './types.ts';

/** A hit as the swap step reads it: "- pattern (where): alternative". */
export const hitLine = (h: TellsHit): string => `- ${h.pattern}${h.where ? ` (${h.where})` : ''}: ${h.alternative}`;

/** A hit as a person chooses it: "pattern — where → alternative" (convention C2). */
export const hitLabel = (h: TellsHit): string => `${h.pattern}${h.where ? ` — ${h.where}` : ''} → ${h.alternative}`;

/** The sweep's critique: its hits, one per line, or a sentence saying it found none. */
export const hitsCritique = (hits: readonly TellsHit[]): string => (hits.length ? hits.map(hitLine).join('\n') : 'No reflexive defaults found.');
