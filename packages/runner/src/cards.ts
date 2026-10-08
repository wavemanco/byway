/**
 * Lineup cards (BLIND-1). A GREAT critic must not be able to pick out our item by its form: ours used to be the only
 * item with several frames (a storyboard against image references), or the only one with any images at all, or the
 * only one with captioned page surfaces. When a lineup mixes forms, every item, ours and every reference, is drawn on
 * one card by this one template and rendered to one PNG by the same Playwright renderer: a storyboard's frames as a
 * contact sheet, an image reference as the same card with its one image, a page's screenshots one under another as
 * the page, and any text typeset below. Each item then reaches the critic as one image under its label.
 *
 * The card is 1440 px wide (the renderer's wide screen, so its screenshot has no margin) and at most 2576 px tall (one
 * screenshot tile, inside the image models' size limits). Frames keep their proportions and the size they were
 * generated at, shrunk only to fit. Text is escaped, and set as large as fits (12 to 24 px). Pure.
 */

export const CARD_WIDTH = 1440;
export const CARD_MAX_HEIGHT = 2576;
const PAD = 32;
const GAP = 16;
const INNER = CARD_WIDTH - 2 * PAD;
/** The most height the images take when the card also has text, and when it has none. */
const FRAMES_WITH_TEXT = 1500;
const FRAMES_ALONE = CARD_MAX_HEIGHT - 2 * PAD;
const LINE_HEIGHT = 1.4;
/** An average character's width in em for a sans-serif face: enough to choose a size that fits, not to typeset. */
const CHAR_EM = 0.52;

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
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The artifact route the renderer serves from the store; the id is URL-encoded, so it cannot leave the attribute. */
const src = (artifactId: string): string => `/api/artifacts/${encodeURIComponent(artifactId)}`;

const columnsFor = (n: number): number => (n <= 1 ? 1 : n <= 4 ? 2 : 3);

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

/** The largest font size (12–24 px) at which the text fits the height left. */
export function fontSizeFor(text: string, height: number): number {
  const lines = text.split('\n');
  for (let px = 24; px > 12; px--) {
    const perLine = Math.max(1, Math.floor(INNER / (px * CHAR_EM)));
    const count = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    if (count * px * LINE_HEIGHT <= height) return px;
  }
  return 12;
}

/** One lineup item as a card page, for the renderer's wide screen. */
export function cardHtml(card: CardContent): string {
  const text = card.text.trim();
  const budget = text ? FRAMES_WITH_TEXT : FRAMES_ALONE;
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
  const left = CARD_MAX_HEIGHT - 2 * PAD - (card.images.length ? imagesHeight(card, budget) + 24 : 0);
  const words = text ? `<p class="text" style="font-size:${fontSizeFor(text, left)}px">${escapeHtml(text)}</p>` : '';
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    `html,body{margin:0;background:#fff}body{width:${CARD_WIDTH}px}`,
    `.card{box-sizing:border-box;width:${CARD_WIDTH}px;max-height:${CARD_MAX_HEIGHT}px;overflow:hidden;padding:${PAD}px;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}`,
    `.frames{display:grid;gap:${GAP}px;align-items:start}.frames img{display:block;max-width:100%;width:auto;height:auto;object-fit:contain}`,
    '.stack img{display:block;height:auto;margin:0 auto;object-fit:contain}',
    `.text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:${LINE_HEIGHT}}.frames+.text,.stack+.text{margin-top:24px}`,
    `</style></head><body><div class="card">${images}${words}</div></body></html>`,
  ].join('');
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
