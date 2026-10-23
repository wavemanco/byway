/**
 * The `relayLink` activity: one RELAY link (01 RELAY, ADR-0069). The relay step's prompt answers `relay:media` with
 * `{clipPrompt, durationSec}` for the shot the brief names ("Shot N"); the runner then calls `gateway.video` starting
 * from the anchor (the previous link's last frame, or shot 1's frame), attaches `clipArtifactId` and the clip's
 * `lastFrameArtifactId` to the shot, and hands that last frame on as the next anchor. With no usable video model the link finishes as skipped with
 * ADR-0069's note, and the storyboard and anchor pass through unchanged. So does a link with no frame to start from
 * (shot 1's frame was not made, F12): a clip is never started from another shot's still, nor sent without a start
 * frame for the video model to refuse.
 */
import { GatewayError } from '@byway/contracts';
import { parseStoryboard, serializeJson } from '../formats.ts';
import { parseRelay } from '../parse.ts';
import type { RelayInput, RelayResult } from '../types.ts';
import { askModel } from './call.ts';
import { mediaStatus } from './availability.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { ArtifactReader, buildPrompt } from './prompting.ts';
import { labelFor, stepFinished, stepStarted } from './steps.ts';
import { keptVoice, withDeck } from './held-voice.ts';
import { announce, checkedWriter, restoredNote, storeText } from './writes.ts';

export const NO_VIDEO_NOTE = 'No video provider key is configured';
export const NO_COMPOSITING_NOTE = 'Compositing is not available in byway yet';
/** A link whose start frame does not exist (ADR-0090). */
export const noStartFrameNote = (shot: number): string => `Shot ${shot} has no frame to start from, so no clip was made.`;
/** The gateway refuses clips longer than this; relay links are a few seconds each (03 C5). */
const MAX_CLIP_SECONDS = 60;

export async function relayLink(deps: RunnerDeps, input: RelayInput): Promise<RelayResult> {
  const { run, call, step, ports, shot } = input;
  await stepStarted(deps, run, call, step, input.meta);
  const what = input.meta?.label ?? labelFor(deps, run.recipeId, step);
  const skip = async (note: string, costUsd = 0): Promise<RelayResult> => {
    await stepFinished(deps, run, call, { costUsd, skipped: true, note }, costUsd > 0);
    return { costUsd, skipped: true };
  };
  if (!mediaStatus(deps, run).video) return skip(NO_VIDEO_NOTE);
  if (!ports.artifact) throw new StepError(`The ${what} step has no storyboard to work from.`);
  if (!step.prompt) throw new StepError(`The ${what} step names no prompt.`);
  const promptId = step.prompt;

  const reader = new ArtifactReader(deps);
  // Inside a chain the link's start frame; outside it (render-in-scene) the chain's last frame.
  const start = ports.linkStart ?? ports.anchor;
  if (!start || !(await reader.isImage(start))) return skip(noStartFrameNote(shot));
  const storyboardText = await reader.text(ports.artifact);
  const sb = parseStoryboard(storyboardText);
  if (!sb.ok) throw new StepError(`The ${what} step could not read the storyboard: ${sb.problem}`);
  if (!sb.value.storyboard.some((s) => s.shot === shot)) throw new StepError(`The storyboard has no shot ${shot}.`);
  // A fixed copy deck the run was given travels as its file's id (P2): read here for a step that takes it in or is held
  // to keep it (held-voice.ts withDeck).
  const given = await withDeck(reader, run, step, ports);
  // keepsVoice: locked before the paid calls, so a fault in the check never repeats them.
  const write = checkedWriter(run, step.keepsVoice ? keptVoice(given) : undefined, storyboardText);

  const built = await buildPrompt(reader, {
    medium: run.medium,
    problemId: run.problemId,
    step,
    ports: given,
    extra: { artifact: storyboardText, brief: `Shot ${shot}` },
    extraImages: [{ artifactIds: [start] }],
  });
  const link = await askModel(deps, reader, {
    run,
    call,
    promptId,
    slots: built.slots,
    images: built.images,
    purpose: 'relay:media',
    tier: step.tier ?? 'mid',
    what,
    maxOutputTokens: 4_000,
    parse: parseRelay,
  });
  let costUsd = link.costUsd;

  let clip;
  try {
    clip = await deps.gateway.video({
      workspaceId: run.workspaceId,
      runId: run.runId,
      stepId: step.id,
      purpose: 'relay:media',
      profileId: run.profileId,
      prompt: link.value.clipPrompt,
      startFrameArtifactId: start,
      durationSec: Math.min(MAX_CLIP_SECONDS, Math.max(1, link.value.durationSec)),
      shot,
    });
  } catch (e) {
    if (e instanceof GatewayError && e.code === 'no-credentials') return skip(NO_VIDEO_NOTE, costUsd);
    throw e;
  }
  costUsd += clip.costUsd;
  // The gateway says what it stored: MP4 or the demo's SVG placeholder, and a frame that is not always PNG.
  await announce(deps, run.runId, call, clip.artifactId, clip.mediaType, { label: `Clip for shot ${shot}`, name: 'clip', shot });
  await announce(deps, run.runId, call, clip.lastFrameArtifactId, clip.lastFrameMediaType, { label: `Last frame of shot ${shot}`, name: 'last-frame', shot });

  // The clip and its last frame go on the shot together (a regeneration replaces both), so the shot check inside this
  // link sees the clip's own last frame (F10, ADR-0090).
  const next = serializeJson({ ...sb.value, storyboard: sb.value.storyboard.map((s) => (s.shot === shot ? { ...s, clipArtifactId: clip.artifactId, lastFrameArtifactId: clip.lastFrameArtifactId } : s)) });
  const checked = write(next);
  if (checked.problems.length) throw new StepError(`The ${what} step could not update the storyboard: ${checked.problems.join(' ')}`);
  const artifactId = await storeText(deps, run, call, checked.text, { label: `Storyboard with the clip for shot ${shot}`, name: 'work', shot });
  const note = restoredNote(checked.restored);
  await stepFinished(deps, run, call, { costUsd, ...(note ? { note } : {}), outputArtifactIds: [clip.artifactId, clip.lastFrameArtifactId, artifactId] }, true);
  return { costUsd, artifactId, anchor: clip.lastFrameArtifactId };
}

/** The storyboard's shot numbers, in order (one relay link per shot). */
export async function storyboardShots(deps: RunnerDeps, input: { artifactId: string }): Promise<number[]> {
  const sb = parseStoryboard(await deps.store.artifacts.getText(input.artifactId));
  if (!sb.ok) throw new StepError(`The storyboard could not be read: ${sb.problem}`);
  return sb.value.storyboard.map((s) => s.shot).sort((a, b) => a - b);
}
