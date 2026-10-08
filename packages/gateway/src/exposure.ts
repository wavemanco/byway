import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ModelRef } from '@byway/contracts';
import { parsePurpose } from './mock/responders.ts';

/**
 * The exposure register (CR12, ADR-0055; convention C3). Once the product uses a model family as a quality gate, that
 * family is "exposed" and is retired as a held-out judge for the studies. The gateway records every judging call made
 * on a non-Anthropic family here, append-only, beside the ledger, and the evaluation side reads it in its lineage check
 * before computing confirmatory metrics. Exposure is counted by model line and role (ADR-0061 D22), so a line is
 * written the first time a model is used in a role in a workspace, with that date; later calls add nothing.
 *
 * Anthropic models are not recorded: they are the product's worker and critic family throughout and are never planned as
 * held-out judges. The demo mock is not a model family and is not recorded either.
 */

export const EXPOSURE_FILENAME = 'exposure.jsonl';

/** The register's file: beside the ledger in the data directory. */
export function exposurePath(ledgerPath: string): string {
  return join(dirname(ledgerPath), EXPOSURE_FILENAME);
}

export interface ExposureEntry {
  /** The provider the call went to (`openrouter` for a routed call). */
  provider: string;
  /** The model family: the provider, or for OpenRouter the upstream its model id names (`openai/…` is openai). */
  family: string;
  /** The model id as requested; the evaluation side groups ids into model lines. */
  model: string;
  /** The judging role of the call's purpose (critic, judge, select, rerank, check, tells-compare, gate). */
  role: string;
  workspaceId: string;
  /** The day (UTC, YYYY-MM-DD) the model was first used in this role in this workspace. */
  firstUsedOn: string;
}

/**
 * Purpose roles that judge work, so using a family in them makes it a quality gate (ADR-0055): the critic (every critic
 * loop has a hidden threshold), judges and selectors, the defect check, reranking and keep-or-revert comparisons, and
 * any explicit gate.
 */
const JUDGING_ROLES = new Set(['critic', 'judge', 'select', 'rerank', 'check', 'tells-compare', 'gate']);

export function isJudgingPurpose(purpose: string): boolean {
  return JUDGING_ROLES.has(parsePurpose(purpose).role);
}

/** The model family of a ref: its provider, or the upstream an OpenRouter model id names; undefined for the mock. */
export function familyOf(ref: ModelRef): string | undefined {
  if (ref.provider === 'mock') return undefined;
  if (ref.provider === 'openrouter') return ref.model.split('/')[0] || 'openrouter';
  return ref.provider;
}

const keyOf = (e: Pick<ExposureEntry, 'provider' | 'model' | 'role' | 'workspaceId'>) => JSON.stringify([e.provider, e.model, e.role, e.workspaceId]);

function parseLine(line: string): ExposureEntry | undefined {
  try {
    const v = JSON.parse(line) as Partial<ExposureEntry>;
    const fields = [v.provider, v.family, v.model, v.role, v.workspaceId, v.firstUsedOn];
    return fields.every((f) => typeof f === 'string' && f) ? (v as ExposureEntry) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The register as the evaluation side reads it: one entry per provider, model, role and workspace, with the earliest
 * date when two processes raced to record the same first use. Unparseable lines are skipped; a missing file is empty.
 */
export async function readExposure(path: string): Promise<ExposureEntry[]> {
  let text: string;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const byKey = new Map<string, ExposureEntry>();
  for (const line of text.split('\n')) {
    const entry = line.trim() ? parseLine(line) : undefined;
    if (!entry) continue;
    const seen = byKey.get(keyOf(entry));
    if (!seen || entry.firstUsedOn < seen.firstUsedOn) byKey.set(keyOf(entry), entry);
  }
  return [...byKey.values()];
}

/**
 * Appends first uses to the register. Appends in this process are serialized; the web app and the worker may both
 * write, and a race between them can at worst write one first use twice, which {@link readExposure} folds.
 */
export class ExposureRegister {
  readonly path: string;
  private known: Set<string> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  /** Records the call's model and role if this is its first judging use in the workspace; a no-op otherwise. */
  record(ref: ModelRef, purpose: string, workspaceId: string, now: Date): Promise<void> {
    const family = familyOf(ref);
    if (family === undefined || family === 'anthropic' || !isJudgingPurpose(purpose)) return Promise.resolve();
    const entry: ExposureEntry = { provider: ref.provider, family, model: ref.model, role: parsePurpose(purpose).role, workspaceId, firstUsedOn: now.toISOString().slice(0, 10) };
    const run = this.queue.then(() => this.append(entry));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async append(entry: ExposureEntry): Promise<void> {
    const key = keyOf(entry);
    if (this.known?.has(key)) return;
    // Another process may have recorded it since this one last looked.
    this.known = new Set((await readExposure(this.path)).map(keyOf));
    if (this.known.has(key)) return;
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, `${JSON.stringify(entry)}\n`, 'utf8');
    this.known.add(key);
  }
}
