/**
 * What a keepsVoice write must keep (port rule 6, ADR-0092 stage 4): every VOICE answer on the run's path (the held
 * voice), and the latest words the person gave, a fixed copy deck included. Before, only the latest VOICE answer was
 * checked, so a writer moved past a later VOICE could change an earlier one (the locked voice-over script, say).
 *
 * In C5, the only catalog recipe with a keepsVoice writer, every such writer runs between its two VOICEs, where this is
 * exactly the latest answer, so the catalog runs as before.
 */
import type { Ports } from '../types.ts';

/** The person's words a keepsVoice write is held to: the held VOICE answers and the latest words, each once. */
export function keptVoice(ports: Pick<Ports, 'voice' | 'held'>): string | undefined {
  const texts = [...(ports.held ?? []), ...(ports.voice !== undefined ? [ports.voice] : [])];
  const distinct = texts.filter((t, i) => texts.indexOf(t) === i);
  return distinct.length ? distinct.join('\n') : undefined;
}
