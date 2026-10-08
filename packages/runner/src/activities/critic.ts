/**
 * CRITIC lineups and modes (01 CRITIC, ADR-0071, ADR-0072). A GREAT-mode critic ranks our version among the user's
 * reference examples; it runs in GREAT mode only with at least 3 references, using up to its `refs` knob of them, with
 * ours at a shuffled position. With fewer it runs in OK mode against the hidden 9/10 bar, and the step says so.
 *
 * The critic never learns which item is ours (06-runbook): its slots are `greatLineup(R)` from @byway/prompts ("M items,
 * labelled A–X"), it ranks every label, and the runner finds our place in that ranking. It never sees a threshold.
 */
import type { Medium } from '@byway/contracts';
import { GREAT_MIN_REFERENCES, greatLineup, labelled, labelOf } from '@byway/prompts/pure';
import { textView, viewKindOf } from '../formats.ts';
import { labels } from '../labels.ts';
import { sectionOf, type CriticAnswer } from '../parse.ts';
import type { Ports, Score, StepSpec } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { ArtifactReader, viewParts, type ImageGroup, type Slots } from './prompting.ts';

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
  /** Shuffle positions (the `shuffle` knob; on unless a recipe turns it off, when ours goes last). */
  shuffle: boolean;
}

export function planCritic(step: Pick<StepSpec, 'knobs'>, refs: readonly string[], random: () => number): CriticPlan {
  const knobs = step.knobs ?? {};
  const shuffles = typeof knobs.shuffles === 'number' && knobs.shuffles > 1 ? Math.min(4, Math.floor(knobs.shuffles)) : 1;
  const shuffled = knobs.shuffle !== false;
  if (knobs.mode !== 'GREAT') return { mode: 'OK', refs: [], shuffles: 1, shuffle: shuffled };
  if (refs.length < GREAT_MIN_REFERENCES) return { mode: 'OK', note: OK_FALLBACK_NOTE, refs: [], shuffles: 1, shuffle: shuffled };
  const want = typeof knobs.refs === 'number' && knobs.refs > 0 ? knobs.refs : MAX_REFS;
  const take = Math.min(refs.length, want, MAX_REFS);
  const chosen = (shuffled ? shuffle([...refs], random) : [...refs]).slice(0, Math.max(GREAT_MIN_REFERENCES, take));
  return { mode: 'GREAT', refs: chosen, shuffles, shuffle: shuffled };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

export interface Lineup {
  /** The critic's slots: `refs` and `labels` from greatLineup, and the lineup's texts under their labels in `view`. */
  slots: Slots;
  images: ImageGroup[];
  /** Every label, in lineup order (A, B, C…). */
  labels: string[];
  /** Our item's label: known to the runner, never to the critic. */
  ours: string;
}

/**
 * One GREAT lineup: the references and ours in shuffled positions, each under its label. Text media put every item's
 * text in the view slot; screenshot media attach every item's images under its label (a reference page given as HTML
 * is screenshotted the way ours was).
 */
export async function buildLineup(deps: RunnerDeps, reader: ArtifactReader, medium: Medium, ports: Ports, refs: readonly string[], random: () => number, shuffled = true): Promise<Lineup> {
  const size = refs.length + 1;
  const order = shuffled ? shuffle([...refs], random) : [...refs];
  const ours = shuffled ? Math.floor(random() * size) : size - 1;
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
    const ref = order[r++] as string;
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
  return { slots: { ...greatLineup(refs.length), view }, images, labels: labels(size), ours: labelOf(ours) };
}

/** What a critic step hands on: its critique (ours only, in GREAT mode) and its score or our averaged rank. */
export interface CriticVerdict {
  critique: string;
  score: Score;
}

/**
 * Our place in each GREAT ranking (1 = best), averaged over the step's shuffles (03 C5 gate: "2 fixed shuffles
 * averaged"); the critique handed to the fix is our item's own section of the first answer, heading stripped, or the
 * whole critique when the critic wrote no section for it. OK answers pass through.
 */
export function verdictOf(answers: readonly { answer: CriticAnswer; lineup?: Lineup }[]): CriticVerdict {
  const first = answers[0]!;
  if (first.answer.mode === 'OK') return { critique: first.answer.critique, score: { kind: 'score', value: first.answer.score } };
  const places = answers.map(({ answer, lineup }) => (answer.mode === 'GREAT' && lineup ? answer.ranking.indexOf(lineup.ours) + 1 : 0));
  const rank = places.reduce((a, b) => a + b, 0) / places.length;
  const critique = sectionOf(first.answer.critique, first.lineup!.ours) ?? first.answer.critique;
  return { critique, score: { kind: 'rank', rank, of: first.lineup!.labels.length } };
}
