/**
 * What the Run screen polls: the runner's view of the run, plus the media type and a text excerpt of each artifact
 * it shows, so step rows and contact sheets can render drafts without fetching each artifact. Whether the run is
 * paused, its budget and its spend all come from the view itself (the run's status and its `cost` events); once the run
 * has ended, the spend book also says how many of its calls are still under way and what it has settled (endedSpend).
 *
 * The excerpt is marked as one (complete, bytes) and never ends in half a character; a diff's size and an option map's
 * titles are counted here from the whole artifact, so a step row never states a count of the excerpt as the
 * artifact's (F13, ADR-0086). The whole text itself is never polled: a view that needs it loads it once.
 */
import type { RunRecord, RunView } from '@byway/contracts';
import type { QuestionCosts } from '../view/questions.ts';
import type { Services } from '../services/index.ts';
import { parseUnifiedDiff } from '../view/diff.ts';
import { ArtifactData, read } from '../view/events.ts';
import { parseOptions } from '../view/result.ts';
import { isEnded } from '../view/run.ts';
import type { ArtifactInfo, EndedSpend, RunData } from '../view/rundata.ts';

export type { ArtifactInfo, RunData } from '../view/rundata.ts';

const TEXT_TYPES = new Set(['text/markdown', 'text/plain', 'application/json', 'text/x-diff']);
export const EXCERPT_BYTES = 16_000;

/** Facts about the whole artifact that a step row states: a diff's size, an option map's titles. */
function wholeFacts(mediaType: string, bytes: Uint8Array): Pick<ArtifactInfo, 'diffstat' | 'titles'> {
  if (mediaType !== 'text/x-diff' && mediaType !== 'application/json') return {};
  const text = new TextDecoder().decode(bytes);
  if (mediaType === 'text/x-diff') {
    const { files } = parseUnifiedDiff(text);
    return { diffstat: { files: files.length, additions: files.reduce((n, f) => n + f.additions, 0), deletions: files.reduce((n, f) => n + f.deletions, 0) } };
  }
  const options = parseOptions(text);
  return options ? { titles: options.map((o) => o.title) } : {};
}

/** A text artifact's info: the excerpt, cut on a character boundary (a streaming decode holds back a split character). */
function textInfo(mediaType: string, bytes: Uint8Array): ArtifactInfo {
  const complete = bytes.length <= EXCERPT_BYTES;
  const excerpt = complete ? new TextDecoder().decode(bytes) : new TextDecoder().decode(bytes.subarray(0, EXCERPT_BYTES), { stream: true });
  return { mediaType, excerpt, complete, bytes: bytes.length, ...wholeFacts(mediaType, bytes) };
}

/**
 * An artifact the Run screen reads, or undefined when it is missing or damaged. A damaged file is left out, as a missing
 * one is, so one bad artifact does not fail the whole run's screen and every poll: both artifactInfo and the price beside
 * an open question (api.ts questionCosts) read through here. Matched by name: the store may come from another server
 * bundle.
 */
export async function readIntact(services: Services, id: string): Promise<Awaited<ReturnType<Services['store']['artifacts']['get']>> | undefined> {
  if (!(await services.store.artifacts.has(id))) return undefined;
  try {
    return await services.store.artifacts.get(id);
  } catch (e) {
    if (e instanceof Error && e.name === 'ArtifactCorruptError') return undefined;
    throw e;
  }
}

export async function artifactInfo(services: Services, ids: Iterable<string>): Promise<Record<string, ArtifactInfo>> {
  const out: Record<string, ArtifactInfo> = {};
  for (const id of new Set(ids)) {
    const got = await readIntact(services, id);
    if (!got) continue;
    const { record, bytes } = got;
    const mediaType = record.mediaType.split(';')[0]?.trim() ?? 'application/octet-stream';
    out[id] = TEXT_TYPES.has(mediaType) ? textInfo(mediaType, bytes) : { mediaType };
  }
  return out;
}

/** Prices the run's open questions (api.ts questionCosts); undefined when the run's recipe is not known. */
export type QuestionPricer = (run: RunRecord, checkpoints: RunView['checkpoints']) => Promise<QuestionCosts | undefined>;

export async function getRunData(services: Services, runId: string, afterSeq = 0, price?: QuestionPricer): Promise<RunData> {
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
  const ended = isEnded(view.run.status) ? await endedSpend(services, view.run) : undefined;
  const questions = price ? await price(view.run, view.checkpoints) : undefined;
  return { view, artifacts: await artifactInfo(services, ids), ...(ended ? { ended } : {}), ...(questions ? { questions } : {}) };
}

/**
 * An ended run's calls still under way and its settled cost, from the spend book (RunData.ended). The calls under way are
 * read first: once none is left, every call of the run has settled, been released or been listed as may have been
 * billed, so the settled cost read after them is final. Best effort: if the book cannot be read the screen stops
 * polling at the end, as it did before, rather than the whole poll failing.
 */
async function endedSpend(services: Services, run: Pick<RunRecord, 'id' | 'workspaceId'>): Promise<EndedSpend | undefined> {
  try {
    const { inFlight } = await services.gateway.spendRecords(run.workspaceId);
    const callsUnderWay = inFlight.filter((c) => c.runId === run.id).length;
    const settledUsd = (await services.gateway.spend(run.workspaceId)).byRun[run.id] ?? 0;
    return { callsUnderWay, settledUsd };
  } catch {
    return undefined;
  }
}
