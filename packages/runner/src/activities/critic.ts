/**
 * CRITIC lineups and modes (01 CRITIC, ADR-0071, ADR-0072). A GREAT-mode critic ranks our version among the user's
 * reference examples; it runs in GREAT mode only with at least 3 references, using up to its `refs` knob of them, with
 * ours at a shuffled position. With fewer it runs in OK mode against the hidden 9/10 bar, and the step says so.
 *
 * The critic never learns which item is ours (06-runbook): its slots are `greatLineup(R)` from @byway/prompts ("M items,
 * labelled A–X"), it ranks every label, and the runner finds our place in that ranking. It never sees a threshold.
 * Every item takes the same form (BLIND-1): the same number and kind of parts under its label, shown as the references
 * are shown, and never with process the references lack (a storyboard's image prompts). When the references and ours
 * differ in form (images against text, one image against several frames), every item is drawn on one card by one
 * template and reaches the critic as one image (cards.ts).
 */
import { createHash } from 'node:crypto';
import type { Medium } from '@byway/contracts';
import { GREAT_MIN_REFERENCES, greatLineup, labelled, labelOf } from '@byway/prompts/pure';
import { cardHtml, imageSize, type CardContent, type CardImage } from '../cards.ts';
import { textView, viewKindOf } from '../formats.ts';
import { labels } from '../labels.ts';
import type { ArtifactResolver } from '../pages.ts';
import { sectionOf, type CriticAnswer } from '../parse.ts';
import { SURFACE_CAPTIONS, SURFACES } from '../surfaces.ts';
import type { Ports, Score, StepSpec, Surface, View } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { memoized } from './memo.ts';
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
  /** How every item was shown (formOf). */
  form: LineupForm;
}

/**
 * One item of a lineup before it gets its label: its text, its images as groups (a page's surfaces under their
 * captions), and the images a card draws it with.
 */
interface Item {
  /** Ours, or a reference given as an image, as a page (HTML, rendered as ours was) or as text. */
  kind: 'ours' | 'image' | 'page' | 'text';
  text: string;
  groups: ImageGroup[];
  /** What a card draws: a storyboard's frames, a page's screenshots of one surface, the image itself. */
  frames: string[];
  layout: CardContent['layout'];
}

/** What a text critic reads under every label of a lineup shown as cards: the same words for every item. */
export const CARD_NOTE = '(shown in the image under this label)';

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

/** The surface a web page is drawn with on a card: the wide screen, unless the step's renders knob leaves it out. */
const cardSurface = (renders: readonly Surface[] | undefined): Surface => (renders?.length ? (SURFACES.find((s) => renders.includes(s)) ?? 'desktop') : 'desktop');

/** Our item: the view the critic consumes, a pool as one block; a web page by the surfaces its knob picks. */
async function oursItem(reader: ArtifactReader, medium: Medium, view: View | undefined, renders: readonly Surface[] | undefined): Promise<Item> {
  if (!view?.items.length) return { kind: 'ours', text: '', groups: [], frames: [], layout: 'grid' };
  const texts = await Promise.all(view.items.map((v) => reader.viewText(v)));
  const surface = cardSurface(renders);
  return {
    kind: 'ours',
    text: view.pool ? poolText(medium, texts) : (texts[0] ?? ''),
    groups: view.items.flatMap((v) => surfaceGroups(v, undefined, renders)),
    frames: view.items.flatMap((v) => (v.surfaces?.length ? (v.surfaces.find((s) => s.surface === surface) ?? v.surfaces[0]!).imageArtifactIds : v.imageArtifactIds)),
    layout: medium === 'web-page' ? 'stack' : 'grid',
  };
}

/** The renderer's artifact route, served from the store (a missing artifact is a 404). */
const artifactRoute =
  (deps: RunnerDeps): ArtifactResolver =>
  async (id) => {
    if (!(await deps.store.artifacts.has(id))) return undefined;
    const { record, bytes } = await deps.store.artifacts.get(id);
    return { body: bytes, contentType: record.mediaType };
  };

/**
 * A reference's screenshots or a card, made once in a run and kept (convention C5): a retried step shows the critic the
 * same images, so its request is the same and the answer already paid for is reused; and a reference looks the same
 * to every critic call of the run. The key names everything the images are made from (a reference's id and surfaces,
 * a card's HTML). Made fresh outside a run (unit tests).
 */
const kept = (deps: RunnerDeps, runId: string | undefined, key: string, make: () => Promise<string>): Promise<string> =>
  runId ? memoized(deps.store, runId, `lineup/${key}`, make) : make();

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 32);

/** A reference as the critic sees it: an image as itself, a page given as HTML rendered as ours was, text as its view. */
async function referenceItem(deps: RunnerDeps, reader: ArtifactReader, medium: Medium, ref: string, renders: readonly Surface[] | undefined, runId: string | undefined): Promise<Item> {
  if (await reader.isImage(ref)) return { kind: 'image', text: '', groups: [{ artifactIds: [ref] }], frames: [ref], layout: 'grid' };
  const pages = deps.pages;
  if (medium === 'web-page' && (await reader.mediaType(ref)).startsWith('text/html') && pages) {
    // The same named surfaces as ours (RENDER-1), so no item stands out by how it is shown.
    const surfaces = renders?.length ? renders : SURFACES;
    const shots = JSON.parse(
      await kept(deps, runId, `reference/${ref}/${surfaces.join(',')}`, async () => {
        const out: { surface: Surface; ids: string[] }[] = [];
        for (const { surface, tiles } of await pages.render(await reader.text(ref), artifactRoute(deps), surfaces)) {
          const ids: string[] = [];
          for (const t of tiles) ids.push((await deps.store.artifacts.put(t, 'image/png')).id);
          out.push({ surface, ids });
        }
        return JSON.stringify(out);
      }),
    ) as { surface: Surface; ids: string[] }[];
    const surface = cardSurface(renders);
    return {
      kind: 'page',
      text: '',
      groups: shots.map((s) => ({ caption: SURFACE_CAPTIONS[s.surface], artifactIds: s.ids })),
      frames: (shots.find((s) => s.surface === surface) ?? shots[0])?.ids ?? [],
      layout: 'stack',
    };
  }
  return { kind: 'text', text: textView(medium, await reader.text(ref)), groups: [], frames: [], layout: 'grid' };
}

/** One item drawn on a card (cards.ts) and rendered to one PNG; its artifact id. */
async function cardOf(deps: RunnerDeps, item: Item, text: string, runId: string | undefined): Promise<string> {
  const images: CardImage[] = [];
  for (const id of item.frames) images.push({ artifactId: id, ...(imageSize((await deps.store.artifacts.get(id)).bytes) ?? {}) });
  const html = cardHtml({ images, layout: item.layout, text });
  return kept(deps, runId, `card/${hashOf(html)}`, async () => {
    if (!deps.pages) throw new StepError('The examples could not be shown to the critic alongside the work: no page renderer is configured.');
    const [shot] = await deps.pages.render(html, artifactRoute(deps), ['desktop']);
    const png = shot?.tiles[0];
    if (!png) throw new StepError('The examples could not be shown to the critic alongside the work: a card came out empty.');
    return (await deps.store.artifacts.put(png, 'image/png')).id;
  });
}

/**
 * How every item of a lineup reaches the critic (BLIND-1). The references decide, and ours takes their form:
 * - `surfaces`: a web page against pages given as HTML: every item by the same named surfaces, each under its caption;
 * - `text`: no item has images, or every reference is text and ours has text too: every item as text only (our
 *   frames are left out: they would be the only images);
 * - `cards`: anything else (images against text, several frames against single images, a page against images): every
 *   item as one card image, drawn by one template and rendered by one renderer.
 */
export type LineupForm = 'surfaces' | 'text' | 'cards';

function formOf(medium: Medium, mine: Item, others: readonly Item[]): LineupForm {
  if (medium === 'web-page' && mine.groups.length && others.every((o) => o.kind === 'page')) return 'surfaces';
  if (![mine, ...others].some((i) => i.frames.length)) return 'text';
  if (others.every((o) => o.kind === 'text') && mine.text.trim()) return 'text';
  return 'cards';
}

/**
 * One GREAT lineup: the references and ours in shuffled positions, each under its label, every item in the same form
 * (formOf). On cards, when no reference has text, ours is drawn by its frames only: a storyboard's words would make it
 * the one card that reads differently. `runId` keeps the screenshots and cards for the run (and so for retries).
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
  runId?: string,
): Promise<Lineup> {
  const size = refs.length + 1;
  const order = shuffled ? shuffle([...refs], random) : [...refs];
  const ours = shuffled ? Math.floor(random() * size) : size - 1;
  const others: Item[] = [];
  for (const ref of order) others.push(await referenceItem(deps, reader, medium, ref, renders, runId));
  const mine = await oursItem(reader, medium, ports.view, renders);
  const items: Item[] = [];
  for (let i = 0, r = 0; i < size; i++) items.push(i === ours ? mine : others[r++]!);
  const form = formOf(medium, mine, others);
  let view: string;
  const images: ImageGroup[] = [];
  if (form === 'surfaces') {
    view = '';
    items.forEach((item, i) => images.push(...item.groups.map((g) => ({ ...g, label: labelOf(i) }))));
  } else if (form === 'text') {
    view = labelled(items.map((item) => (item.text.trim() ? item.text : '(empty)')));
  } else {
    const framesOnly = others.every((o) => !o.text.trim());
    for (const [i, item] of items.entries()) {
      const text = item.kind === 'ours' && framesOnly && item.frames.length ? '' : item.text;
      images.push({ label: labelOf(i), artifactIds: [await cardOf(deps, item, text, runId)] });
    }
    view = viewKindOf(medium) === 'screenshots' ? '' : labelled(items.map(() => CARD_NOTE));
  }
  return { slots: { ...greatLineup(refs.length), view }, images, labels: labels(size), ours: labelOf(ours), form };
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
