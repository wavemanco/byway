/**
 * CRITIC lineups and modes (01 CRITIC, ADR-0071). A GREAT-mode critic ranks our version among the user's reference
 * examples; it runs in GREAT mode only with at least 3 references, using up to its `refs` knob of them in shuffled
 * positions. With fewer it runs in OK mode against the hidden 9/10 bar, and the step says so in plain words.
 * The critic never sees a threshold: only the lineup line "There are R references and 1 of ours (M items, …)".
 */
import { textView, viewKindOf } from '../formats.ts';
import { labelled, labelOf } from '../labels.ts';
import type { Ports, StepSpec } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { ArtifactReader, viewParts, type ImageGroup, type Slots } from './prompting.ts';
import type { Medium } from '@byway/contracts';

/** GREAT mode needs at least this many references (ADR-0071). */
export const GREAT_MIN_REFS = 3;
/** 01 CRITIC: up to 10 references. */
export const MAX_REFS = 10;

/** The step note when a GREAT critic ran in OK mode for want of references (ADR-0071, word for word). */
export const OK_FALLBACK_NOTE = 'No examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples.';

export interface CriticPlan {
  mode: 'OK' | 'GREAT';
  /** Set when the recipe asked for GREAT and the run fell back to OK. */
  note?: string;
  /** References to use (GREAT), already chosen. */
  refs: string[];
  /** How many fixed lineup orders to average (the C5 gate's "2 fixed shuffles averaged"). */
  shuffles: number;
}

export function planCritic(step: Pick<StepSpec, 'knobs'>, refs: readonly string[], random: () => number): CriticPlan {
  const knobs = step.knobs ?? {};
  const shuffles = typeof knobs.shuffles === 'number' && knobs.shuffles > 1 ? Math.min(4, Math.floor(knobs.shuffles)) : 1;
  if (knobs.mode !== 'GREAT') return { mode: 'OK', refs: [], shuffles: 1 };
  if (refs.length < GREAT_MIN_REFS) return { mode: 'OK', note: OK_FALLBACK_NOTE, refs: [], shuffles: 1 };
  const want = typeof knobs.refs === 'number' && knobs.refs > 0 ? knobs.refs : MAX_REFS;
  const take = Math.min(refs.length, want, MAX_REFS);
  return { mode: 'GREAT', refs: shuffle([...refs], random).slice(0, Math.max(GREAT_MIN_REFS, take)), shuffles };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

export interface Lineup {
  slots: Slots;
  images: ImageGroup[];
  /** M: the references plus ours. */
  size: number;
}

/**
 * One GREAT lineup: the references and ours in shuffled positions, each under its label. Text media put every item's
 * text in the view slot; screenshot media attach every item's images under its label (a reference page given as HTML
 * is screenshotted the way ours was).
 */
export async function greatLineup(deps: RunnerDeps, reader: ArtifactReader, medium: Medium, ports: Ports, refs: readonly string[], random: () => number): Promise<Lineup> {
  const size = refs.length + 1;
  const ours = Math.floor(random() * size);
  const oursView = await viewParts(reader, ports.view);
  const texts: string[] = [];
  const images: ImageGroup[] = [];
  let r = 0;
  for (let i = 0; i < size; i++) {
    const label = labelOf(i);
    if (i === ours) {
      texts.push(oursView.text);
      images.push(...oursView.images.map((g) => ({ label, artifactIds: g.artifactIds })));
      continue;
    }
    const ref = refs[r++] as string;
    if (await reader.isImage(ref)) {
      texts.push('');
      images.push({ label, artifactIds: [ref] });
    } else if (medium === 'web-page' && (await reader.mediaType(ref)).startsWith('text/html') && deps.pages) {
      const tiles = await deps.pages.screenshots(await reader.text(ref), async (id) => {
        const { record, bytes } = await deps.store.artifacts.get(id);
        return { body: bytes, contentType: record.mediaType };
      });
      const ids = [];
      for (const t of tiles) ids.push((await deps.store.artifacts.put(t, 'image/png')).id);
      texts.push('');
      images.push({ label, artifactIds: ids });
    } else {
      texts.push(textView(medium, await reader.text(ref)));
    }
  }
  const anyText = texts.some((t) => t.trim());
  const view = anyText ? labelled(texts.map((t) => t || '(see the images under this label)')) : viewKindOf(medium) === 'screenshots' ? '' : labelled(texts);
  return {
    size,
    images,
    slots: { refs: String(refs.length), labels: `${size} items, labelled A–${labelOf(size - 1)}; ours is ${labelOf(ours)}`, view },
  };
}
