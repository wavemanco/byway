/**
 * The `assetStep` activity: ASSET per medium (spec §3.2, §3.3).
 * - web-page and prose: image briefs (`asset.briefs:<medium>`), one image per brief through the gateway, then the model
 *   places them (`asset.integrate:<medium>`, images served from `/api/artifacts/<id>`).
 * - options and media: briefs, then images; the runner attaches `imageArtifactId` to each option or storyboard shot
 *   itself (no integrate call). On media the first shot's frame becomes the relay `anchor`.
 * A step that does not write the work (C2's rough mood boards) keeps its images beside it, in the `asset` port.
 * With no image model the step finishes as skipped and says so; an audio ASSET (C5's voice-over) has no v1 executor
 * and is skipped likewise (ADR-0069). Nothing is faked.
 */
import { GatewayError, type Medium } from '@byway/contracts';
import { isHeldKeyError } from '@byway/gateway';
import { parseHtml, parseMarkdown, parseOptions, parseStoryboard, serializeJson, textView, type Parsed } from '../formats.ts';
import { imagesSlot, labelled, labelOf } from '@byway/prompts/pure';
import { parseBriefs, type ImageBrief } from '../parse.ts';
import type { AssetInput, AssetResult } from '../types.ts';
import { askModel } from './call.ts';
import { mediaStatus } from './availability.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { ArtifactReader, buildPrompt } from './prompting.ts';
import { labelFor, stepFinished, stepStarted } from './steps.ts';
import { announce, storeText, writeProblems } from './writes.ts';

export const NO_IMAGES_NOTE = 'No image provider key is configured, so no images were made; the work passes through unchanged.';
export const NO_AUDIO_NOTE = 'No voice-over audio provider is configured';

/** An ASSET step that turns the script into audio rather than images (03 C5 "VO audio from the locked script"). */
export const isAudioAsset = (step: AssetInput['step']): boolean => step.consumes.includes('voice');

const imageRoute = (id: string): string => `/api/artifacts/${id}`;
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface MadeImage {
  slot: string;
  alt: string;
  artifactId: string;
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
  const knobs = step.knobs ?? {};
  const slotsKnob = typeof knobs.slots === 'number' ? knobs.slots : 3;
  const tries = typeof knobs.triesPerSlot === 'number' ? Math.max(1, knobs.triesPerSlot) : 1;

  // 1. Briefs.
  const built = await buildPrompt(reader, { medium, problem: run.problem, step, ports });
  built.slots.artifact = current;
  const expected = expectedSlots(medium, current);
  if (medium === 'options') built.slots.options = optionLabels(current);
  const promptId = step.prompt && deps.prompts.has(step.prompt) ? step.prompt : 'helper.asset.briefs';
  const briefs = await askModel(deps, reader, {
    run,
    call,
    promptId,
    slots: built.slots,
    images: built.images,
    purpose: `asset.briefs:${medium}`,
    tier: step.tier ?? 'mid',
    what,
    maxOutputTokens: 4_000,
    parse: (text) => checkBriefs(parseBriefs(text), medium, expected, slotsKnob),
  });
  let costUsd = briefs.costUsd;

  // 2. Images, at most `triesPerSlot` attempts each.
  const made: MadeImage[] = [];
  const outputs: string[] = [];
  for (const brief of briefs.value) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const img = await deps.gateway.image({ workspaceId: run.workspaceId, runId: run.runId, stepId: step.id, purpose: `asset:${medium}`, profileId: run.profileId, prompt: brief.prompt, size: brief.size });
        costUsd += img.costUsd;
        const alt = brief.alt || `Image for ${brief.slot}`;
        made.push({ slot: brief.slot, alt, artifactId: img.artifactId });
        await announce(deps, run.runId, call, img.artifactId, img.mediaType, { label: `Image: ${oneLine(alt).slice(0, 80)}`, name: `image/${brief.slot}`, ...(medium === 'media' ? { shot: Number(brief.slot) } : {}) });
        outputs.push(img.artifactId);
        break;
      } catch (e) {
        // A refused or failed image is tried again up to triesPerSlot; budget, key and accounting problems stop the step (a
        // prompt holding a provider key is one, ADR-0088: trying it again would be refused again; an accounting fault
        // refuses every paid call until the person acknowledges it, ADR-0095).
        if (!(e instanceof GatewayError) || e.code === 'budget-exceeded' || e.code === 'accounting-fault' || e.code === 'no-credentials' || e.code === 'unknown-profile' || isHeldKeyError(e)) throw e;
        // An image the provider made and billed that byway then could not keep: another try would buy it again, so the
        // step stops, with the gateway's message saying it was billed and not bought again.
        if (e.billed) throw e;
      }
    }
  }
  if (!made.length) {
    await stepFinished(deps, run, call, { costUsd, skipped: true, note: 'No image could be generated for this step; the work passes through unchanged.' }, true);
    return { costUsd, skipped: true };
  }

  // 3. Place them.
  const result: AssetResult = { costUsd };
  const writes = step.produces.includes('artifact');
  if (medium === 'web-page' || medium === 'prose') {
    const integrate = await askModel(deps, reader, {
      run,
      call,
      promptId: 'helper.asset.integrate',
      // Pages get "address | alt | slot" lines, prose Markdown image lines (@byway/prompts' layout, which the mock reads).
      slots: { medium, artifact: current, images: imagesSlot(medium, made) },
      images: [],
      purpose: `asset.integrate:${medium}`,
      tier: step.tier ?? 'mid',
      what,
      parse: (text) => {
        const doc: Parsed<string> = medium === 'web-page' ? parseHtml(text) : parseMarkdown(text);
        if (!doc.ok) return doc;
        const missing = made.filter((m) => !doc.value.includes(imageRoute(m.artifactId)));
        const problems = [
          ...(missing.length ? [`Place every image by its address; missing: ${missing.map((m) => imageRoute(m.artifactId)).join(', ')}.`] : []),
          ...writeProblems(run, doc.value, step.keepsVoice ? ports.voice : undefined, current),
        ];
        return problems.length ? { ok: false, problem: problems.join(' ') } : doc;
      },
    });
    result.costUsd += integrate.costUsd;
    const id = await storeText(deps, run, call, medium === 'web-page' ? `${integrate.value}\n` : integrate.value, { label: what, name: 'work' });
    outputs.push(id);
    if (writes) result.artifactId = id;
    else result.asset = made.map((m) => m.artifactId);
  } else {
    const attached = attach(medium, current, made);
    const problems = writeProblems(run, attached, step.keepsVoice ? ports.voice : undefined, current);
    if (problems.length) throw new StepError(`The ${what} step could not attach its images: ${problems.join(' ')}`);
    const id = await storeText(deps, run, call, attached, { label: writes ? what : `${what} (kept beside the work)`, name: 'work' });
    outputs.push(id);
    if (writes) result.artifactId = id;
    else result.asset = made.map((m) => m.artifactId);
    if (medium === 'media' && step.produces.includes('anchor')) {
      const first = [...made].sort((a, b) => Number(a.slot) - Number(b.slot))[0];
      if (first) result.anchor = first.artifactId;
    }
  }
  await stepFinished(deps, run, call, { costUsd: result.costUsd, outputArtifactIds: outputs }, true);
  return result;
}

/** The slots briefs must name on options (option labels) and media (shot numbers); undefined elsewhere. */
function expectedSlots(medium: Medium, artifact: string): string[] | undefined {
  if (medium === 'options') {
    const r = parseOptions(artifact);
    return r.ok ? r.value.options.map((_, i) => labelOf(i)) : undefined;
  }
  if (medium === 'media') {
    const r = parseStoryboard(artifact);
    return r.ok ? r.value.storyboard.map((s) => String(s.shot)) : undefined;
  }
  return undefined;
}

/** The options slot of an options brief: each option's label and title, as "### A" headings. */
function optionLabels(artifact: string): string {
  const r = parseOptions(artifact);
  return r.ok ? labelled(r.value.options.map((o) => `${o.title}: ${o.pitch}`)) : textView('options', artifact);
}

function checkBriefs(r: Parsed<ImageBrief[]>, medium: Medium, expected: string[] | undefined, cap: number): Parsed<ImageBrief[]> {
  if (!r.ok) return r;
  let briefs = r.value;
  if (expected) {
    const wanted = new Set(expected);
    briefs = briefs.filter((b) => wanted.has(b.slot.trim().toUpperCase()) || wanted.has(b.slot.trim()));
    briefs = [...new Map(briefs.map((b) => [b.slot, b])).values()];
    if (!briefs.length) return { ok: false, problem: `Write one brief per ${medium === 'media' ? 'storyboard shot (slot = the shot number)' : 'option (slot = its label)'}: ${expected.join(', ')}.` };
  } else {
    briefs = briefs.slice(0, Math.max(1, cap));
    if (!briefs.length) return { ok: false, problem: 'Write at least one image brief.' };
  }
  return { ok: true, value: briefs };
}

/** Attach each image to its option (by label) or shot (by number), without touching anything else. */
function attach(medium: Medium, artifact: string, made: MadeImage[]): string {
  if (medium === 'options') {
    const r = parseOptions(artifact);
    if (!r.ok) throw new StepError(`The options could not be read: ${r.problem}`);
    const bySlot = new Map(made.map((m) => [m.slot.toUpperCase(), m.artifactId]));
    return serializeJson({ options: r.value.options.map((o, i) => (bySlot.has(labelOf(i)) ? { ...o, imageArtifactId: bySlot.get(labelOf(i)) } : o)) });
  }
  const r = parseStoryboard(artifact);
  if (!r.ok) throw new StepError(`The storyboard could not be read: ${r.problem}`);
  const bySlot = new Map(made.map((m) => [m.slot, m.artifactId]));
  return serializeJson({ ...r.value, storyboard: r.value.storyboard.map((s) => (bySlot.has(String(s.shot)) ? { ...s, imageArtifactId: bySlot.get(String(s.shot)) } : s)) });
}

