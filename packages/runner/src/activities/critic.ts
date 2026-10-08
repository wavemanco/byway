/**
 * CRITIC lineups and modes (01 CRITIC, ADR-0071, ADR-0072). A GREAT-mode critic ranks our version among the user's
 * reference examples; it runs in GREAT mode only with at least 3 references, using up to its `refs` knob of them, with
 * ours at a shuffled position. With fewer it runs in OK mode against the hidden 9/10 bar, and the step says so.
 *
 * The critic never learns which item is ours (06-runbook): its slots are `greatLineup(R)` from @byway/prompts ("M items,
 * labelled A–X"), it ranks every label, and the runner finds our place in that ranking. It never sees a threshold.
 * Every item takes the same form (BLIND-1): one block under one label, shown as the references are shown, and never
 * with process the references lack (a storyboard's image prompts).
 */
import type { Medium } from '@byway/contracts';
import { GREAT_MIN_REFERENCES, greatLineup, labelled, labelOf } from '@byway/prompts/pure';
import { textView, viewKindOf } from '../formats.ts';
import { labels } from '../labels.ts';
import { sectionOf, type CriticAnswer } from '../parse.ts';
import { SURFACE_CAPTIONS, SURFACES } from '../surfaces.ts';
import type { Ports, Score, StepSpec, Surface, View } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { ArtifactReader, surfaceGroups, type ImageGroup, type Slots } from './prompting.ts';

/** 01 CRITIC: up to 10 references. */
export const MAX_REFS = 10;

/** The step note when a GREAT critic ran in OK mode because no references were given (ADR-0071, word for word). */
export const OK_FALLBACK_NOTE = 'No examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples.';
/** The same fallback when one or two references were given: the note says what the person supplied (LABEL-2). */
export const FEW_REFS_NOTE = 'Fewer than three examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples.';

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
  if (refs.length < GREAT_MIN_REFERENCES) return { mode: 'OK', note: refs.length ? FEW_REFS_NOTE : OK_FALLBACK_NOTE, refs: [], shuffles: 1, shuffle: shuffled };
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

/** One item of a lineup before it gets its label: its text for the view slot and its images. */
interface Item {
  text: string;
  images: ImageGroup[];
}

/**
 * A pool's members as one lineup item (ENG-7): C2's option set is ranked whole against prior art, so its members go
 * in one block. Options become one numbered list, as a reference's options read; anything else is numbered "Option N"
 * under a heading too deep to pass for a lineup label.
 */
export function poolText(medium: Medium, texts: readonly string[]): string {
  const parts = texts.map((t) => t.trim()).filter(Boolean);
  if (medium === 'options') {
    let n = 0;
    return parts.map((t) => t.replace(/^\d+\.(?=\s)/gm, () => `${++n}.`)).join('\n');
  }
  return parts.map((t, i) => `#### Option ${i + 1}\n${t}`).join('\n\n');
}

/** Our item: the view the critic consumes, a pool as one block; a web page by the surfaces its knob picks. */
async function oursItem(reader: ArtifactReader, medium: Medium, view: View | undefined, renders: readonly Surface[] | undefined): Promise<Item> {
  if (!view?.items.length) return { text: '', images: [] };
  const texts = await Promise.all(view.items.map((v) => reader.viewText(v)));
  return { text: view.pool ? poolText(medium, texts) : (texts[0] ?? ''), images: view.items.flatMap((v) => surfaceGroups(v, undefined, renders)) };
}

/** A reference as the critic sees it: an image as itself, a page given as HTML rendered as ours was, text as its view. */
async function referenceItem(deps: RunnerDeps, reader: ArtifactReader, medium: Medium, ref: string, renders: readonly Surface[] | undefined): Promise<Item> {
  if (await reader.isImage(ref)) return { text: '', images: [{ artifactIds: [ref] }] };
  if (medium === 'web-page' && (await reader.mediaType(ref)).startsWith('text/html') && deps.pages) {
    // The same named surfaces as ours (RENDER-1), so no item stands out by how it is shown.
    const shots = await deps.pages.render(
      await reader.text(ref),
      async (id) => {
        if (!(await deps.store.artifacts.has(id))) return undefined;
        const { record, bytes } = await deps.store.artifacts.get(id);
        return { body: bytes, contentType: record.mediaType };
      },
      renders?.length ? renders : SURFACES,
    );
    const images: ImageGroup[] = [];
    for (const { surface, tiles } of shots) {
      const ids: string[] = [];
      for (const t of tiles) ids.push((await deps.store.artifacts.put(t, 'image/png')).id);
      images.push({ caption: SURFACE_CAPTIONS[surface], artifactIds: ids });
    }
    return { text: '', images };
  }
  return { text: textView(medium, await reader.text(ref)), images: [] };
}

/**
 * One GREAT lineup: the references and ours in shuffled positions, each under its label. Text media put every item's
 * text in the view slot; screenshot media attach every item's images under its label, each surface under its caption.
 * When every reference is images only, ours is shown by its images only too (BLIND-1): a storyboard's text would be the
 * one item that reads differently, and so the one the critic could pick out as ours.
 */
export async function buildLineup(
  deps: RunnerDeps,
  reader: ArtifactReader,
  medium: Medium,
  ports: Ports,
  refs: readonly string[],
  random: () => number,
  shuffled = true,
  renders?: readonly Surface[],
): Promise<Lineup> {
  const size = refs.length + 1;
  const order = shuffled ? shuffle([...refs], random) : [...refs];
  const ours = shuffled ? Math.floor(random() * size) : size - 1;
  const others: Item[] = [];
  for (const ref of order) others.push(await referenceItem(deps, reader, medium, ref, renders));
  const mine = await oursItem(reader, medium, ports.view, renders);
  if (others.every((o) => !o.text.trim()) && mine.images.length) mine.text = '';
  const texts: string[] = [];
  const images: ImageGroup[] = [];
  let r = 0;
  for (let i = 0; i < size; i++) {
    const label = labelOf(i);
    const item = i === ours ? mine : others[r++]!;
    texts.push(item.text);
    images.push(...item.images.map((g) => ({ ...g, label })));
  }
  const anyText = texts.some((t) => t.trim());
  const view = anyText ? labelled(texts.map((t) => t || '(see the images under this label)')) : viewKindOf(medium) === 'screenshots' ? '' : labelled(texts.map(() => '(see the images under this label)'));
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
 * whole critique when the critic wrote no section for it. OK answers pass through. `writtenFor`, the lineup size the
 * step's refs knob plans for (refs + 1), goes with a rank so its gate can scale (GATE-1).
 */
export function verdictOf(answers: readonly { answer: CriticAnswer; lineup?: Lineup }[], writtenFor?: number): CriticVerdict {
  const first = answers[0]!;
  if (first.answer.mode === 'OK') return { critique: first.answer.critique, score: { kind: 'score', value: first.answer.score } };
  const places = answers.map(({ answer, lineup }) => (answer.mode === 'GREAT' && lineup ? answer.ranking.indexOf(lineup.ours) + 1 : 0));
  const rank = places.reduce((a, b) => a + b, 0) / places.length;
  const critique = sectionOf(first.answer.critique, first.lineup!.ours) ?? first.answer.critique;
  return { critique, score: { kind: 'rank', rank, of: first.lineup!.labels.length, ...(writtenFor ? { writtenFor } : {}) } };
}

/** The lineup size a critic's rank gate is written for: its refs knob plus ours (undefined without the knob). */
export const lineupWrittenFor = (step: Pick<StepSpec, 'knobs'>): number | undefined => (typeof step.knobs?.refs === 'number' && step.knobs.refs > 0 ? step.knobs.refs + 1 : undefined);
