/**
 * What the Run screen is told about each artifact, and how its views use it (F13, ADR-0086). The polled data carries an
 * excerpt that says it is one (complete, bytes), cut on a character boundary; row facts (a diff's size, an option map's
 * titles) are counted from the whole artifact on the server; decision views load and show the whole text, and say so
 * while they show only the opening. Rendered with react-dom/server; the loading itself runs in the e2e suite.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactPreview, PartialNotice } from '../src/components/ArtifactPreview.tsx';
import { StepThumbs } from '../src/components/run/StepThumbs.tsx';
import { TextPreview } from '../src/components/TextPreview.tsx';
import { forgetWholeTexts, loadWholeText } from '../src/components/wholeText.ts';
import { artifactInfo } from '../src/server/run-data.ts';
import type { Services } from '../src/services/index.ts';
import { partShown } from '../src/view/format.ts';
import type { ArtifactInfo } from '../src/view/rundata.ts';
import type { TimelineStep } from '../src/view/timeline.ts';
import { filesUnder, REPO } from './guards/scan.ts';

const ID = `sha256:${'d'.repeat(64)}`;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const bytesOf = (s: string) => Buffer.byteLength(s);

/** Artifacts by id, as the store would give them. */
function services(artifacts: Record<string, { text: string; mediaType: string }>): Services {
  const store = {
    artifacts: {
      has: async (id: string) => Object.hasOwn(artifacts, id),
      get: async (id: string) => {
        const a = artifacts[id];
        if (!a) throw new Error('missing');
        return { record: { id, mediaType: a.mediaType, bytes: bytesOf(a.text) }, bytes: Buffer.from(a.text) };
      },
    },
  };
  return { store } as unknown as Services;
}

/** A long memo whose last words are `tail`. */
function memo(bytes: number, tail: string): string {
  let text = '# Memo\n\n';
  for (let i = 1; bytesOf(text) < bytes - bytesOf(tail) - 2; i++) text += `Paragraph ${i} says what happened, plainly, in order. `;
  text = text.slice(0, bytes - bytesOf(tail) - 2);
  return `${text}\n\n${tail}`;
}

/** 12 files, each one hunk of 40 removed and 40 added lines (+480 −480), about 54 KB. */
function bigDiff(): string {
  const files: string[] = [];
  for (let f = 1; f <= 12; f++) {
    const lines = [`diff --git a/src/module-${f}.ts b/src/module-${f}.ts`, `--- a/src/module-${f}.ts`, `+++ b/src/module-${f}.ts`, '@@ -1,40 +1,40 @@'];
    for (let i = 1; i <= 40; i++) lines.push(`-export const setting${i} = readSetting('module-${f}-setting-${i}', 0);`);
    for (let i = 1; i <= 40; i++) lines.push(`+export const setting${i} = readSetting('module-${f}-setting-${i}', 1);`);
    files.push(lines.join('\n'));
  }
  return `${files.join('\n')}\n\nWhy: every setting now defaults to 1.`;
}

function optionsJson(count: number): string {
  const options = Array.from({ length: count }, (_, i) => ({
    title: `Option ${i + 1}`,
    pitch: `A pitch for option ${i + 1} that says what it is and who it is for, in one plain sentence or two.`,
    rationale: `Why option ${i + 1} might work: it answers the brief, it is easy to say, and it is unlike the others in the list. `.repeat(3),
  }));
  return JSON.stringify({ options });
}

const step = (artifactId: string, mediaType: string, label: string): TimelineStep => ({
  key: 'k',
  stepId: 's',
  stepIds: ['s'],
  round: 1,
  label: 'Review',
  stage: 'Finish',
  who: 'ai',
  status: 'done',
  costUsd: 0,
  artifacts: [{ artifactId, mediaType, label }],
  iterations: 0,
  candidates: 0,
  checkpointIds: [],
  skippedParts: [],
  startedAt: '2026-10-08T10:00:00.000Z',
});

describe('the Run screen’s artifact info says what it carries (F13)', () => {
  it('marks a long text as an excerpt with its size, and a short one as complete', async () => {
    const long = memo(19_561, 'TAIL-SENTINEL');
    expect(bytesOf(long)).toBe(19_561);
    const info = await artifactInfo(services({ [ID]: { text: long, mediaType: 'text/markdown' }, a: { text: '# Short', mediaType: 'text/markdown' } }), [ID, 'a']);
    expect(info[ID]).toMatchObject({ mediaType: 'text/markdown', complete: false, bytes: 19_561 });
    expect(bytesOf(info[ID]?.excerpt ?? '')).toBeLessThanOrEqual(16_000);
    expect(info[ID]?.excerpt).not.toContain('TAIL-SENTINEL');
    expect(info.a).toEqual({ mediaType: 'text/markdown', excerpt: '# Short', complete: true, bytes: 7 });
  });

  it('cuts the excerpt on a character boundary, never inside one', async () => {
    const text = `${'a'.repeat(15_999)}\u{1F337} and more`;
    const info = await artifactInfo(services({ [ID]: { text, mediaType: 'text/plain' } }), [ID]);
    expect(info[ID]?.excerpt).not.toContain('�');
    expect(info[ID]?.excerpt).toBe('a'.repeat(15_999));
    expect(info[ID]?.complete).toBe(false);
  });

  it('counts a diff’s files and lines from the whole diff, not the excerpt', async () => {
    const diff = bigDiff();
    expect(bytesOf(diff)).toBeGreaterThan(50_000);
    const info = await artifactInfo(services({ [ID]: { text: diff, mediaType: 'text/x-diff' } }), [ID]);
    expect(info[ID]?.diffstat).toEqual({ files: 12, additions: 480, deletions: 480 });
  });

  it('names an option map’s options from the whole JSON', async () => {
    const json = optionsJson(36);
    expect(bytesOf(json)).toBeGreaterThan(16_000);
    const info = await artifactInfo(services({ [ID]: { text: json, mediaType: 'application/json' } }), [ID]);
    expect(info[ID]?.titles).toHaveLength(36);
    expect(info[ID]?.titles?.[35]).toBe('Option 36');
    // Not options: no titles.
    const other = await artifactInfo(services({ [ID]: { text: '{"storyboard":[]}', mediaType: 'application/json' } }), [ID]);
    expect(other[ID]?.titles).toBeUndefined();
  });

  it('carries no text facts for other media', async () => {
    const info = await artifactInfo(services({ [ID]: { text: '<p>page</p>', mediaType: 'text/html' } }), [ID]);
    expect(info[ID]).toEqual({ mediaType: 'text/html' });
  });
});

describe('views of an excerpt (F13)', () => {
  it('a diff row counts the whole diff', () => {
    const diff = bigDiff();
    const info: ArtifactInfo = { mediaType: 'text/x-diff', excerpt: diff.slice(0, 16_000), complete: false, bytes: bytesOf(diff), diffstat: { files: 12, additions: 480, deletions: 480 } };
    const out = html(createElement(StepThumbs, { step: step(ID, 'text/x-diff', 'Change'), artifacts: { [ID]: info } }));
    expect(out).toContain('12 files');
    expect(out).toContain('+480');
    expect(out).toContain('−480');
  });

  it('a large preview of an excerpt says so, and links to the whole text, until the whole text is there', () => {
    const long = memo(23_000, 'TAIL-SENTINEL');
    const info: ArtifactInfo = { mediaType: 'text/markdown', excerpt: long.slice(0, 16_000), complete: false, bytes: 23_000 };
    const out = html(createElement(ArtifactPreview, { id: ID, info, title: 'Memo', size: 'large' }));
    expect(out).toContain('Showing the first 16 KB of 23 KB');
    expect(out).toContain(`href="/view/${encodeURIComponent(ID)}"`);
    expect(out).toContain('Open the whole text');
    // A thumbnail is a snippet: no notice.
    expect(html(createElement(ArtifactPreview, { id: ID, info, title: 'Memo', size: 'thumb' }))).not.toContain('Showing the first');
    // Complete: no notice.
    expect(html(createElement(ArtifactPreview, { id: ID, info: { ...info, excerpt: long, complete: true }, title: 'Memo', size: 'large' }))).not.toContain('Showing the first');
  });

  it('the partial notice states sizes that differ, never "16 KB of 16 KB", while loading and after a failed load', () => {
    // 16,113 bytes: in KB, the excerpt and the whole text would both round to 16.
    const text = memo(16_113, 'TAIL-SENTINEL');
    const info: ArtifactInfo = { mediaType: 'text/markdown', excerpt: text.slice(0, 16_000), complete: false, bytes: 16_113 };
    const loading = html(createElement(ArtifactPreview, { id: ID, info, title: 'Memo', size: 'large' }));
    expect(loading).toContain('Showing the first 16,000 of 16,113 bytes while the rest loads.');
    expect(loading).not.toContain('16 KB of 16 KB');
    const part = partShown(16_000, 16_113);
    expect(part).not.toBeNull();
    const failed = html(createElement(PartialNotice, { id: ID, title: 'Memo', part: part ?? '', failed: true }));
    expect(failed).toContain('Showing the first 16,000 of 16,113 bytes; the rest could not be loaded here.');
    expect(failed).toContain(`href="/view/${encodeURIComponent(ID)}"`);
  });

  it('never shows a partial notice for a text that is all there, whatever its flag says', () => {
    const text = memo(16_113, 'TAIL-SENTINEL');
    // An excerpt as long as the whole text is the whole text.
    const whole: ArtifactInfo = { mediaType: 'text/markdown', excerpt: text, complete: false, bytes: 16_113 };
    const out = html(createElement(ArtifactPreview, { id: ID, info: whole, title: 'Memo', size: 'large' }));
    expect(out).not.toContain('Showing');
    expect(out).toContain('TAIL-SENTINEL');
  });

  it('the whole text is shown to its last words', () => {
    const long = memo(23_000, 'TAIL-SENTINEL');
    expect(html(createElement(TextPreview, { type: 'text/markdown', text: long, size: 'large', completeness: 'whole' }))).toContain('TAIL-SENTINEL');
  });

  it('JSON is read only from the whole text: a whole long option map is a list; an excerpt of one is never shown raw', () => {
    const json = optionsJson(36);
    const whole = html(createElement(TextPreview, { type: 'application/json', text: json, size: 'large', completeness: 'whole' }));
    expect(whole).toContain('class="options"');
    expect(whole).not.toContain('preview-raw');
    const loading = html(createElement(TextPreview, { type: 'application/json', text: json.slice(0, 16_000), size: 'large', completeness: 'loading' }));
    expect(loading).toContain('Loading the whole text');
    expect(loading).not.toContain('preview-raw');
    const titles = Array.from({ length: 36 }, (_, i) => `Option ${i + 1}`);
    const thumb = html(createElement(TextPreview, { type: 'application/json', text: json.slice(0, 16_000), size: 'thumb', completeness: 'snippet', titles }));
    expect(thumb).toContain('Option 36');
    expect(thumb).not.toContain('preview-raw');
  });

  it('a diff snippet does not state the cut file’s counts as if they were whole', () => {
    const diff = bigDiff();
    const cut = diff.slice(0, 16_000);
    const snippet = html(createElement(TextPreview, { type: 'text/x-diff', text: cut, size: 'thumb', completeness: 'snippet' }));
    const whole = html(createElement(TextPreview, { type: 'text/x-diff', text: diff, size: 'thumb', completeness: 'whole' }));
    const stats = (s: string) => (s.match(/class="diff-stats"/g) ?? []).length;
    expect(stats(whole)).toBe(12);
    const shownFiles = (snippet.match(/class="diff-file"/g) ?? []).length;
    expect(stats(snippet)).toBe(shownFiles - 1);
  });
});

describe('loading the whole text (F13)', () => {
  afterEach(() => forgetWholeTexts());

  it('fetches each artifact once, and fetches again after a failure', async () => {
    const ok = vi.fn(async () => new Response('the whole text'));
    expect(await loadWholeText(ID, ok)).toBe('the whole text');
    expect(await loadWholeText(ID, ok)).toBe('the whole text');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledWith(`/artifacts/${encodeURIComponent(ID)}`);

    const other = `sha256:${'e'.repeat(64)}`;
    const failing = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(loadWholeText(other, failing)).rejects.toThrow();
    const offline = vi.fn(async (): Promise<Response> => {
      throw new TypeError('offline');
    });
    await expect(loadWholeText(other, offline)).rejects.toThrow();
    expect(await loadWholeText(other, ok)).toBe('the whole text');
    expect(failing).toHaveBeenCalledTimes(1);
    expect(offline).toHaveBeenCalledTimes(1);
  });
});

describe('who reads an excerpt (F13)', () => {
  /**
   * Each file that reads ArtifactInfo.excerpt, and why. A view that reads it shows the opening of a text, so it must be
   * a snippet by design or say that it is partial; a new reader is reviewed here, not found later.
   */
  const READERS: Record<string, string> = {
    'apps/web/src/components/ArtifactPreview.tsx': 'shows the excerpt as a snippet, or with a partial notice while a large preview loads the whole text',
    'apps/web/src/components/run/StepThumbs.tsx': 'a step row: a 120-character snippet (counts come from server facts)',
    'apps/web/src/components/run/panels/PickPanel.tsx': 'a pick card: a clipped snippet, with Open to the whole artifact',
  };

  it('is limited to the reviewed files', () => {
    const web = path.join(REPO, 'apps', 'web');
    const files = [...filesUnder(path.join(web, 'src'), /\.(ts|tsx)$/), ...filesUnder(path.join(web, 'app'), /\.(ts|tsx)$/)];
    const readers = files
      .filter((f) => /\.excerpt\b/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(REPO, f).replace(/\\/g, '/'))
      .sort();
    expect(readers).toEqual(Object.keys(READERS).sort());
  });
});
