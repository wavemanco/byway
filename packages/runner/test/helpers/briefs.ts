/**
 * Briefs for the tests of the run's inputs stored once (P2): the largest brief the web accepts, in Chinese, and a brief
 * stored as Runner.start stores it, for a step driven on its own.
 */
import type { ArtifactStore, ProblemBrief } from '@byway/contracts';
import { BRIEF_MEDIA_TYPE, briefFile } from '../../src/stored-inputs.ts';

/** The web's limits on a brief (apps/web/src/server/schemas.ts ProblemInput): its text, and five attachments of 200,000. */
export const MAX_BRIEF_TEXT = 20_000;
export const MAX_ATTACHMENT_TEXT = 200_000;
export const MAX_ATTACHMENTS = 5;

/**
 * `n` characters of Chinese text (CJK ideographs, three bytes each in UTF-8), no two neighbours alike, with a line break
 * after every eighty; `from` starts the sequence elsewhere.
 */
export function chinese(n: number, from = 0): string {
  let out = '';
  for (let i = 0; i < n; i++) out += i % 81 === 80 ? '\n' : String.fromCodePoint(0x4e00 + ((from + i) * 7919) % 0x5000);
  return out;
}

/** The largest brief the web accepts, all of it Chinese: 20,000 characters, and five attachments of 200,000. */
export const maximalBrief = (): ProblemBrief => ({
  text: `为社区面包店写一个着陆页${chinese(MAX_BRIEF_TEXT - 12, 1)}`,
  attachments: Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({ name: `附件${i + 1}.md`, text: chinese(MAX_ATTACHMENT_TEXT, (i + 2) * 1_009) })),
});

/**
 * Pieces of a text, as JSON writes them (a line break as \n), to look for in what the engine carries: forty characters
 * from the start, the middle and the end.
 */
export const piecesOf = (text: string): string[] =>
  [0, Math.floor(text.length / 2), text.length - 40].map((at) => JSON.stringify(text.slice(at, at + 40)).slice(1, -1));

/** The pieces of a brief's text and of each of its attachments. */
export const briefPieces = (p: ProblemBrief): string[] => [p.text, ...(p.attachments ?? []).map((a) => a.text)].flatMap(piecesOf);

/** The brief's id in a run whose activities are stand-ins (the Interpreter's tests), which never read it. */
export const UNREAD_BRIEF = `sha256:${'b'.repeat(64)}`;

/** A brief stored as Runner.start stores it (stored-inputs.ts): its artifact id, for a run driven without the client. */
export const storeBrief = async (artifacts: Pick<ArtifactStore, 'putText'>, problem: ProblemBrief): Promise<string> => (await artifacts.putText(briefFile(problem), BRIEF_MEDIA_TYPE)).id;
