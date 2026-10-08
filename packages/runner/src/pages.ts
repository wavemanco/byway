/**
 * RENDER for web pages (spec §3.1 `view`, §3.2): Playwright Chromium, the full page at 1440 px wide, tiled into
 * screenshots at most 2576 px tall, with reduced motion and the network blocked except an allowlist (Google Fonts,
 * jsDelivr, unpkg, cdnjs) and the local artifact route, which is served from the artifact store.
 */
import type { Browser } from 'playwright';

export interface PageRenderer {
  /** PNG tiles of the whole page, top to bottom. `resolve` serves `/api/artifacts/<id>` requests. */
  screenshots(html: string, resolve: (artifactId: string) => Promise<{ body: Uint8Array; contentType: string } | undefined>): Promise<Uint8Array[]>;
  close(): Promise<void>;
}

/** Hosts a rendered page may load from (spec §3.2). Everything else is blocked. */
export const RENDER_ALLOWLIST: readonly string[] = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

export interface PlaywrightPagesOptions {
  width?: number;
  /** Tile height limit: 2576 px keeps every tile inside the image models' size limits. */
  maxTileHeight?: number;
  /** A runaway page stops here rather than producing dozens of tiles. */
  maxTiles?: number;
  allowHosts?: readonly string[];
  /** How long a page may take to load. */
  timeoutMs?: number;
}

/** A private origin the page is served from, so relative artifact routes resolve without touching the network. */
const ORIGIN = 'http://byway-render.localhost';

export function playwrightPages(opts: PlaywrightPagesOptions = {}): PageRenderer {
  const width = opts.width ?? 1440;
  const maxTile = opts.maxTileHeight ?? 2576;
  const maxTiles = opts.maxTiles ?? 8;
  const allow = new Set(opts.allowHosts ?? RENDER_ALLOWLIST);
  const timeout = opts.timeoutMs ?? 30_000;
  let browser: Promise<Browser> | undefined;

  const launch = async (): Promise<Browser> => {
    const { chromium } = await import('playwright');
    return chromium.launch({ headless: true });
  };

  return {
    async screenshots(html, resolve) {
      browser ??= launch();
      const b = await browser;
      const context = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin === ORIGIN) {
            if (url.pathname === '/page') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
            const m = /^\/api\/artifacts\/(.+)$/.exec(url.pathname);
            const found = m ? await resolve(decodeURIComponent(m[1] as string)) : undefined;
            return found ? route.fulfill({ status: 200, contentType: found.contentType, body: Buffer.from(found.body) }) : route.fulfill({ status: 404, body: '' });
          }
          if (url.protocol === 'https:' && allow.has(url.hostname)) return route.continue();
          return route.abort('blockedbyclient');
        });
        await page.goto(`${ORIGIN}/page`, { waitUntil: 'load', timeout });
        // Strings, not functions: this package compiles without the DOM library.
        await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
        const height = Number(await page.evaluate('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, 1)'));
        const tiles: Uint8Array[] = [];
        for (let y = 0; y < height && tiles.length < maxTiles; y += maxTile) {
          const shot = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled', clip: { x: 0, y, width, height: Math.min(maxTile, height - y) } });
          tiles.push(new Uint8Array(shot));
        }
        return tiles;
      } finally {
        await context.close();
      }
    },
    async close() {
      if (!browser) return;
      const b = await browser.catch(() => undefined);
      browser = undefined;
      await b?.close();
    },
  };
}
