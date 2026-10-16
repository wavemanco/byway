/**
 * What a keepsVoice write must keep (port rule 6, ADR-0092 stage 4): every VOICE answer on the run's path (the held
 * voice), and the latest words the person gave, a fixed copy deck included. Before, only the latest VOICE answer was
 * checked, so a writer moved past a later VOICE could change an earlier one (the locked voice-over script, say).
 *
 * The write is held by copy.ts `lockCopy` (ADR-0081): whenever any of these exists, the copy deck stays exactly as it
 * was in the work before the write; a storyboard's voice-over is written back, and its on-screen words are held exactly
 * when one of these answers is its on-screen deck. Each answer is passed on its own, not joined, so a voice-over script
 * held beside the on-screen answer does not hide that the on-screen answer is one.
 *
 * In C5, the only catalog recipe with a keepsVoice writer, every such writer runs between its two VOICEs, where this is
 * exactly the latest answer, so the catalog runs as before.
 */
import type { Ports } from '../types.ts';

/**
 * The person's words a keepsVoice write is held to: the held VOICE answers and the latest words, each once, the latest
 * last; undefined when there are none (an empty answer is an answer).
 */
export function keptVoice(ports: Pick<Ports, 'voice' | 'held'>): string[] | undefined {
  const texts = [...(ports.held ?? []), ...(ports.voice !== undefined ? [ports.voice] : [])];
  const distinct = texts.filter((t, i) => texts.lastIndexOf(t) === i);
  return distinct.length ? distinct : undefined;
}
