/**
 * The `renderView` activity (RENDER glue, spec §3.2 "Views by medium"): the artifact as its audience meets it.
 * - web-page: full-page screenshots at 1440 wide, tiled (Playwright);
 * - prose and code-diff: the text itself (the view is the artifact);
 * - options: a numbered plain-text list;
 * - media: the storyboard as text plus each shot's frame image when it exists.
 * A pool (an option set) gets one view per candidate, shown side by side under labels.
 */
import { parseStoryboard, textView } from '../formats.ts';
import type { RenderInput, RenderResult, ViewRef } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { stepFinished, stepStarted } from './steps.ts';
import { announce, storeText } from './writes.ts';

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
        const tiles = await deps.pages.screenshots(text, async (id) => {
          if (!(await deps.store.artifacts.has(id))) return undefined;
          const { record, bytes } = await deps.store.artifacts.get(id);
          return { body: bytes, contentType: record.mediaType };
        });
        const ids: string[] = [];
        for (const [t, png] of tiles.entries()) {
          const record = await deps.store.artifacts.put(png, 'image/png');
          ids.push(record.id);
          await announce(deps, run.runId, call, record.id, 'image/png', { label: `Screenshot ${t + 1} of ${tiles.length}`, name: `view/${tag}/${t}` });
        }
        outputs.push(...ids);
        items.push({ imageArtifactIds: ids });
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
