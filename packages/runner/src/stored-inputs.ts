/**
 * What a run is started with, stored once (P2): Runner.start writes the brief (the person's problem, with its fields
 * and attachments) as one JSON file in the content-addressed store before it starts the run's workflow, and the
 * workflow carries only the file's id, so every step's input does too. A brief may be a million characters (the web
 * takes 20,000 and five attachments of 200,000), about 3 MB of Chinese or Japanese; carried by value it put the start
 * input past Temporal's 2 MB limit on one value, and a fan-out past its 4 MB limit on one batch, and the run stayed
 * "running" with nothing spent (F02; ADR-0098's Negative).
 *
 * The file's JSON is canonical: the brief's fields in one order (text, deliverable, audience, constraints, attachments;
 * an attachment's name, then its text), those it does not have left out, so a start sent twice, or the same brief
 * written with its fields in another order, is the same bytes and so the same id. Only those fields are written: they
 * are all a brief has, and all a prompt shows (@byway/prompts problemSlot). JSON writes a lone surrogate as an escape,
 * so a brief of any text is stored exactly as it was given.
 *
 * The person's own inputs go the same way: the fixed copy deck, the author's draft and their own tell catalog are each
 * stored as a text file, and only their ids travel (the design's reading, Claude's: the rows name the brief and the
 * deck, and the draft and the tells are the same kind of input). The references are ids already.
 *
 * Not workflow code: the client writes the files and the activities read them (prompting.ts ArtifactReader).
 */
import type { ArtifactStore, ProblemBrief, StartRunInput } from '@byway/contracts';
import type { RunInput } from './types.ts';

/** The brief's file is JSON. */
export const BRIEF_MEDIA_TYPE = 'application/json';

/**
 * The person's own inputs (the fixed copy deck, the author's draft, their tell catalog) are plain text files, as are
 * their VOICE answers, kept when each VOICE step finishes (human.ts finishHumanStep).
 */
export const INPUT_MEDIA_TYPE = 'text/plain';

/** The brief's file: canonical JSON (see the header). */
export function briefFile(p: ProblemBrief): string {
  const brief: ProblemBrief = {
    text: p.text,
    ...(p.deliverable !== undefined ? { deliverable: p.deliverable } : {}),
    ...(p.audience !== undefined ? { audience: p.audience } : {}),
    ...(p.constraints !== undefined ? { constraints: [...p.constraints] } : {}),
    ...(p.attachments !== undefined ? { attachments: p.attachments.map((a) => ({ name: a.name, text: a.text })) } : {}),
  };
  return JSON.stringify(brief);
}

/**
 * What Runner.start was given, stored, as the workflow is handed it: the brief's id, the references as they are, and the
 * fixed copy deck, the author's draft and the person's tell catalog each by its text file's id. An empty text is no
 * input, as it was when the texts travelled. A start sent twice writes the same bytes, so it gets the same ids.
 */
export async function storeRunInputs(artifacts: Pick<ArtifactStore, 'putText'>, input: Pick<StartRunInput, 'problem' | 'inputs'>): Promise<Pick<RunInput, 'problemId' | 'inputs'>> {
  const { id: problemId } = await artifacts.putText(briefFile(input.problem), BRIEF_MEDIA_TYPE);
  const { refs, voice, draft, tells } = input.inputs ?? {};
  const stored = async (text: string | undefined) => (text ? (await artifacts.putText(text, INPUT_MEDIA_TYPE)).id : undefined);
  const voiceId = await stored(voice);
  const draftId = await stored(draft);
  const tellsId = await stored(tells);
  return {
    problemId,
    inputs: { ...(refs !== undefined ? { refs } : {}), ...(voiceId ? { voiceId } : {}), ...(draftId ? { draftId } : {}), ...(tellsId ? { tellsId } : {}) },
  };
}

/** The brief a file holds, or undefined when the text is not a brief's file (no JSON object with a text). */
export function readBrief(text: string): ProblemBrief | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || typeof (value as { text?: unknown }).text !== 'string') return undefined;
  return value as ProblemBrief;
}

/**
 * Why a step cannot read a file its run was started with. Runner.start stored it before the run began, so a file that
 * cannot be read now was lost or damaged afterwards (a partial restore): reading it again finds the same, so the step
 * fails at once with this, and byway's start-up check lists the file among those missing.
 */
export const unreadableInput = (what: string, id: string): string =>
  `The ${what} this run started with cannot be read: its file (${id}) is missing or damaged in byway's data folder, perhaps from a partial restore (see "Back up and restore" in the README). Start the run again.`;
