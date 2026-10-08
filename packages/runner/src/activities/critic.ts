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
 *
 * On cards no word is lost silently (F13, ADR-0087). A critic that reads text (prose, options, a diff) gets every item's
 * whole words under its label, as a text lineup would give them, and the cards carry only pictures. A critic that sees
 * only images (an ad, a page) gets the words on the cards, as its template says; a card cuts what does not fit one
 * image visibly, the cut is kept with the card for the run, and the step's note says whose words were cut and how
 * many the critic saw, naming items as the person knows them and never by their blind labels.
 */
import { createHash } from 'node:crypto';
import type { Medium } from '@byway/contracts';
import { GREAT_MIN_REFERENCES, greatLineup, labelled, labelOf } from '@byway/prompts/pure';
import { cardHtml, fitCard, imageSize, type CardContent, type CardImage } from '../cards.ts';
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
  /** The items whose card left words out (only an image-only critic's cards cut words), for the step's note. */
  cut: LineupCut[];
}

/** An item whose card showed the critic only some of its words: who it is, never its blind label, and how many. */
export interface LineupCut {
  /** Ours, or a reference by its artifact id. */
  item: 'ours' | { ref: string };
  shownWords: number;
  totalWords: number;
  /**
   * A text reference's opening words, by which the note names it. Not a number: the person never sees the blind
   * labels, and the Start form numbers blank example fields that are dropped before the run.
   */
  begins?: string;
}

/**
 * One item of a lineup before it gets its label: its text, its images as groups (a page's surfaces under their
 * captions), and the images a card draws it with.
 */
interface Item {
  /** Ours, or a reference given as an image, as a page (HTML, rendered as ours was) or as text. */
  kind: 'ours' | 'image' | 'page' | 'text';
  /** A reference's artifact id. */
  ref?: string;
  text: string;
  groups: ImageGroup[];
  /** What a card draws: a storyboard's frames, a page's screenshots of one surface, the image itself. */
  frames: string[];
  layout: CardContent['layout'];
}

/** What a text critic reads under the label of a card lineup's item that has no words: its image shows it. */
export const CARD_NOTE = '(shown in the image under this label)';

/** The one line a card draws, for a critic that reads text, in place of its item's words: they are under its label. */
export const WORDS_UNDER_LABEL = 'Its words are written out under this label.';

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
  if (await reader.isImage(ref)) return { kind: 'image', ref, text: '', groups: [{ artifactIds: [ref] }], frames: [ref], layout: 'grid' };
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
      ref,
      text: '',
      groups: shots.map((s) => ({ caption: SURFACE_CAPTIONS[s.surface], artifactIds: s.ids })),
      frames: (shots.find((s) => s.surface === surface) ?? shots[0])?.ids ?? [],
      layout: 'stack',
    };
  }
  return { kind: 'text', ref, text: textView(medium, await reader.text(ref)), groups: [], frames: [], layout: 'grid' };
}

/** A text's first few words, as the step note quotes them to name a reference (punctuation-only runs skipped). */
export function openingWords(text: string, max = 6): string {
  const words = (text.match(/\S+/g) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const shown = words.slice(0, max).join(' ');
  const clipped = shown.length > 60 ? shown.slice(0, 60).trimEnd() : shown;
  return clipped.length < shown.length || words.length > max ? `${clipped}…` : clipped;
}

/** An item as the person knows it, for a message: never its blind label. */
function nameOf(item: Item): string {
  if (item.kind === 'ours') return 'your work';
  if (item.kind === 'text') return `the example that begins “${openingWords(item.text)}”`;
  return item.kind === 'image' ? 'one of the example images' : 'one of the example pages';
}

/** A card as kept for the run: its PNG's artifact id, and the words it left out, if any. */
interface KeptCard {
  artifactId: string;
  cut?: { shownWords: number; totalWords: number };
}

/**
 * One item drawn on a card (cards.ts) and rendered to exactly one PNG. For a critic that reads text the card carries
 * the item's pictures and, when it has words, one line saying they are under its label; it is rendered once. For an
 * image-only critic the card carries the words too, fitted into one image by fitCard, which cuts them visibly when
 * they do not fit. A card that does not fit one image stops the step: its first tile is never shown as if it were the
 * whole card. The card and its cut are kept together under the uncut card's page (`card2/`; the earlier `card/` memos
 * held a bare id), so a retried step shows the same card and reports the same cut.
 */
async function cardOf(deps: RunnerDeps, item: Item, text: string, readsText: boolean, runId: string | undefined): Promise<KeptCard> {
  const images: CardImage[] = [];
  for (const id of item.frames) images.push({ artifactId: id, ...(imageSize((await deps.store.artifacts.get(id)).bytes) ?? {}) });
  const card: CardContent = { images, layout: item.layout, text: readsText ? (text.trim() ? WORDS_UNDER_LABEL : '') : text };
  const value = await kept(deps, runId, `card2/${hashOf(cardHtml(card))}`, async () => {
    const pages = deps.pages;
    if (!pages) throw new StepError('The examples could not be shown to the critic alongside the work: no page renderer is configured.');
    const render = async (html: string) => (await pages.render(html, artifactRoute(deps), ['desktop']))[0]?.tiles ?? [];
    const fitted = await fitCard(card, render, { cut: !readsText });
    if (!fitted.ok) {
      throw new StepError(
        fitted.reason === 'empty'
          ? 'The examples could not be shown to the critic alongside the work: a card came out empty.'
          : `The examples could not be shown to the critic alongside the work: the card for ${nameOf(item)} does not fit in one picture.`,
      );
    }
    const entry: KeptCard = { artifactId: (await deps.store.artifacts.put(fitted.png, 'image/png')).id, ...(fitted.cut ? { cut: fitted.cut } : {}) };
    return JSON.stringify(entry);
  });
  return JSON.parse(value) as KeptCard;
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
 * the one card that reads differently. Each item's words are decided once, and that one value goes where the critic
 * reads words (F13): under the item's label for a critic that reads text, on its card for one that sees only images.
 * So whether a label carries words follows whether its item has words, never whether it is ours. `runId` keeps the
 * screenshots and cards, with any cut, for the run (and so for retries).
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
  const cut: LineupCut[] = [];
  if (form === 'surfaces') {
    view = '';
    items.forEach((item, i) => images.push(...item.groups.map((g) => ({ ...g, label: labelOf(i) }))));
  } else if (form === 'text') {
    view = labelled(items.map((item) => (item.text.trim() ? item.text : '(empty)')));
  } else {
    const framesOnly = others.every((o) => !o.text.trim());
    const texts = items.map((item) => (item.kind === 'ours' && framesOnly && item.frames.length ? '' : item.text));
    const readsText = viewKindOf(medium) === 'text';
    for (const [i, item] of items.entries()) {
      const card = await cardOf(deps, item, texts[i]!, readsText, runId);
      images.push({ label: labelOf(i), artifactIds: [card.artifactId] });
      if (card.cut) cut.push({ item: item.kind === 'ours' ? 'ours' : { ref: item.ref! }, ...card.cut, ...(item.kind === 'text' ? { begins: openingWords(item.text) } : {}) });
    }
    view = readsText ? labelled(texts.map((t) => (t.trim() ? t : CARD_NOTE))) : '';
  }
  return { slots: { ...greatLineup(refs.length), view }, images, labels: labels(size), ours: labelOf(ours), form, cut };
}

const count = new Intl.NumberFormat('en-US');

/**
 * The sentence a critic step adds to its note when a card left words out (F13): whose words, and how many of them the
 * critic saw. One sentence over all of the step's shuffles: an item's card is the same in each, so it is named once
 * (with the fewest words shown, should two ever differ). Items are named as the person knows them, your work first,
 * then each example by its opening words; never by a blind label. Undefined when nothing was cut.
 */
export function cutNote(lineups: readonly (Lineup | undefined)[]): string | undefined {
  const byItem = new Map<string, LineupCut>();
  for (const c of lineups.flatMap((l) => l?.cut ?? [])) {
    const key = c.item === 'ours' ? 'ours' : `ref:${c.item.ref}`;
    const had = byItem.get(key);
    if (!had || c.shownWords < had.shownWords) byItem.set(key, c);
  }
  if (!byItem.size) return undefined;
  const cuts = [...byItem.values()].sort((a, b) => Number(b.item === 'ours') - Number(a.item === 'ours'));
  const parts = cuts.map((c) => {
    const seen = c.shownWords ? `the first ${count.format(c.shownWords)} of ${count.format(c.totalWords)} words` : `none of the ${count.format(c.totalWords)} words`;
    const whose = c.item === 'ours' ? 'your work' : c.begins ? `the example that begins “${c.begins}”` : 'one of the examples';
    return `${seen} of ${whose}`;
  });
  const listed = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `The outside critic was not shown every word: it saw ${listed}.`;
}

/** What a critic step hands on: its critique (ours only, in GREAT mode) and its score or our averaged rank. */
export interface CriticVerdict {
  critique: string;
  score: Score;
  /** For the step's note: whose words a card cut, and how many the critic saw (cutNote). */
  note?: string;
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
  const note = cutNote(answers.map((a) => a.lineup));
  return { critique, score: { kind: 'rank', rank, of: first.lineup!.labels.length, ...(writtenFor ? { writtenFor } : {}) }, ...(note ? { note } : {}) };
}

/** The lineup size a critic's rank gate is written for: its refs knob plus ours (undefined without the knob). */
export const lineupWrittenFor = (step: Pick<StepSpec, 'knobs'>): number | undefined => (typeof step.knobs?.refs === 'number' && step.knobs.refs > 0 ? step.knobs.refs + 1 : undefined);
