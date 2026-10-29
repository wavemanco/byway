/**
 * The `renderView` activity (RENDER glue, spec §3.2 "Views by medium"): the artifact as its audience meets it.
 * - web-page: the surfaces the prompts name (RENDER-1): the whole page on a wide screen and on a phone, tiled, and
 *   the first screen (Playwright); each screenshot is stored and shown under its surface's name. A render step's own
 *   `renders` knob can narrow them; otherwise all three are made, and each judging step picks by its knob;
 * - prose and code-diff: the text itself (the view is the artifact);
 * - options: a numbered plain-text list;
 * - media: the storyboard as text plus each shot's frame image when it exists; inside a relay link, that shot's line,
 *   the frame its clip started from and the clip's last frame, under captions (F10, ADR-0090), or, when the link made
 *   no clip, a view with nothing to check that says why.
 * A pool (an option set) gets one view per candidate, shown side by side under labels.
 */
import { parseStoryboard, shotText, textView } from '../formats.ts';
import { rendersKnob, SURFACE_NAMES, SURFACES } from '../surfaces.ts';
import type { RenderInput, RenderResult, Surface, ViewRef } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { stepFinished, stepStarted } from './steps.ts';
import { announce, storeText } from './writes.ts';

/** What each image of a link view is, said to the judge as its caption (RENDER-1); the shot-check template names them. */
export const LINK_CAPTIONS = {
  start: 'The frame this clip starts from:',
  middle: 'A frame from the middle of the generated clip:',
  last: 'The last frame of the generated clip:',
} as const;

/** A link whose clip was not made (no video model, or no frame to start from): there is nothing to check. */
export const noClipNote = (shot: number): string => `No clip was made for shot ${shot}, so there is nothing to check.`;

export async function renderView(deps: RunnerDeps, input: RenderInput): Promise<RenderResult> {
  const { run, call, step } = input;
  await stepStarted(deps, run, call, step, input.meta);
  const outputs: string[] = [];
  const items: ViewRef[] = [];
  for (const [i, artifactId] of input.artifactIds.entries()) {
    const tag = input.pool ? `${i}` : 'one';
    const text = await deps.store.artifacts.getText(artifactId);
    switch (run.medium) {
      case 'web-page': {
        if (!deps.pages) throw new StepError('Web pages cannot be rendered: no page renderer is configured.');
        const wanted = rendersKnob(step.knobs) ?? [...SURFACES];
        const shots = await deps.pages.render(text, async (id) => {
          if (!(await deps.store.artifacts.has(id))) return undefined;
          const { record, bytes } = await deps.store.artifacts.get(id);
          return { body: bytes, contentType: record.mediaType };
        }, wanted.length ? wanted : [...SURFACES]);
        const surfaces: NonNullable<ViewRef['surfaces']> = [];
        for (const { surface, tiles } of shots) {
          const ids: string[] = [];
          for (const [t, png] of tiles.entries()) {
            const record = await deps.store.artifacts.put(png, 'image/png');
            ids.push(record.id);
            await announce(deps, run.runId, call, record.id, 'image/png', { label: shotLabel(surface, t, tiles.length), name: `view/${tag}/${surface}/${t}` });
          }
          surfaces.push({ surface, imageArtifactIds: ids });
        }
        const ids = surfaces.flatMap((s) => s.imageArtifactIds);
        outputs.push(...ids);
        items.push({ imageArtifactIds: ids, surfaces });
        break;
      }
      case 'prose':
      case 'code-diff':
        items.push({ textArtifactId: artifactId, imageArtifactIds: [] });
        break;
      case 'options': {
        const id = await storeText(deps, run, call, `${textView('options', text)}\n`, { label: 'Options as read', name: `view/${tag}`, mediaType: 'text/plain' });
        outputs.push(id);
        items.push({ textArtifactId: id, imageArtifactIds: [] });
        break;
      }
      case 'media': {
        if (input.link) {
          const view = await linkView(deps, input, text, tag, input.link);
          outputs.push(view.textArtifactId!);
          items.push(view);
          break;
        }
        const id = await storeText(deps, run, call, `${textView('media', text)}\n`, { label: 'Storyboard as read', name: `view/${tag}`, mediaType: 'text/plain' });
        const sb = parseStoryboard(text);
        const frames = sb.ok ? sb.value.storyboard.flatMap((s) => (s.imageArtifactId ? [s.imageArtifactId] : [])) : [];
        outputs.push(id);
        items.push({ textArtifactId: id, imageArtifactIds: frames });
        break;
      }
    }
  }
  await stepFinished(deps, run, call, { costUsd: 0, ...(outputs.length ? { outputArtifactIds: outputs } : {}) });
  return { view: { pool: input.pool, items } };
}

/**
 * A storyboard seen inside a relay link (F10, ADR-0090): only that shot's line, then the frame its clip started from, a
 * frame from the clip's middle when the gateway could take one (F10 (a)), and the clip's last frame, each under its
 * caption, so a check of the shot depends on its clip and on nothing of other shots. Defects already in the start frame
 * are the template's to leave out (a regeneration starts there again). With no clip, or no recorded last frame (a
 * storyboard from before the frame was recorded), there is nothing to check.
 */
async function linkView(deps: RunnerDeps, input: RenderInput, text: string, tag: string, link: NonNullable<RenderInput['link']>): Promise<ViewRef> {
  const sb = parseStoryboard(text);
  if (!sb.ok) throw new StepError(`The storyboard could not be read: ${sb.problem}`);
  const shot = sb.value.storyboard.find((s) => s.shot === link.shot);
  if (!shot) throw new StepError(`The storyboard has no shot ${link.shot}.`);
  const textArtifactId = await storeText(deps, input.run, input.call, `${shotText(shot)}\n`, { label: `Shot ${shot.shot} as read`, name: `view/${tag}`, mediaType: 'text/plain' });
  if (!shot.clipArtifactId || !shot.lastFrameArtifactId) return { textArtifactId, imageArtifactIds: [], unobservable: noClipNote(shot.shot) };
  const groups = [
    ...(link.startFrame ? [{ caption: LINK_CAPTIONS.start, imageArtifactIds: [link.startFrame] }] : []),
    ...(shot.middleFrameArtifactId ? [{ caption: LINK_CAPTIONS.middle, imageArtifactIds: [shot.middleFrameArtifactId] }] : []),
    { caption: LINK_CAPTIONS.last, imageArtifactIds: [shot.lastFrameArtifactId] },
  ];
  return { textArtifactId, imageArtifactIds: groups.flatMap((g) => g.imageArtifactIds), groups };
}

/** "Wide screen 1 of 3", "Phone", "First screen". */
function shotLabel(surface: Surface, i: number, of: number): string {
  return of > 1 ? `${SURFACE_NAMES[surface]} ${i + 1} of ${of}` : SURFACE_NAMES[surface];
}
