/**
 * A fake page renderer for the e2e scenarios (the real Playwright tests live in pages.test.ts): every page becomes small
 * PNG tiles whose colour comes from the HTML, so different pages give different screenshots. A revised page is taller:
 * one more tile per revision mark (the demo's `byway-revision` meta, or a test's `<!--rev-->` comments), which lets a
 * test's critic tell rounds apart from what it sees, as a real critic would. Like the real renderer it makes the three
 * surfaces (RENDER-1): the wide screen and the phone as that many tiles each (phone tiles are narrower), the first
 * screen as one. It can be held, to test pause, cancel and shutdown; a held render stops when its step is cancelled.
 *
 * Its page text (shownText, for VOICE's arbiter) is the page reader's own model of what a browser shows: the reader's
 * rendered text, a line break between its blocks, links by address. The arbiter's real checks against Chromium are in
 * page-arbiter.test.ts and voice.test.ts.
 */
import { crc32, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { attributesOf, decodeText, squashHtml } from '../../src/html-tokens.ts';
import { readPageCopy } from '../../src/page-copy.ts';
import { LINK_CLOSE, LINK_DIGIT_0, LINK_INDEX_END, LINK_OPEN, type PageRenderer, type RenderOptions, type ShownText, type SurfaceShots } from '../../src/pages.ts';
import type { Surface } from '../../src/types.ts';

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A solid-colour RGB PNG. */
export function png(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
}

export interface FakePages extends PageRenderer {
  rendered: string[];
  /** While held, renders wait until released (or until their step is cancelled). */
  hold(): void;
  release(): void;
  /** Renders currently waiting on the hold. */
  waiting(): number;
}

/** How many wide-screen (and phone) tiles a page gets: one, plus one per revision mark. */
export const fakeTiles = (html: string): number => 1 + Math.min((html.match(/<!--rev-->/g) ?? []).length + (/name="byway-revision"/.test(html) ? 1 : 0), 8);

/** The screenshots the fake renderer makes of a page for one surface (deterministic: a test can tell which page an image is). */
export const fakeShots = (html: string, surface: Surface): SurfaceShots => {
  const h = createHash('sha256').update(html).digest();
  const n = surface === 'fold' ? 1 : fakeTiles(html);
  const w = surface === 'mobile' ? 4 : 8;
  const shade = surface === 'mobile' ? 64 : surface === 'fold' ? 128 : 0;
  return { surface, tiles: Array.from({ length: n }, (_, i) => png(w, surface === 'fold' ? 5 : 6, [h[0]!, (h[1]! + shade) % 256, (h[2]! + i) % 256])) };
};

/** The page reader's model of the text a browser shows (see the file comment). */
export function modelShownText(html: string): ShownText {
  const p = readPageCopy(html);
  const titleAt = p.tokens.findIndex((t) => t.kind === 'tag' && t.name === 'title' && !t.closing && !t.foreign);
  const title = titleAt >= 0 && p.tokens[titleAt + 1]?.kind === 'text' ? squashHtml(decodeText(p.tokens[titleAt + 1]!.raw)) : '';
  const hrefs: string[] = [];
  const index = new Map<number, number>();
  let text = '';
  let linked = '';
  let block = -1;
  let open: number | undefined;
  const close = () => {
    if (open !== undefined) linked += LINK_CLOSE;
    open = undefined;
  };
  for (const s of p.slots) {
    if (!s.rendered || !s.toks.length) continue;
    const t = decodeText(s.toks.map((i) => p.tokens[i]!.raw).join(''));
    if (s.vregion !== block) {
      close();
      if (block >= 0) {
        text += '\n';
        linked += '\n';
      }
      block = s.vregion;
    }
    if (s.link !== open) {
      close();
      if (s.link !== undefined) {
        let k = index.get(s.link);
        if (k === undefined) {
          k = hrefs.length;
          index.set(s.link, k);
          hrefs.push(attributesOf(p.tokens[s.link]!.raw).find((a) => a.name === 'href')?.value ?? '');
        }
        linked += `${LINK_OPEN}${String(k).replace(/[0-9]/g, (d) => String.fromCharCode(LINK_DIGIT_0 + Number(d)))}${LINK_INDEX_END}`;
        open = s.link;
      }
    }
    text += t;
    linked += t;
  }
  close();
  // The reader reads no stylesheet, so nothing is hidden from sight but what it already leaves out.
  return { title, text, linked, hrefs, hidden: [] };
}

export function fakePages(): FakePages {
  const rendered: string[] = [];
  let gate: Promise<void> | undefined;
  let open: (() => void) | undefined;
  let waiting = 0;

  const held = async (signal: AbortSignal | undefined) => {
    if (!gate) return;
    waiting++;
    try {
      await new Promise<void>((resolve, reject) => {
        void gate!.then(resolve);
        if (signal?.aborted) reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } finally {
      waiting--;
    }
  };

  const render = async (html: string, surfaces: readonly Surface[], opts: RenderOptions = {}): Promise<SurfaceShots[]> => {
    rendered.push(html);
    await held(opts.signal);
    return surfaces.map((s) => fakeShots(html, s));
  };

  return {
    rendered,
    hold() {
      gate ??= new Promise((r) => (open = r));
    },
    release() {
      open?.();
      gate = undefined;
      open = undefined;
    },
    waiting: () => waiting,
    render: (html, _resolve, surfaces, opts) => render(html, surfaces, opts),
    screenshots: async (html, _resolve, opts) => (await render(html, ['desktop'], opts))[0]!.tiles,
    shownText: async (html) => modelShownText(html),
    async close() {},
  };
}
