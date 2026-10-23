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
 *
 * A fixed copy deck the run was given is stored at start and travels as its file's id (P2, RunRef.voiceId): `withDeck`
 * reads it for a step that takes the person's words in or is held to keep them, as their latest words until a VOICE
 * answers, as when the deck travelled as the first ports.voice.
 */
import { inputsOf } from '@byway/recipe';
import type { Ports, RunRef, StepSpec } from '../types.ts';
import type { ArtifactReader } from './prompting.ts';

/**
 * The person's words a keepsVoice write is held to: the held VOICE answers and the latest words, each once, the latest
 * last; undefined when there are none (an empty answer is an answer).
 */
export function keptVoice(ports: Pick<Ports, 'voice' | 'held'>): string[] | undefined {
  const texts = [...(ports.held ?? []), ...(ports.voice !== undefined ? [ports.voice] : [])];
  const distinct = texts.filter((t, i) => texts.lastIndexOf(t) === i);
  return distinct.length ? distinct : undefined;
}

/**
 * The ports a step works from, with the fixed copy deck the run was given (read from its file) as the person's latest
 * words while no VOICE has answered on the path: only for a step that takes them in (the 'voice' port, consumed or read)
 * or is held to keep them (keepsVoice), so no other step reads the file. Once a VOICE has answered, its answer is the
 * latest words, an empty one included, and the deck is not read.
 */
export async function withDeck(reader: ArtifactReader, run: Pick<RunRef, 'voiceId'>, step: Pick<StepSpec, 'consumes' | 'reads' | 'keepsVoice'>, ports: Ports): Promise<Ports> {
  if (ports.voice !== undefined || !run.voiceId) return ports;
  if (!step.keepsVoice && !inputsOf(step).includes('voice')) return ports;
  return { ...ports, voice: await reader.startInput(run.voiceId, 'copy deck') };
}
