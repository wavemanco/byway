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
 * Not workflow code: the client writes the file and the activities read it (prompting.ts ArtifactReader).
 */
import type { ProblemBrief } from '@byway/contracts';

/** The brief's file is JSON. */
export const BRIEF_MEDIA_TYPE = 'application/json';

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
