import { revisionOf } from './revision.ts';
import { seedOf } from './seed.ts';

/**
 * The demo-mode GREAT critic's lineup and its blind ranking (ADR-0072). Demo mode only: real critics read the work.
 *
 * The prompt says "There are R references and 1 of ours (M items, labelled A–X)." and nothing else about which item
 * is ours, and the mock stays blind in the same way: it never looks for "ours". It ranks every item by evidence of
 * revision, which only the item being worked on has:
 *
 * 1. Marked revisions. The mock's own builders and fixes mark prose and diffs with an invisible revision number
 *    (revision.ts). A marked item ranks by its number: revision r goes to place max(1, M − 1 − (r − 1)·⌈M/3⌉), so a
 *    first draft sits just above the bottom and each fix climbs a third of the lineup. That is how a demo rank loop
 *    (C3, C4 and C7 stop at rank 3 within a few rounds) converges, as a real loop does when its fixes work.
 * 2. Novelty, when nothing is marked (screenshots of pages, storyboard frames, a person's own draft). The mock
 *    remembers what each item looked like (its text and its attached image ids) across the calls of one loop (the same
 *    run, step and purpose). Everything in the loop's first call is the baseline. An item whose look first appears in
 *    a later call is a newer revision than anything before it: the k-th new look counts as revision k + 1, ranked as in
 *    (1). Several shuffles of one round show the same look, so they agree; references never change, so they stay put.
 *    For an image-only lineup this is the deterministic order that moves the item with the latest attachments up.
 * 3. Everything else (the references, and every item on a loop's first call when nothing is marked) is ordered by a
 *    stable hash of its content, so the same lineup always gets the same answer.
 */

export interface Lineup {
  /** R, the number of references. */
  refs: number;
  /** M, the number of items. */
  size: number;
  /** The labels in lineup order: A, B, … */
  labels: string[];
}

/** An attached image and the "### X" label it was attached under, in message order. */
export interface Attachment {
  label?: string;
  artifactId: string;
}

export interface LineupItem {
  label: string;
  /** The item's text under its "### X" heading (empty for an image-only item). */
  text: string;
  /** Artifact ids of the images attached under its heading. */
  images: string[];
}

/** A, B, … Z, AA, AB, … for the i-th item (the runner's and @byway/prompts' labelOf). */
function labelOf(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const LINEUP_LINE = /There (?:are|is) (\d+) references? and 1 of ours \((\d+) items?, labell?ed ([A-Z]{1,2})\s*[–—-]\s*([A-Z]{1,2})\)/i;

/**
 * The lineup a GREAT-mode critic is asked to rank, from the prompt's line "There are R references and 1 of ours
 * (M items, labelled A–X)." A hand-written prompt that says GREAT or asks for a "Ranking:" with only "N references"
 * still works (M = N + 1). Undefined in OK mode.
 */
export function lineupOf(text: string): Lineup | undefined {
  const m = LINEUP_LINE.exec(text);
  if (m) {
    const size = Math.max(2, Number(m[2]));
    return { refs: Number(m[1]), size, labels: Array.from({ length: size }, (_, i) => labelOf(i)) };
  }
  if (!/\bGREAT\b|\bRanking:/.test(text)) return undefined;
  const refs = /\b(\d+)\s+(?:references|reference pages|exemplars|published (?:pieces|passages))\b/i.exec(text);
  const size = Math.max(2, Math.min(13, Number(refs?.[1] ?? 4) + 1));
  return { refs: size - 1, size, labels: Array.from({ length: size }, (_, i) => labelOf(i)) };
}

/**
 * Each label's text (under its "### X" heading, inside <lineup>…</lineup> when the prompt has that block) and the
 * images attached under its heading.
 */
export function lineupItems(prompt: string, lineup: Lineup, attachments: readonly Attachment[]): LineupItem[] {
  const block = /<lineup>([\s\S]*?)<\/lineup>/i.exec(prompt)?.[1] ?? prompt;
  const heads = [...block.matchAll(/^#{1,6}[ \t]+([A-Z]{1,2})[ \t]*$/gm)].filter((m) => lineup.labels.includes(m[1] as string));
  const texts = new Map<string, string>();
  heads.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const next = heads[i + 1]?.index ?? block.length;
    // An item runs to the next label's heading: its own Markdown headings ("# Title") are part of it.
    const body = block.slice(start, next).trim();
    if (!texts.has(m[1] as string)) texts.set(m[1] as string, body);
  });
  return lineup.labels.map((label) => ({
    label,
    text: texts.get(label) ?? '',
    images: attachments.filter((a) => a.label === label).map((a) => a.artifactId),
  }));
}

/** What one item looks like, for the novelty memory and the stable hash. Empty when there is nothing to see. */
export function lookOf(item: LineupItem): string {
  const text = item.text.replace(/^\(see the images under this label\)$/i, '').trim();
  return text || item.images.length ? `${text}\n${item.images.join(',')}` : '';
}

/**
 * The looks a GREAT critic has seen across the calls of one loop (the same run, step and purpose), for rule 2 above.
 * Kept by the mock adapter, one per loop.
 */
export class LineupMemory {
  readonly #revisions = new Map<string, number>();
  #calls = 0;

  /** The novelty revision of each look: 0 for the loop's first call and for looks seen before, else 1, 2, 3… */
  revise(looks: readonly string[]): number[] {
    const before = Math.max(0, ...this.#revisions.values());
    const first = this.#calls === 0;
    this.#calls += 1;
    return looks.map((look) => {
      if (!look) return 0;
      const known = this.#revisions.get(look);
      if (known !== undefined) return known;
      const r = first ? 0 : before + 1;
      this.#revisions.set(look, r);
      return r;
    });
  }
}

/** Rule 1's place for a revision r in a lineup of M: just above the bottom at r = 1, a third of the lineup up per fix. */
export function placeFor(revision: number, size: number): number {
  return Math.max(1, size - 1 - (revision - 1) * Math.ceil(size / 3));
}

/**
 * Every label once, best first, by the rules above. `novelty` holds the memory's revision per item (0 when unknown).
 */
export function blindRanking(items: readonly LineupItem[], novelty: readonly number[] = []): string[] {
  const scored = items.map((item, i) => {
    const marked = revisionOf(item.text);
    const fresh = novelty[i] ?? 0;
    const revision = marked ?? (fresh > 0 ? fresh + 1 : 0);
    const look = lookOf(item);
    return { label: item.label, revision, hash: seedOf(look || `label:${item.label}`) };
  });
  const order = scored
    .filter((s) => s.revision === 0)
    .sort((a, b) => a.hash - b.hash || a.label.localeCompare(b.label))
    .map((s) => s.label);
  const revised = scored.filter((s) => s.revision > 0).sort((a, b) => b.revision - a.revision || a.label.localeCompare(b.label));
  for (const s of revised) order.splice(Math.min(order.length, placeFor(s.revision, items.length) - 1), 0, s.label);
  return order;
}
