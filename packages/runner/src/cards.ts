/**
 * Lineup cards (BLIND-1). A GREAT critic must not be able to pick out our item by its form: ours used to be the only
 * item with several frames (a storyboard against image references), or the only one with any images at all, or the
 * only one with captioned page surfaces. When a lineup mixes forms, every item, ours and every reference, is drawn on
 * one card by this one template and rendered to one PNG by the same Playwright renderer: a storyboard's frames as a
 * contact sheet, an image reference as the same card with its one image, a page's screenshots one under another as
 * the page, and any text typeset below. Each item then reaches the critic as one image under its label.
 *
 * The card is 1440 px wide (the renderer's wide screen, so its screenshot has no margin) and must come out as one
 * screenshot tile, at most 2576 px tall (inside the image models' size limits). Frames keep their proportions and the
 * size they were generated at, shrunk only to fit. Text is escaped, and set as large as an estimate says fits (12 to
 * 24 px).
 *
 * Nothing on a card is hidden (F13, ADR-0087). The estimate is only an estimate, so the card has no height cap and no
 * hidden overflow: a render shows how tall it really is, and fitCard measures every render. Words that do not fit one
 * tile are cut at a word boundary (at a character boundary for text with runs too long to cut between: CJK, minified
 * JSON, a long token), and the card ends with a line saying how many were left out; the caller records the cut. A card
 * that does not fit even without its words is refused, never shown as its first tile. A critic that reads text gets
 * an item's words under its label instead, so its card says so in one fixed line and is never cut.
 */

export const CARD_WIDTH = 1440;
export const CARD_MAX_HEIGHT = 2576;
const PAD = 32;
const GAP = 16;
/** The space between the images and the text below them. */
const TEXT_GAP = 24;
/** The space between the last words shown and the line saying how many were left out. */
const CUT_GAP = 12;
const INNER = CARD_WIDTH - 2 * PAD;
/** The most height the images take when the card also has text, and when it has none. */
const FRAMES_WITH_TEXT = 1500;
const FRAMES_ALONE = CARD_MAX_HEIGHT - 2 * PAD;
const LINE_HEIGHT = 1.4;
/** An average character's width in em for a sans-serif face: enough to choose a size that fits, not to typeset. */
const CHAR_EM = 0.52;
/** The text sizes a card uses: as large as fits, never below the floor. */
const MAX_FONT = 24;
const MIN_FONT = 12;
/** The height the closing line takes, with its gap: one line at the floor. */
const CUT_LINE = CUT_GAP + Math.ceil(MIN_FONT * LINE_HEIGHT);

export interface CardImage {
  artifactId: string;
  /** Pixel size, when known (PNG, JPEG, WebP headers): used to fit the images; unknown sizes are fitted by CSS. */
  width?: number;
  height?: number;
}

export interface CardContent {
  images: CardImage[];
  /** `grid`: frames side by side, as a contact sheet; `stack`: a page's screenshots one under another, as the page. */
  layout: 'grid' | 'stack';
  /** Text set below the images (a storyboard's words, a text reference). */
  text: string;
  /**
   * How many of the item's words (or characters, by `unit`) this card leaves out, said in a closing line so whoever
   * reads the card knows the text stops early: "[… N more words not shown]" after the words shown, "[all N words not
   * shown]" when none are.
   */
  omitted?: number;
  /** What `omitted` counts: words unless said. */
  unit?: CutUnit;
  /**
   * Set the words at the 12 px floor even when the estimate says a larger size fits: fitCard's try after the whole
   * text came out too tall at that size, before it cuts any.
   */
  floor?: boolean;
}

/**
 * What a card's text is cut by. Words, at their boundaries, unless a run of non-space characters is longer than a line
 * at the floor (by the estimate): then a word cut could only drop the whole run (a CJK paragraph, minified JSON, a
 * long token), so the text is cut by characters as people see them (grapheme clusters, never splitting one).
 */
export type CutUnit = 'words' | 'characters';

/** A text as the units it is cut by: how many there are, and the text up to the end of the first `n`. */
export interface TextUnits {
  unit: CutUnit;
  total: number;
  first: (n: number) => string;
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The artifact route the renderer serves from the store; the id is URL-encoded, so it cannot leave the attribute. */
const src = (artifactId: string): string => `/api/artifacts/${encodeURIComponent(artifactId)}`;

const columnsFor = (n: number): number => (n <= 1 ? 1 : n <= 4 ? 2 : 3);

const count = new Intl.NumberFormat('en-US');

/** How many words a text has: its runs of non-space characters. */
export const wordCount = (text: string): number => text.match(/\S+/g)?.length ?? 0;

/** The text up to the end of its first `n` words, as written (line breaks and spacing between them kept). */
export function firstWords(text: string, n: number): string {
  if (n <= 0) return '';
  let end = 0;
  let seen = 0;
  for (const m of text.matchAll(/\S+/g)) {
    end = m.index + m[0].length;
    if (++seen >= n) break;
  }
  return text.slice(0, end);
}

/** The longest run of non-space characters cut between as a word: one line at the floor, by the estimate. */
const LONG_RUN = Math.floor(INNER / (MIN_FONT * CHAR_EM));

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** A text as the units a card cuts it by (CutUnit): its words, or its characters when a run is too long to cut between. */
export function unitsOf(text: string): TextUnits {
  if (!(text.match(/\S+/g) ?? []).some((run) => run.length > LONG_RUN)) return { unit: 'words', total: wordCount(text), first: (n) => firstWords(text, n) };
  const chars = Array.from(graphemes.segment(text.trim()), (s) => s.segment);
  return { unit: 'characters', total: chars.length, first: (n) => chars.slice(0, Math.max(0, n)).join('') };
}

/** A count of units as the card and the step note say it: "1 word", "5 characters". */
export const unitNoun = (unit: CutUnit, n: number): string => (unit === 'words' ? (n === 1 ? 'word' : 'words') : n === 1 ? 'character' : 'characters');

/** The closing line of a card that leaves words (or characters) out. */
function cutLine(omitted: number, unit: CutUnit, anyShown: boolean): string {
  const noun = unitNoun(unit, omitted);
  if (anyShown) return `[… ${count.format(omitted)} more ${noun} not shown]`;
  return omitted === 1 ? `[1 ${noun} not shown]` : `[all ${count.format(omitted)} ${noun} not shown]`;
}

/** Whether a card sets anything below its images: words, or the line saying they were left out. */
const hasText = (card: CardContent): boolean => card.text.trim() !== '' || (card.omitted ?? 0) > 0;

/** How tall the images will be at most, from their sizes where known (the row limit where not). */
function imagesHeight(card: CardContent, budget: number): number {
  const n = card.images.length;
  if (!n) return 0;
  if (card.layout === 'stack') return Math.min(budget, stackHeight(card.images) ?? budget);
  const cols = columnsFor(n);
  const rows = Math.ceil(n / cols);
  const rowMax = Math.floor((budget - GAP * (rows - 1)) / rows);
  const colWidth = (INNER - GAP * (cols - 1)) / cols;
  let total = GAP * (rows - 1);
  for (let r = 0; r < rows; r++) {
    const inRow = card.images.slice(r * cols, r * cols + cols);
    total += Math.max(...inRow.map((im) => (im.width && im.height ? Math.min(rowMax, im.height, Math.round((colWidth * im.height) / im.width)) : rowMax)));
  }
  return total;
}

/** A stack's natural height at the card's width, or undefined when an image's size is unknown. */
function stackHeight(images: readonly CardImage[]): number | undefined {
  let h = 0;
  for (const im of images) {
    if (!im.width || !im.height) return undefined;
    h += (INNER * im.height) / Math.max(im.width, 1);
  }
  return Math.round(h);
}

/** The height the estimate leaves for text below the images, within one tile. */
function textRoom(card: CardContent): number {
  const budget = hasText(card) ? FRAMES_WITH_TEXT : FRAMES_ALONE;
  return CARD_MAX_HEIGHT - 2 * PAD - (card.images.length ? imagesHeight(card, budget) + TEXT_GAP : 0);
}

/** How many lines a text takes at a font size, by the estimate. */
function rowsAt(text: string, px: number): number {
  const perLine = Math.max(1, Math.floor(INNER / (px * CHAR_EM)));
  return text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
}

/** The largest font size (12–24 px) at which the text fits the height left, by the estimate; 12 when none does. */
export function fontSizeFor(text: string, height: number): number {
  for (let px = MAX_FONT; px > MIN_FONT; px--) {
    if (rowsAt(text, px) * px * LINE_HEIGHT <= height) return px;
  }
  return MIN_FONT;
}

/** How tall a text is at a font size, by the estimate. */
const estimatedHeight = (text: string, px: number): number => rowsAt(text, px) * px * LINE_HEIGHT;

/**
 * How many of a card's words (or characters, by unitsOf) the estimate fits at the 12 px floor: all of them when they
 * fit, else as many as fit with room left for the closing line. `scale` is the browser's height per estimated pixel,
 * once a render has measured it (1 before). Only a guess either way: fitCard measures what the renderer makes of it.
 */
export function unitsThatFit(card: CardContent, scale = 1, units: TextUnits = unitsOf(card.text)): number {
  const height = (text: string) => estimatedHeight(text, MIN_FONT) * scale;
  if (height(card.text.trim()) <= textRoom({ ...card, omitted: undefined })) return units.total;
  const room = textRoom({ ...card, omitted: 1 }) - CUT_LINE;
  // The largest count whose text fits (0 when none does): more text never takes fewer lines.
  let lo = 0;
  let hi = units.total - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (height(units.first(mid)) <= room) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The size a card's words are set at: the floor when some are cut (to show as many as it can) or when fitCard asks
 * for it, else as large as fits.
 */
const fontOf = (card: CardContent): number => (card.omitted || card.floor ? MIN_FONT : fontSizeFor(card.text.trim(), textRoom(card)));

/** One lineup item as a card page, for the renderer's wide screen. */
export function cardHtml(card: CardContent): string {
  const text = card.text.trim();
  const omitted = card.omitted ?? 0;
  const budget = hasText(card) ? FRAMES_WITH_TEXT : FRAMES_ALONE;
  let images = '';
  if (card.images.length && card.layout === 'stack') {
    const natural = stackHeight(card.images);
    const scale = natural ? Math.min(1, budget / natural) : 1;
    const width = Math.floor(INNER * scale);
    const each = natural ? '' : ` style="max-height:${Math.floor(budget / card.images.length)}px"`;
    images = `<div class="stack">${card.images.map((im) => `<img src="${src(im.artifactId)}" alt="" style="width:${width}px"${each}>`).join('')}</div>`;
  } else if (card.images.length) {
    const cols = columnsFor(card.images.length);
    const rows = Math.ceil(card.images.length / cols);
    const rowMax = Math.floor((budget - GAP * (rows - 1)) / rows);
    images = `<div class="frames" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${card.images.map((im) => `<img src="${src(im.artifactId)}" alt="" style="max-height:${rowMax}px">`).join('')}</div>`;
  }
  const words = text ? `<p class="text" style="font-size:${fontOf(card)}px">${escapeHtml(text)}</p>` : '';
  const closing = omitted ? `<p class="cut" style="font-size:${MIN_FONT}px">${escapeHtml(cutLine(omitted, card.unit ?? 'words', text !== ''))}</p>` : '';
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    `html,body{margin:0;background:#fff}body{width:${CARD_WIDTH}px}`,
    // No height cap and no hidden overflow (F13): a card too tall for one tile must show it, so fitCard cuts visibly.
    `.card{box-sizing:border-box;width:${CARD_WIDTH}px;padding:${PAD}px;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}`,
    `.frames{display:grid;gap:${GAP}px;align-items:start}.frames img{display:block;max-width:100%;width:auto;height:auto;object-fit:contain}`,
    '.stack img{display:block;height:auto;margin:0 auto;object-fit:contain}',
    `.text,.cut{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:${LINE_HEIGHT}}.frames+.text,.stack+.text,.frames+.cut,.stack+.cut{margin-top:${TEXT_GAP}px}`,
    `.text+.cut{margin-top:${CUT_GAP}px}.cut{color:#444;font-style:italic}`,
    `</style></head><body><div class="card">${images}${words}${closing}</div></body></html>`,
  ].join('');
}

/** Renders a card page and returns its screenshot tiles, top to bottom, each at most CARD_MAX_HEIGHT tall. */
export type CardRender = (html: string) => Promise<readonly Uint8Array[]>;

/** How much of a card's text one image showed: the first `shown` of its `total` words (or characters). */
export interface CardCut {
  unit: CutUnit;
  shown: number;
  total: number;
}

/** A card fitted into one image, with what it left out if anything; or why it could not be. */
export type FittedCard = { ok: true; png: Uint8Array; html: string; cut?: CardCut } | { ok: false; reason: 'empty' | 'too-tall' };

/** Renders one card may take: tries with words, then one without (each render is a browser page load). */
export const MAX_CARD_RENDERS = 6;
/** A try that came out too tall is followed by one with at least this share of its words fewer. */
const MIN_STEP = 0.02;
/** A try aims at most this share of a tile under where the calibrated estimate puts the line. */
const AIM = 0.02;

/** A render's full height, from its tiles' PNG headers (a tile counts as CARD_MAX_HEIGHT when its size is unknown). */
const heightOf = (tiles: readonly Uint8Array[]): number => tiles.reduce((h, t) => h + (imageSize(t)?.height ?? CARD_MAX_HEIGHT), 0);

/** One try at a card: the page drawn with its first `shown` words, and its tiles. */
interface Drawn {
  shown: number;
  page: CardContent;
  html: string;
  tiles: readonly Uint8Array[];
}

/**
 * The browser's height per estimated pixel for a try's words: its measured height, less what the estimate puts
 * beside the words (padding, images, the closing line), over the words' estimated height at the size they were set.
 */
function measuredScale(d: Drawn): number {
  const words = d.page.text.trim();
  const besides = CARD_MAX_HEIGHT - textRoom(d.page) + (d.page.omitted ? CUT_LINE : 0);
  return Math.max(0.1, (heightOf(d.tiles) - besides) / Math.max(1, estimatedHeight(words, fontOf(d.page))));
}

/**
 * Between a try that fit and one that did not, the most units whose height stays within `limit`, interpolating the two
 * measured heights by the estimate of the words in between. It reads only the words where the answer lies, so text
 * that is not uniform elsewhere (wider opening words, say) does not mislead it as one scale for the whole text would.
 */
function unitsBetween(fit: Drawn, over: Drawn, units: TextUnits, limit: number): number {
  const estimated = (n: number) => estimatedHeight(units.first(n).trim(), MIN_FONT);
  const [e0, e1] = [estimated(fit.shown), estimated(over.shown)];
  const [h0, h1] = [heightOf(fit.tiles), heightOf(over.tiles)];
  if (e1 <= e0 || h1 <= h0) return fit.shown;
  const height = (n: number) => h0 + ((estimated(n) - e0) * (h1 - h0)) / (e1 - e0);
  let lo = fit.shown;
  let hi = over.shown - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (height(mid) <= limit) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * A card rendered into exactly one tile (F13), with as many words as fit, found within MAX_CARD_RENDERS. The first try
 * keeps the words the estimate fits. Every render then narrows where the answer lies, between the try with the most
 * words known to fit and the one with the fewest known not to, and the next try is chosen from the measurements: by
 * the try's own scale before anything fits; then by the fit's scale and by interpolating between the fit and the try
 * that did not, the more cautious of the two (the interpolation alone after two fits in a row showed caution too
 * cautious). A try aims a little under the line (AIM, narrowing as the fit nears the line), since an estimate a hair
 * over it wastes the render. The search ends when the bounds meet, or when the measurements put the line no more than
 * a small share of words past a fit.
 *
 * One scale for the whole text is misled by text that is not uniform: with opening words set wider than the rest, each
 * try lands just over the line again, and the search used to run out of renders and drop every word though thousands
 * fit. So a try that comes out too tall while nothing has fit yet, or right after another that did not, is followed by
 * one no more than half way down to what is known to fit: the search always finds a fit, and the interpolation then
 * closes in on the line from both sides.
 *
 * A whole text that comes out too tall at a size above the floor (glyphs wider than the estimate's average, such as
 * capitals) is tried whole at the floor before any word is cut. When no try with words fits, every word goes and the
 * card says so. A card taller than one tile even then is refused (`too-tall`): it is never cut to its first tile. Text
 * with runs too long to cut between is cut by characters instead (unitsOf). With `cut: false` (a card whose words
 * reach the critic another way) the card is rendered once, as it is.
 */
export async function fitCard(card: CardContent, render: CardRender, opts: { cut?: boolean } = {}): Promise<FittedCard> {
  const units = unitsOf(card.text);
  const { total } = units;
  const draw = async (shown: number, floor = false): Promise<Drawn> => {
    const page: CardContent = shown >= total ? { ...card, omitted: undefined, ...(floor ? { floor } : {}) } : { ...card, text: units.first(shown), omitted: total - shown, unit: units.unit };
    const html = cardHtml(page);
    return { shown, page, html, tiles: await render(html) };
  };
  const fitted = (d: Drawn): FittedCard => {
    if (d.tiles.length !== 1) return { ok: false, reason: d.tiles.length ? 'too-tall' : 'empty' };
    return { ok: true, png: d.tiles[0]!, html: d.html, ...(d.shown < total ? { cut: { unit: units.unit, shown: d.shown, total } } : {}) };
  };

  if (opts.cut === false || total === 0) return fitted(await draw(total));
  /** The try with the most units that fit, and the one with the fewest that did not. */
  let best: Drawn | undefined;
  let over: Drawn | undefined;
  const lo = () => best?.shown ?? 0;
  const hi = () => over?.shown ?? total + 1;
  let shown = unitsThatFit(card, 1, units);
  let floor = false;
  /** Whether the previous try fit (undefined before the first). */
  let last: boolean | undefined;
  for (let renders = 1; renders < MAX_CARD_RENDERS && shown > lo() && shown < hi(); renders++) {
    const d = await draw(shown, floor);
    if (!d.tiles.length) return fitted(d);
    if (d.tiles.length > 1 && shown === total && !floor && fontOf(d.page) > MIN_FONT) {
      // The whole text, too tall at the size the estimate chose: the same words at the floor may still fit.
      floor = true;
      continue;
    }
    const fits = d.tiles.length === 1;
    if (fits) best = d;
    else over = d;
    if (fits && shown === total) break;
    const again = last === fits;
    last = fits;
    const step = Math.max(1, Math.ceil(shown * MIN_STEP));
    const middle = Math.floor((lo() + hi()) / 2);
    /**
     * How many units the measurements say fit, `aim` short of the line: calibrated by the latest fit and, between a fit
     * and a try that did not, by interpolating; the more cautious of the two unless `bold` (the cautious one was just
     * shown too cautious). Before any fit, by this try's own scale.
     */
    const estimate = (aim: number, bold: boolean): number => {
      if (!best) return unitsThatFit(card, measuredScale(d) * (1 + aim), units);
      const byFit = unitsThatFit(card, measuredScale(best) * (1 + aim), units);
      if (!over) return byFit;
      const between = unitsBetween(best, over, units, CARD_MAX_HEIGHT * (1 - aim));
      return bold ? between : Math.min(byFit, between);
    };
    let next: number;
    if (!fits) {
      // Too tall: always some fewer than this try, and no more than half way down while no try has fit or after two
      // that did not: a misled estimate cannot spend every render just over the line.
      next = Math.min(estimate(AIM, false), shown - step, ...(!best || again ? [middle] : []));
    } else {
      // A fit: after two fits in a row the cautious calibration was too cautious, so the interpolation alone. When the
      // measurements put the line no more than a small share of units further on, this is the answer. Close to the
      // line the aim narrows with the room left, so the last few lines are not given up to it.
      if (estimate(0, again) < shown + step) break;
      next = Math.max(estimate(Math.min(AIM, (CARD_MAX_HEIGHT - heightOf(d.tiles)) / CARD_MAX_HEIGHT / 4), again), shown + step);
    }
    shown = Math.min(hi() - 1, Math.max(lo() + 1, next));
  }
  return fitted(best ?? (await draw(0)));
}

/** An image's pixel size from its PNG, JPEG or WebP header; undefined for anything else. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: walk the segments to a start-of-frame marker (C0–CF, except DHT C4, JPG C8 and DAC CC).
    for (let at = 2; at + 9 < b.length; ) {
      if (b[at] !== 0xff) return undefined;
      const marker = b[at + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5) };
      at += 2 + b.readUInt16BE(at + 2);
    }
    return undefined;
  }
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  return undefined;
}
