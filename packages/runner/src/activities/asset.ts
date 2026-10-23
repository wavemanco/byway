/**
 * The `assetStep` activity: ASSET per medium (spec §3.2, §3.3).
 * - web-page and prose: image briefs (`asset.briefs:<medium>`), one image per brief through the gateway, then the model
 *   places them (`asset.integrate:<medium>`, images served from `/api/artifacts/<id>`).
 * - options and media: briefs, then images; the runner attaches `imageArtifactId` to each option or storyboard shot
 *   itself (no integrate call). On media shot 1's frame becomes the relay `anchor`.
 * A step that does not write the work (C2's rough mood boards) keeps its images beside it, in the `asset` port.
 * With no image model the step finishes as skipped and says so; an audio ASSET (C5's voice-over) has no v1 executor
 * and is skipped likewise (ADR-0069). Nothing is faked.
 *
 * The brief contract (F11, F12; ADR-0090). How many images a step may ask for is what its prompt declares (`images:`),
 * and every use of a brief's slot goes by one identity (slot-plan.ts). Coverage is checked before anything is bought.
 * A short answer gets the one feedback retry, then the step makes what it can and says what is missing, never a failed
 * run; only a malformed answer fails it. A prompt that may answer with no image (its minimum is 0) is taken at its
 * word. The relay anchor is exactly shot 1's frame, or none: a later shot's still never stands in for it. Every brief
 * left out (for a slot the work does not have, or beyond the most the step makes) is named in the step's note.
 *
 * Placing what was bought (ADR-0090's rule for briefs, applied to the integrate answer): the images are paid for by
 * then, so an answer that misses never fails the run. One that places some of them, and keeps every check on the work
 * (the person's words under keepsVoice, the run's random string), is used after the retry, and the images it left out
 * are kept beside the work; when no answer is usable (malformed, cut off, placing none, or breaking a check), the work
 * is unchanged and every image is kept beside it. The note names them.
 *
 * Advice, never a veto (ADR-0101): a prompt that asks for it (`advice: yes`; only C3's header image) may add one line
 * of advice for the person to its briefs. The step's note shows it, as the AI's suggestion, with the image it came with;
 * it never changes how many images are made, and with no image made it is not shown.
 */
import { GatewayError, type DeclineRecord, type Medium } from '@byway/contracts';
import { declineStory, isHeldKeyError } from '@byway/gateway';
import { audioAsset } from '@byway/recipe/semantics';
import { parseHtml, parseMarkdown, parseOptions, parseStoryboard, serializeJson, textView, type Parsed } from '../formats.ts';
import { imagesSlot, labelled, labelOf } from '@byway/prompts/pure';
import { parseBriefs } from '../parse.ts';
import type { AssetInput, AssetResult } from '../types.ts';
import { askModel } from './call.ts';
import { mediaStatus } from './availability.ts';
import type { RunnerDeps } from './deps.ts';
import { ContractMissed, StepError } from './failures.ts';
import { PaidNotKept } from './memo.ts';
import { ArtifactReader, buildPrompt } from './prompting.ts';
import { checkBriefs, eachPlan, freePlan, slotName, type SlotBrief, type SlotBriefs, type SlotPlan } from './slot-plan.ts';
import { labelFor, stepFinished, stepStarted } from './steps.ts';
import { keptVoice } from './held-voice.ts';
import { announce, checkedWriter, restoredNote, runSeeds, storeText } from './writes.ts';

/** Image failures that stop the asset step instead of trying the image again (a billed failure does too: see below). */
const STOPS_THE_STEP: ReadonlySet<GatewayError['code']> = new Set(['budget-exceeded', 'accounting-fault', 'no-credentials', 'unknown-profile', 'in-flight']);

export const NO_IMAGES_NOTE = 'No image provider key is configured, so no images were made; the work passes through unchanged.';
export const NO_AUDIO_NOTE = 'No voice-over audio provider is configured';
/** Every brief was bought and every image failed. */
export const NO_IMAGE_MADE_NOTE = 'No image could be generated for this step; the work passes through unchanged.';
/** The prompt asks for at least one image, and the AI wrote no usable brief even when asked again (F11). */
export const NO_BRIEF_NOTE = 'The AI wrote no usable image brief, even when asked again, so no image was made; the work passes through unchanged.';
/** The prompt lets the AI answer with no image (its minimum is 0), and it did: a choice, not a failure (F11). */
export const NO_IMAGE_CHOSEN_NOTE = 'The AI chose not to illustrate this piece, which its instructions allow, so no image was made; the work is unchanged.';
/** The step makes no images (a slots knob below 1): not the AI's choice, and every brief it wrote is left out and named. */
export const NO_SLOTS_NOTE = 'This step makes no images, so none was made; the work passes through unchanged.';

/**
 * A stop: a sentence end in any script (Unicode's Sentence_Terminal), the ellipsis or the Greek question mark, before any
 * closing quotes and brackets. Those include the marks Unicode files as opening quotes (Pi), because German and Danish
 * close a quote with them: „mehr.“ ‚mehr.‘ »mere.«
 */
const ENDS_SENTENCE = /[\p{Sentence_Terminal}…\u037E]["'\p{Pe}\p{Pf}\p{Pi}]*$/u;
/** A trailing comma, colon or semicolon in the common scripts' forms (Latin, fullwidth, ideographic, Arabic) gives way to the stop. */
const GIVES_WAY = /\s*[,:;\uFF0C\uFF1A\uFF1B\u3001\uFF64\uFE50\uFE51\uFE54\uFE55\u060C\u061B]+$/u;

/**
 * The AI's line of advice, shown with the image it came with as its suggestion, never a veto (ADR-0101, D3). Only a
 * prompt that asks for advice gets one shown, and only C3's header image does, which its Trim step follows (a test
 * holds every such step to that). The advice is plain, bounded text (parse.ts plainLine); a stop is added if it has none
 * (. ! ? and their forms in other scripts, the ellipsis; one before closing quotes and brackets counts).
 */
export const adviceNote = (advice: string): string => {
  const line = advice.replace(GIVES_WAY, '');
  return `The AI suggests: ${ENDS_SENTENCE.test(line) ? line : `${line}.`} You can cut the image at Trim.`;
};

/** An ASSET step that turns the script into audio rather than images: @byway/recipe/semantics' audioAsset, which the explainers and the estimate read too. */
export const isAudioAsset = (step: AssetInput['step']): boolean => audioAsset(step);

const imageRoute = (id: string): string => `/api/artifacts/${id}`;
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface MadeImage {
  slot: string;
  alt: string;
  artifactId: string;
}

/** What an integrate answer placed: the work with the images in it (none when no answer was usable), and the images left out. */
interface Placement {
  text?: string;
  missing: MadeImage[];
  /** What the keepsVoice check wrote back (writes.ts restoredNote). */
  restored: string[];
}

export async function assetStep(deps: RunnerDeps, input: AssetInput): Promise<AssetResult> {
  const { run, call, step, ports } = input;
  const medium = run.medium;
  await stepStarted(deps, run, call, step, input.meta);
  const what = input.meta?.label ?? labelFor(deps, run.recipeId, step);
  const skip = async (note: string): Promise<AssetResult> => {
    await stepFinished(deps, run, call, { costUsd: 0, skipped: true, note });
    return { costUsd: 0, skipped: true };
  };
  if (isAudioAsset(step)) return skip(NO_AUDIO_NOTE);
  if (!mediaStatus(deps, run).images) return skip(NO_IMAGES_NOTE);
  if (!ports.artifact) throw new StepError(`The ${what} step has no work to make images for.`);

  const reader = new ArtifactReader(deps);
  const current = await reader.text(ports.artifact);
  // keepsVoice: locked before the paid calls, so a fault in the check never repeats them.
  const write = checkedWriter({ medium, seeds: await runSeeds(deps.store, run.runId) }, step.keepsVoice ? await keptVoice(reader, ports) : undefined, current);
  let restored: string[] = [];
  const knobs = step.knobs ?? {};
  const slotsKnob = typeof knobs.slots === 'number' ? knobs.slots : undefined;
  const tries = typeof knobs.triesPerSlot === 'number' ? Math.max(1, knobs.triesPerSlot) : 1;
  // On media and options the work decides the slots, read before anything is asked or bought.
  const each = eachPlan(medium, current, what);

  // 1. Briefs, held to the plan: on prose and web pages, to the count the prompt declares.
  const built = await buildPrompt(reader, { medium, problemId: run.problemId, step, ports });
  built.slots.artifact = current;
  if (medium === 'options') built.slots.options = optionLabels(current);
  const promptId = step.prompt && deps.prompts.has(step.prompt) ? step.prompt : 'helper.asset.briefs';
  let plan: SlotPlan | undefined = each;
  const briefs = await askModel<SlotBriefs>(deps, reader, {
    run,
    call,
    promptId,
    slots: built.slots,
    images: built.images,
    purpose: `asset.briefs:${medium}`,
    tier: step.tier ?? 'mid',
    what,
    maxOutputTokens: 4_000,
    parse: (text, rendered, earlier) => {
      plan = each ?? freePlan(rendered.images, slotsKnob);
      const answer = parseBriefs(text);
      if (!answer.ok) return answer;
      // The advice counts only where the prompt asks for it (ADR-0101); elsewhere an answer's advice is not shown.
      return checkBriefs({ ok: true, value: answer.value.images }, plan, earlier, rendered.advice ? answer.value.advice : undefined);
    },
  });
  const slots = plan!;
  let costUsd = briefs.costUsd;
  if (!briefs.value.briefs.length) {
    // Nothing to make: by the prompt's own choice (its minimum is 0); because the step makes no images (a slots knob
    // below 1, so every brief was left out); or because no usable brief came even when asked again.
    const none = slots.kind === 'free' && slots.max < 1;
    const chosen = briefs.shortfall === undefined && !none;
    const note = chosen ? NO_IMAGE_CHOSEN_NOTE : [none ? NO_SLOTS_NOTE : NO_BRIEF_NOTE, ...leftOutSentences(slots, briefs.value)].join(' ');
    await stepFinished(deps, run, call, { costUsd, ...(chosen ? {} : { skipped: true }), note }, true);
    return chosen ? { costUsd } : { costUsd, skipped: true };
  }

  // 2. Images, at most `triesPerSlot` attempts each; shot 1's frame, which starts the relay chain, at least two.
  const made: MadeImage[] = [];
  const failed: string[] = [];
  const declined: { slot: string; record: DeclineRecord }[] = [];
  const outputs: string[] = [];
  for (const brief of briefs.value.briefs) {
    const image = await makeImage(deps, input, brief, slots.kind === 'each' && brief.slot === slots.first ? Math.max(tries, 2) : tries).catch((e: unknown) => {
      throw (e instanceof GatewayError && e.billed === true) || e instanceof PaidNotKept ? billedStop(e, slots, brief.slot, made, what) : e;
    });
    if (!image || 'declined' in image) {
      failed.push(brief.slot);
      if (image) {
        // What each attempt of a declined image cost (a retry billed with no usable image included) is this step's cost too.
        declined.push({ slot: brief.slot, record: image.declined });
        costUsd += image.declined.costUsd + (image.declined.retryCostUsd ?? 0);
      }
      continue;
    }
    costUsd += image.costUsd;
    made.push(image.made);
    outputs.push(image.made.artifactId);
  }
  if (!made.length) {
    await stepFinished(deps, run, call, { costUsd, skipped: true, note: [NO_IMAGE_MADE_NOTE, ...declinedSentences(slots, declined), ...leftOutSentences(slots, briefs.value)].join(' ') }, true);
    return { costUsd, skipped: true };
  }

  // 3. Place them.
  const result: AssetResult = { costUsd };
  const writes = step.produces.includes('artifact');
  /** What the integrate answer did not place, if anything (prose and web pages). */
  let unplaced: Placement | undefined;
  if (medium === 'web-page' || medium === 'prose') {
    let placed: Placement;
    try {
      const integrate = await askModel<Placement>(deps, reader, {
        run,
        call,
        promptId: 'helper.asset.integrate',
        // Pages get "address | alt | slot" lines, prose Markdown image lines (@byway/prompts' layout, which the mock reads).
        slots: { medium, artifact: current, images: imagesSlot(medium, made) },
        images: [],
        purpose: `asset.integrate:${medium}`,
        tier: step.tier ?? 'mid',
        what,
        parse: (text, _rendered, earlier) => {
          const doc: Parsed<string> = medium === 'web-page' ? parseHtml(text) : parseMarkdown(text);
          if (!doc.ok) return doc;
          const missing = made.filter((m) => !doc.value.includes(imageRoute(m.artifactId)));
          const checked = write(doc.value);
          const problems = [
            ...(missing.length ? [`Place every image by its address; missing: ${missing.map((m) => imageRoute(m.artifactId)).join(', ')}.`] : []),
            ...checked.problems,
          ];
          const value: Placement = { text: checked.text, missing, restored: checked.restored };
          if (!problems.length) return { ok: true, value };
          // Usable after the retry only when it placed an image and kept every check; of two such, the one that placed more.
          if (checked.problems.length || missing.length === made.length) return { ok: false, problem: problems.join(' ') };
          return { ok: false, problem: problems.join(' '), usable: earlier && earlier.missing.length < missing.length ? earlier : value };
        },
      });
      result.costUsd += integrate.costUsd;
      placed = integrate.value;
    } catch (e) {
      // No answer was usable: the work stays as it was, and every image is kept beside it.
      if (!(e instanceof ContractMissed)) throw e;
      result.costUsd += e.costUsd;
      placed = { missing: made, restored: [] };
    }
    restored = placed.restored;
    if (placed.missing.length) unplaced = placed;
    if (placed.text !== undefined) {
      const id = await storeText(deps, run, call, medium === 'web-page' ? `${placed.text}\n` : placed.text, { label: what, name: 'work' });
      outputs.push(id);
      if (writes) result.artifactId = id;
    }
    // A step that does not write the work keeps every image beside it; one that does, those its work does not hold.
    const beside = writes ? placed.missing : made;
    if (beside.length) result.asset = beside.map((m) => m.artifactId);
  } else {
    const checked = write(attach(medium, current, made));
    if (checked.problems.length) throw new StepError(`The ${what} step could not attach its images: ${checked.problems.join(' ')}`);
    restored = checked.restored;
    const id = await storeText(deps, run, call, checked.text, { label: writes ? what : `${what} (kept beside the work)`, name: 'work' });
    outputs.push(id);
    if (writes) result.artifactId = id;
    else result.asset = made.map((m) => m.artifactId);
  }
  // The relay chain starts from shot 1's frame, or from none: never from a later shot's still.
  const anchorWanted = medium === 'media' && step.produces.includes('anchor') && slots.kind === 'each' && slots.first !== undefined;
  const anchor = anchorWanted ? made.find((m) => m.slot === (slots as Extract<SlotPlan, { kind: 'each' }>).first)?.artifactId : undefined;
  if (anchor) result.anchor = anchor;
  // What the step could not make or left out, the images it could not place, the AI's advice on what it made (ADR-0101;
  // not when no image is in the work, as Trim then has none to cut), and what keepsVoice wrote back (ADR-0081), in one note.
  const placedNone = unplaced !== undefined && unplaced.text === undefined;
  const advice = briefs.value.advice && !placedNone ? adviceNote(briefs.value.advice) : undefined;
  const note = [partialNote(slots, briefs.value, failed, anchorWanted && !anchor, declined), unplaced ? unplacedNote(slots, unplaced) : undefined, advice, restoredNote(restored)].filter((n): n is string => !!n).join(' ') || undefined;
  await stepFinished(deps, run, call, { costUsd: result.costUsd, ...(note ? { note } : {}), outputArtifactIds: outputs }, true);
  return result;
}

/**
 * One brief's image, tried up to `tries` times. Undefined when every try failed. A refused or failed image is tried again
 * up to `tries`; budget, key and accounting problems stop the step (a prompt holding a provider key is one, ADR-0088:
 * trying it again would be refused again; an accounting fault refuses every paid call until the person acknowledges it,
 * ADR-0095). So does a billed failure (ADR-0099, ADR-0090): an image the provider made and billed that byway could not
 * keep would be bought again by another try. A call byway did not start (it is stopping, or could not record the call as
 * sent) billed nothing and is tried again like any other unbilled failure: the step's failure would end the run, as every
 * GatewayError fails the step for good.
 *
 * An image the model declined is not tried again here (ADR-0102): the gateway already asked once more on the same model,
 * and a decline gets one retry, not one per layer. The slot is not made, and what happened goes in the step's note. The
 * memo keeps that outcome, so the step run again (after a budget raise for a later image, or Temporal's retry) gets it
 * back and asks nothing. An attempt that ended before the gateway's retry was made throws a plain error (memo.ts
 * DeclineRetryPending), never a GatewayError, so it ends the step's attempt rather than count as a failed try here. One
 * exception to going on: a retry the provider answered and billed that byway could not keep (its image, its request and
 * response, or its cost could not be stored or recorded) is a billed failure (`billed`), and it stops the step as any
 * billed image does, checked before the decline.
 */
async function makeImage(deps: RunnerDeps, input: AssetInput, brief: SlotBrief, tries: number): Promise<{ made: MadeImage; costUsd: number } | { declined: DeclineRecord } | undefined> {
  const { run, call, step } = input;
  const medium = run.medium;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const img = await deps.gateway.image({ workspaceId: run.workspaceId, runId: run.runId, stepId: step.id, purpose: `asset:${medium}`, profileId: run.profileId, prompt: brief.prompt, size: brief.size });
      const alt = brief.alt || `Image for ${brief.slot}`;
      await announce(deps, run.runId, call, img.artifactId, img.mediaType, { label: `Image: ${oneLine(alt).slice(0, 80)}`, name: `image/${brief.slot}`, ...(medium === 'media' ? { shot: Number(brief.slot) } : {}) });
      return { made: { slot: brief.slot, alt, artifactId: img.artifactId }, costUsd: img.costUsd };
    } catch (e) {
      if (!(e instanceof GatewayError) || STOPS_THE_STEP.has(e.code) || e.billed === true || isHeldKeyError(e)) throw e;
      if (e.declined) return { declined: e.declined };
    }
  }
  return undefined;
}

/**
 * A billed failure on one image, as the step's and the run's failure (ADR-0099, ADR-0090). It keeps the gateway's code,
 * its "billed" mark and its message, which says what was billed and that it is not bought again, and adds what that
 * leaves: which image it was, that the run stops here and buys no more images (a billed failure is a storage or ledger
 * fault that more images could repeat), and that the images this step already made were billed too and are not in the
 * work (the step stops before attaching or placing them). An image whose result byway could not keep (memo.ts
 * PaidNotKept) is a billed failure too: the same words are added, and it stays a StepError.
 */
function billedStop(e: GatewayError | PaidNotKept, plan: SlotPlan, slot: string, made: MadeImage[], what: string): GatewayError | PaidNotKept {
  const name = (id: string) => slotName(plan, id);
  const already = !made.length
    ? ''
    : made.length === 1
      ? ` The image already made for ${name(made[0]!.slot)} was billed too, and it is not in the work.`
      : ` The ${made.length} images already made for ${list(made.map((m) => name(m.slot)))} were billed too, and they are not in the work.`;
  const message = `${e.message} That was the image for ${name(slot)}, so the run stops here, at the ${what} step, and buys no more images.${already}`;
  return e instanceof GatewayError ? new GatewayError(e.code, message, e.retryable, { billed: true }) : new PaidNotKept(message);
}

/** "a", "a and b", "a, b and c". */
const list = (items: string[]): string => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''));

/**
 * The step's note when it made only part of what its plan asked for, or left a brief out. "Not every image was made"
 * only when one was not: the slots no brief covered, and the images that could not be made. Then, apart, the briefs
 * left out (every planned image may still have been made), and, on a storyboard, that the video chain has no start
 * frame. Undefined when everything was made and nothing left out.
 */
function partialNote(plan: SlotPlan, briefs: SlotBriefs, failed: string[], noAnchor: boolean, declined: { slot: string; record: DeclineRecord }[] = []): string | undefined {
  const name = (id: string) => slotName(plan, id);
  const parts = [
    ...(briefs.missing.length ? [`no image brief was written for ${list(briefs.missing.map(name))}`] : []),
    ...(failed.length ? [`the image for ${list(failed.map(name))} could not be made`] : []),
  ];
  const first = plan.kind === 'each' ? plan.first : undefined;
  const sentences = [
    ...(parts.length ? [`Not every image was made: ${parts.join('; ')}.`] : []),
    ...declinedSentences(plan, declined),
    ...leftOutSentences(plan, briefs),
    ...(noAnchor && first ? [`No frame was made for shot ${first}, so the video chain has no start frame.`] : []),
  ];
  return sentences.length ? sentences.join(' ') : undefined;
}

/**
 * The images an integrate answer did not place, kept beside the work: "The image for “detail” was not placed in the
 * work, even when the AI was asked again, so it is kept beside the work." With none placed (no answer was usable), the
 * work is said to be unchanged.
 */
function unplacedNote(plan: SlotPlan, placement: Placement): string {
  const names = list(placement.missing.map((m) => slotName(plan, m.slot)));
  const several = placement.missing.length > 1;
  if (placement.text === undefined) {
    return `The AI’s answer placing the ${several ? 'images' : 'image'} in the work could not be used, even when it was asked again, so the work is unchanged, and the ${several ? `images for ${names} are` : `image for ${names} is`} kept beside it.`;
  }
  return several
    ? `The images for ${names} were not placed in the work, even when the AI was asked again, so they are kept beside the work.`
    : `The image for ${names} was not placed in the work, even when the AI was asked again, so it is kept beside the work.`;
}

/** The briefs left out, as the note names them: for slots the work does not have (an each plan), or beyond the most the step makes (a free plan). */
function leftOutSentences(plan: SlotPlan, briefs: SlotBriefs): string[] {
  if (plan.kind === 'each') return briefs.unknown.length ? [leftOutSentence(plan, briefs.unknown)] : [];
  return briefs.dropped.length ? [droppedSentence(plan, briefs.dropped)] : [];
}

/** What happened to each image the model declined (ADR-0102), in the words of the run's events and the gateway. */
function declinedSentences(plan: SlotPlan, declined: { slot: string; record: DeclineRecord }[]): string[] {
  return declined.map(({ slot, record }) => declineStory(record, `the image for ${slotName(plan, slot)}`));
}

/**
 * The briefs left out for naming slots the work does not have, as written: "The brief for “4”, which the storyboard has
 * no shot for, was left out." One sentence for all of them; "Briefs" when there was more than one brief (both answers
 * may have named the same one).
 */
function leftOutSentence(plan: Extract<SlotPlan, { kind: 'each' }>, unknown: string[]): string {
  const names = [...new Set(unknown)];
  const quoted = list(names.map((u) => `“${u}”`));
  const several = names.length > 1;
  const which = plan.medium === 'media' ? `the storyboard has no ${several ? 'shots' : 'shot'} for` : several ? 'are not among the options' : 'is not one of the options';
  return unknown.length > 1 ? `Briefs for ${quoted}, which ${which}, were left out.` : `The brief for ${quoted}, which ${which}, was left out.`;
}

/**
 * The briefs a free plan left out, beyond the most the step makes (its prompt's maximum, or its slots knob): "This step
 * makes at most 1 image, so the brief for “second” was left out." A step that makes none says so first (NO_SLOTS_NOTE),
 * then "The briefs for “hero” and “detail” were left out."
 */
function droppedSentence(plan: Extract<SlotPlan, { kind: 'free' }>, dropped: string[]): string {
  const quoted = list(dropped.map((d) => slotName(plan, d)));
  if (plan.max < 1) return dropped.length > 1 ? `The briefs for ${quoted} were left out.` : `The brief for ${quoted} was left out.`;
  const most = `This step makes at most ${plan.max} ${plan.max === 1 ? 'image' : 'images'}`;
  return dropped.length > 1 ? `${most}, so the briefs for ${quoted} were left out.` : `${most}, so the brief for ${quoted} was left out.`;
}

/** The options slot of an options brief: each option's label and title, as "### A" headings. */
function optionLabels(artifact: string): string {
  const r = parseOptions(artifact);
  return r.ok ? labelled(r.value.options.map((o) => `${o.title}: ${o.pitch}`)) : textView('options', artifact);
}

/** Attach each image to its option (by label) or shot (by number), by the slot's one identity; nothing else changes. */
function attach(medium: Medium, artifact: string, made: MadeImage[]): string {
  const bySlot = new Map(made.map((m) => [m.slot, m.artifactId]));
  if (medium === 'options') {
    const r = parseOptions(artifact);
    if (!r.ok) throw new StepError(`The options could not be read: ${r.problem}`);
    return serializeJson({ options: r.value.options.map((o, i) => (bySlot.has(labelOf(i)) ? { ...o, imageArtifactId: bySlot.get(labelOf(i)) } : o)) });
  }
  const r = parseStoryboard(artifact);
  if (!r.ok) throw new StepError(`The storyboard could not be read: ${r.problem}`);
  return serializeJson({ ...r.value, storyboard: r.value.storyboard.map((s) => (bySlot.has(String(s.shot)) ? { ...s, imageArtifactId: bySlot.get(String(s.shot)) } : s)) });
}
