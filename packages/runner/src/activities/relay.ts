/**
 * The `relayLink` activity: one RELAY link (01 RELAY, ADR-0069). The relay step's prompt answers `relay:media` with
 * `{clipPrompt, durationSec}` for the shot the brief names ("Shot N"); the runner then calls `gateway.video` starting
 * from the anchor (the previous link's last frame, or shot 1's frame), attaches `clipArtifactId` and the clip's
 * `lastFrameArtifactId` to the shot, and hands that last frame on as the next anchor. With no usable video model the link finishes as skipped with
 * ADR-0069's note, and the storyboard and anchor pass through unchanged. So does a link with no frame to start from
 * (shot 1's frame was not made, F12): a clip is never started from another shot's still, nor sent without a start
 * frame for the video model to refuse.
 *
 * Its calls keep the waits read just before the step began (relayWaits, a quick step of its own; the waits design of
 * 2026-10-22, section 4): the link call the link model's wait, the clip and its last frame the video model's. The
 * workflow sized this step's limit from the same reading (workflow/acts.ts relayLimitMs), and every attempt of the step
 * is handed the same waits, so a wait changed in Settings while the step runs changes neither its limit nor its calls.
 */
import { GatewayError, type ModelRef, type Tier, type WaitKind } from '@byway/contracts';
import { DEFAULT_WAIT_MINUTES, minutesMs, waitMinutesFor } from '@byway/gateway';
import { storeCaps } from '../caps.ts';
import { parseStoryboard, serializeJson } from '../formats.ts';
import { parseRelay } from '../parse.ts';
import type { RelayInput, RelayResult, RelayWaits, RelayWaitsInput, StepSpec } from '../types.ts';
import { askModel } from './call.ts';
import { mediaStatus } from './availability.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { withWait } from './memo.ts';
import { ArtifactReader, buildPrompt } from './prompting.ts';
import { labelFor, stepFinished, stepStarted } from './steps.ts';
import { keptVoice } from './held-voice.ts';
import { announce, checkedWriter, restoredNote, runSeeds, storeText } from './writes.ts';

export const NO_VIDEO_NOTE = 'No video provider key is configured';
export const NO_COMPOSITING_NOTE = 'Compositing is not available in byway yet';
/** A link whose start frame does not exist (ADR-0090). */
export const noStartFrameNote = (shot: number): string => `Shot ${shot} has no frame to start from, so no clip was made.`;
/** The gateway refuses clips longer than this; relay links are a few seconds each (03 C5). */
const MAX_CLIP_SECONDS = 60;

/** The tier a relay step's link call asks for: the step's own, else mid. */
export const relayTier = (step: Pick<StepSpec, 'tier'>): Tier => step.tier ?? 'mid';

/** The waits of a relay step whose models have none chosen in Settings: a text model's default and a video model's. */
export const DEFAULT_RELAY_WAITS: RelayWaits = { linkMs: minutesMs(DEFAULT_WAIT_MINUTES.text), videoMs: minutesMs(DEFAULT_WAIT_MINUTES.video) };

/**
 * The `relayWaits` activity, a quick step the workflow runs just before each relay step: the waits that step's calls
 * keep, read from Settings for the run's workspace and profile as the gateway reads them for a call (the same store
 * lookup, storeCaps; the same rule, waitMinutesFor: a choice the model's kind does not offer is not used, and a model
 * with none waits its kind's default). The link model is the profile's model for the step's tier, as the gateway
 * resolves a completion that names no model; the video model is the profile's. In demo mode every call goes to the
 * mock, whose models have no wait to choose, and so does a profile's mock model: their kinds' defaults. A profile byway
 * does not list, or one with no video model, waits the defaults too: the step's own calls then fail or skip plainly.
 */
export async function relayWaits(deps: RunnerDeps, input: RelayWaitsInput): Promise<RelayWaits> {
  const { run, step } = input;
  const profile = deps.gateway.demo ? undefined : deps.gateway.profileStatus().find((s) => s.profile.id === run.profileId)?.profile;
  const caps = storeCaps(deps.store);
  const wait = async (kind: WaitKind, ref: ModelRef | undefined): Promise<number> => {
    const chosen = ref && ref.provider !== 'mock' ? await caps.waitMinutes?.(run.workspaceId, ref) : undefined;
    return minutesMs(waitMinutesFor(kind, chosen));
  };
  return { linkMs: await wait('text', profile?.tiers[relayTier(step)]), videoMs: await wait('video', profile?.video) };
}

export async function relayLink(deps: RunnerDeps, input: RelayInput): Promise<RelayResult> {
  const { run, call, step, ports, shot, waits } = input;
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
  // keepsVoice: locked before the paid calls, so a fault in the check never repeats them.
  const write = checkedWriter({ medium: run.medium, seeds: await runSeeds(deps.store, run.runId) }, step.keepsVoice ? await keptVoice(reader, ports) : undefined, storyboardText);

  const built = await buildPrompt(reader, {
    medium: run.medium,
    problemId: run.problemId,
    step,
    ports,
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
    tier: relayTier(step),
    what,
    maxOutputTokens: 4_000,
    parse: parseRelay,
    // The link model's wait, read before the step began (see the header).
    waitMs: waits.linkMs,
  });
  let costUsd = link.costUsd;

  let clip;
  try {
    // The video model's wait, read before the step began: the clip's, which bounds its last frame too (the gateway's fal
    // adapter: the time left on the clip's wait plus two minutes).
    clip = await deps.gateway.video(
      withWait(
        {
          workspaceId: run.workspaceId,
          runId: run.runId,
          stepId: step.id,
          purpose: 'relay:media',
          profileId: run.profileId,
          prompt: link.value.clipPrompt,
          startFrameArtifactId: start,
          durationSec: Math.min(MAX_CLIP_SECONDS, Math.max(1, link.value.durationSec)),
          shot,
        },
        waits.videoMs,
      ),
    );
  } catch (e) {
    if (e instanceof GatewayError && e.code === 'no-credentials') return skip(NO_VIDEO_NOTE, costUsd);
    throw e;
  }
  costUsd += clip.costUsd;
  // The gateway says what it stored: MP4 or the demo's SVG placeholder, and a frame that is not always PNG.
  await announce(deps, run.runId, call, clip.artifactId, clip.mediaType, { label: `Clip for shot ${shot}`, name: 'clip', shot });
  await announce(deps, run.runId, call, clip.lastFrameArtifactId, clip.lastFrameMediaType, { label: `Last frame of shot ${shot}`, name: 'last-frame', shot });
  const middle = clip.middleFrameArtifactId;
  if (middle && clip.middleFrameMediaType) await announce(deps, run.runId, call, middle, clip.middleFrameMediaType, { label: `Middle frame of shot ${shot}`, name: 'middle-frame', shot });

  // The clip and its frames go on the shot together (a regeneration replaces them all, a middle frame it could not take
  // included), so the shot check inside this link sees the clip's own frames (F10, ADR-0090).
  const frames = { clipArtifactId: clip.artifactId, lastFrameArtifactId: clip.lastFrameArtifactId, middleFrameArtifactId: middle };
  const next = serializeJson({ ...sb.value, storyboard: sb.value.storyboard.map((s) => (s.shot === shot ? { ...s, ...frames } : s)) });
  const checked = write(next);
  if (checked.problems.length) throw new StepError(`The ${what} step could not update the storyboard: ${checked.problems.join(' ')}`);
  const artifactId = await storeText(deps, run, call, checked.text, { label: `Storyboard with the clip for shot ${shot}`, name: 'work', shot });
  const note = restoredNote(checked.restored);
  await stepFinished(deps, run, call, { costUsd, ...(note ? { note } : {}), outputArtifactIds: [clip.artifactId, clip.lastFrameArtifactId, ...(middle ? [middle] : []), artifactId] }, true);
  return { costUsd, artifactId, anchor: clip.lastFrameArtifactId };
}

/** The storyboard's shot numbers, in order (one relay link per shot). */
export async function storyboardShots(deps: RunnerDeps, input: { artifactId: string }): Promise<number[]> {
  const sb = parseStoryboard(await deps.store.artifacts.getText(input.artifactId));
  if (!sb.ok) throw new StepError(`The storyboard could not be read: ${sb.problem}`);
  return sb.value.storyboard.map((s) => s.shot).sort((a, b) => a - b);
}
