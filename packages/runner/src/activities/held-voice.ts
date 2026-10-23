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
 * The person's words travel by reference (P2): each VOICE answer is kept as a text file when its step finishes (human.ts
 * finishHumanStep), a fixed copy deck the run was given was stored at start (stored-inputs.ts), and the ports hold their
 * ids, the deck's as the first ports.voice. They are read here, by the steps that need their texts: one that takes the
 * words in (the voice slot, prompting.ts) or is held to keep them (keptVoice). No other step reads their files.
 */
import { unreadableInput } from '../stored-inputs.ts';
import type { Ports } from '../types.ts';
import type { ArtifactReader } from './prompting.ts';

/** What reads the person's words by their files' ids (prompting.ts ArtifactReader). */
type WordsReader = Pick<ArtifactReader, 'ownText'>;

/**
 * Why a step cannot read a VOICE answer its run holds. The answer was kept when its step finished, so a file that
 * cannot be read now was lost or damaged since (a partial restore), and reading it again finds the same.
 */
export const unreadableAnswer = (id: string): string =>
  `Your words from an earlier step of this run cannot be read: their file (${id}) is missing or damaged in byway's data folder, perhaps from a partial restore (see "Back up and restore" in the README). Start the run again.`;

/**
 * One of the person's words, by its file's id: a VOICE answer (every one is in `ports.held`) or else the fixed copy
 * deck the run was given, the only other id `ports.voice` holds (until a VOICE answers on the path). A file lost since
 * fails the step with a plain message saying which it was.
 */
export function personsWords(reader: WordsReader, ports: Pick<Ports, 'held'>, id: string): Promise<string> {
  return reader.ownText(id, ports.held?.includes(id) ? unreadableAnswer(id) : unreadableInput('copy deck', id));
}

/**
 * The person's words a keepsVoice write is held to: the held VOICE answers and the latest words, each once, the latest
 * last, read from their files; undefined when there are none (an empty answer is an answer).
 */
export async function keptVoice(reader: WordsReader, ports: Pick<Ports, 'voice' | 'held'>): Promise<string[] | undefined> {
  const ids = [...(ports.held ?? []), ...(ports.voice !== undefined ? [ports.voice] : [])];
  const texts = await Promise.all(ids.map((id) => personsWords(reader, ports, id)));
  const distinct = texts.filter((t, i) => texts.lastIndexOf(t) === i);
  return distinct.length ? distinct : undefined;
}
