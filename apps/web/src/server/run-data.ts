/**
 * What the Run screen polls: the runner's view of the run, plus the media type and a text excerpt of each artifact
 * it shows, so step rows and contact sheets can render drafts without fetching each artifact. Whether the run is
 * paused, its budget and its spend all come from the view itself (the run's status and its `cost` events).
 */
import type { Services } from '../services/index.ts';
import { ArtifactData, read } from '../view/events.ts';
import type { ArtifactInfo, RunData } from '../view/rundata.ts';

export type { ArtifactInfo, RunData } from '../view/rundata.ts';

const TEXT_TYPES = new Set(['text/markdown', 'text/plain', 'application/json', 'text/x-diff']);
const EXCERPT_BYTES = 16_000;

export async function artifactInfo(services: Services, ids: Iterable<string>): Promise<Record<string, ArtifactInfo>> {
  const out: Record<string, ArtifactInfo> = {};
  for (const id of new Set(ids)) {
    if (!(await services.store.artifacts.has(id))) continue;
    const { record, bytes } = await services.store.artifacts.get(id);
    const mediaType = record.mediaType.split(';')[0]?.trim() ?? 'application/octet-stream';
    out[id] = TEXT_TYPES.has(mediaType) ? { mediaType, text: new TextDecoder().decode(bytes.slice(0, EXCERPT_BYTES)) } : { mediaType };
  }
  return out;
}

export async function getRunData(services: Services, runId: string, afterSeq = 0): Promise<RunData> {
  const view = await services.runner.view(runId, afterSeq);
  const ids: string[] = [];
  for (const e of view.events) {
    if (e.type !== 'artifact') continue;
    const { artifactId } = read(ArtifactData, e.data);
    if (artifactId) ids.push(artifactId);
  }
  for (const cp of view.checkpoints) {
    if (cp.status !== 'open') continue;
    for (const o of cp.options ?? []) if (o.artifactId) ids.push(o.artifactId);
    ids.push(...(cp.artifactIds ?? []));
  }
  if (view.run.outputArtifactId) ids.push(view.run.outputArtifactId);
  return { view, artifacts: await artifactInfo(services, ids) };
}
