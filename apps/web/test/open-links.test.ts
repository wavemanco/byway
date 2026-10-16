/**
 * Every way the app opens an artifact for a person (F05, ADR-0085), rendered to HTML with react-dom/server: each "Open"
 * goes to the whole-artifact viewer (/view/<id>), never to the artifact's raw address, and each page frame asks for
 * scripts (?scripts=1) exactly when its sandbox allows them. Whether a frame's ask is granted is the server's call
 * (server.test.ts, api.test.ts); what a browser does with it is the e2e suite's (consent-boundary.spec.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckpointRecord, RunRecord } from '@byway/contracts';
import { artifactUrl, openHref, pageFrameUrl } from '../src/components/api.ts';
import { ArtifactPreview } from '../src/components/ArtifactPreview.tsx';
import { Markdown } from '../src/components/Markdown.tsx';
import { Storyboard } from '../src/components/results.tsx';
import { ScaledPage } from '../src/components/ScaledPage.tsx';
import { PageResult } from '../src/components/result/PageResult.tsx';
import { ResultView } from '../src/components/result/ResultView.tsx';
import { ComparePanel } from '../src/components/run/panels/ComparePanel.tsx';
import { PickPanel } from '../src/components/run/panels/PickPanel.tsx';
import { References } from '../src/components/run/panels/References.tsx';
import { StepDetail } from '../src/components/run/StepDetail.tsx';
import { startingDraft } from '../src/view/drafts.ts';
import { artifactIdOf } from '../src/view/pages.ts';
import type { ArtifactInfo } from '../src/view/rundata.ts';
import type { TimelineStep } from '../src/view/timeline.ts';
import { filesUnder, REPO } from './guards/scan.ts';

const PAGE = `sha256:${'a'.repeat(64)}`;
const MEMO = `sha256:${'b'.repeat(64)}`;
const CLIP = `sha256:${'c'.repeat(64)}`;
const VIEW = (id: string) => `/view/${encodeURIComponent(id)}`;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const artifacts: Record<string, ArtifactInfo> = { [PAGE]: { mediaType: 'text/html' }, [MEMO]: { mediaType: 'text/markdown', excerpt: '# Memo\n\nThe memo.', complete: true, bytes: 17 } };

/** The href of every link in the markup, decoded from HTML. */
const hrefs = (markup: string) => [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => (m[1] as string).replace(/&amp;/g, '&'));
/** Every iframe's src and sandbox. */
const frames = (markup: string) =>
  [...markup.matchAll(/<iframe\b([^>]*)>/g)].map((m) => {
    const attrs = m[1] as string;
    return { src: (/\bsrc="([^"]*)"/.exec(attrs)?.[1] ?? '').replace(/&amp;/g, '&'), sandbox: /\bsandbox="([^"]*)"/.exec(attrs)?.[1] };
  });

function step(ids: string[]): TimelineStep {
  return {
    key: 'k',
    stepId: 's',
    stepIds: ['s'],
    round: 1,
    label: 'Drafts',
    stage: 'Explore',
    who: 'ai',
    status: 'done',
    costUsd: 0,
    artifacts: ids.map((artifactId, i) => ({ artifactId, label: `Draft ${i + 1}` })),
    iterations: 0,
    candidates: 0,
    checkpointIds: [],
    skippedParts: [],
    startedAt: '2026-10-08T10:00:00.000Z',
  };
}

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: 'r1',
  workspaceId: 'w',
  recipeId: 'c1',
  recipeHash: 'h',
  profileId: 'balanced',
  title: 'My page',
  problem: 'A page',
  medium: 'web-page',
  status: 'done',
  costUsd: 0,
  budgetUsd: 2,
  outputArtifactId: PAGE,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
  ...over,
});

describe('one rule for opening an artifact (F05)', () => {
  it('opens the whole-artifact viewer; a frame asks for scripts only when they are on; ids are read back from own addresses', () => {
    expect(openHref(PAGE)).toBe(VIEW(PAGE));
    expect(pageFrameUrl(PAGE, false)).toBe(artifactUrl(PAGE));
    expect(pageFrameUrl(PAGE, true)).toBe(`${artifactUrl(PAGE)}?scripts=1`);
    expect(artifactIdOf(`/artifacts/${PAGE}`)).toBe(PAGE);
    expect(artifactIdOf(`/artifacts/${encodeURIComponent(PAGE)}`)).toBe(PAGE);
    expect(artifactIdOf(`/api/artifacts/${PAGE}`)).toBe(PAGE);
    expect(artifactIdOf(`https://attacker.example/artifacts/${PAGE}`)).toBeUndefined();
    expect(artifactIdOf(`/artifacts/${PAGE}/../../settings`)).toBeUndefined();
    expect(artifactIdOf(undefined)).toBeUndefined();
  });

  it('an own address followed by a query or a #fragment names the same artifact; the path before them is held to the same rule', () => {
    expect(artifactIdOf(`/artifacts/${PAGE}#top`)).toBe(PAGE);
    expect(artifactIdOf(`/artifacts/${encodeURIComponent(PAGE)}?scripts=1`)).toBe(PAGE);
    expect(artifactIdOf(`/api/artifacts/${PAGE}?download=1&name=page.html#top`)).toBe(PAGE);
    expect(artifactIdOf(`/artifacts/${PAGE}#/../../settings`)).toBe(PAGE);
    expect(artifactIdOf(`https://attacker.example/artifacts/${PAGE}#top`)).toBeUndefined();
    expect(artifactIdOf(`//attacker.example/artifacts/${PAGE}?x=1`)).toBeUndefined();
    expect(artifactIdOf(`/artifacts/${PAGE}/../../settings#top`)).toBeUndefined();
    expect(artifactIdOf(`/artifacts/${PAGE}0?x=1`)).toBeUndefined();
    expect(artifactIdOf('#top')).toBeUndefined();
    expect(artifactIdOf('?scripts=1')).toBeUndefined();
  });

  it('StepDetail: Open goes to the viewer', () => {
    const out = html(createElement(StepDetail, { step: step([PAGE, MEMO]), artifacts, onClose: () => undefined, closeLabel: 'Back' }));
    expect(hrefs(out)).toEqual([VIEW(PAGE), VIEW(MEMO)]);
  });

  it('PickPanel: every option, page or text, has Open to the viewer', () => {
    for (const ids of [
      [PAGE, PAGE.replace(/a$/, 'd')],
      [MEMO, MEMO.replace(/b$/, 'e')],
    ]) {
      const cp: CheckpointRecord = {
        id: 'cp1',
        runId: 'r1',
        stepId: 's1',
        kind: 'pick',
        prompt: 'Which?',
        status: 'open',
        openedAt: '2026-10-08T10:00:00.000Z',
        options: ids.map((artifactId, i) => ({ id: String(i), label: `Draft ${i + 1}`, artifactId })),
        k: 1,
      };
      const info = Object.fromEntries(ids.map((id) => [id, artifacts[ids[0] === PAGE ? PAGE : MEMO] as ArtifactInfo]));
      const out = html(createElement(PickPanel, { cp, artifacts: info, busy: false, onSubmit: () => undefined, promptId: 'q', draft: startingDraft(cp), onDraft: () => undefined, sent: false }));
      expect(hrefs(out)).toEqual(ids.map(VIEW));
    }
  });

  it('ComparePanel: every version, page or text, has Open to the viewer, named for its version (F13)', () => {
    for (const ids of [
      [PAGE, PAGE.replace(/a$/, 'd')],
      [MEMO, MEMO.replace(/b$/, 'e')],
    ]) {
      const cp: CheckpointRecord = {
        id: 'cp1',
        runId: 'r1',
        stepId: 's1',
        kind: 'compare',
        prompt: 'Which?',
        status: 'open',
        openedAt: '2026-10-08T10:00:00.000Z',
        options: ids.map((artifactId, i) => ({ id: i === 0 ? 'A' : 'B', label: `Version ${i + 1}`, artifactId })),
      };
      const info = Object.fromEntries(ids.map((id) => [id, artifacts[ids[0] === PAGE ? PAGE : MEMO] as ArtifactInfo]));
      const out = html(createElement(ComparePanel, { cp, artifacts: info, busy: false, onSubmit: () => undefined, promptId: 'q', draft: startingDraft(cp), onDraft: () => undefined, sent: false }));
      expect(hrefs(out)).toEqual(ids.map(VIEW));
      const what = ids[0] === PAGE ? 'Open the whole page' : 'Open the whole text';
      for (const label of ['Version 1', 'Version 2']) expect(out).toContain(`${what}<span class="sr-only">: ${label}, in a new tab</span>`);
    }
  });

  it('References: every reference, page or text, has Open to the viewer', () => {
    expect(hrefs(html(createElement(References, { ids: [PAGE], artifacts })))).toEqual([VIEW(PAGE)]);
    expect(hrefs(html(createElement(References, { ids: [MEMO], artifacts })))).toEqual([VIEW(MEMO)]);
    expect(hrefs(html(createElement(References, { ids: [PAGE, MEMO], artifacts })))).toEqual([VIEW(PAGE), VIEW(MEMO)]);
  });

  it('Result: "Open in a new tab" goes to the viewer; the download says a downloaded page runs its scripts', () => {
    const out = html(
      createElement(ResultView, {
        run: run(),
        artifactId: PAGE,
        mediaType: 'text/html',
        text: null,
        made: { rows: [], skipped: [], byWho: { you: 0, ai: 0, tool: 0 }, totalUsd: 0 },
        media: {},
        presentation: null,
        label: null,
      }),
    );
    const links = hrefs(out);
    expect(links).toContain(VIEW(PAGE));
    expect(links).toContain(artifactUrl(PAGE, 'My page'));
    // No link opens the page's raw address.
    expect(links.filter((h) => h === artifactUrl(PAGE))).toEqual([]);
    expect(out).toContain('A downloaded page runs its scripts when you open it from your computer.');
  });

  it('ArtifactPreview: with nothing known about an artifact, its link goes to the viewer', () => {
    expect(hrefs(html(createElement(ArtifactPreview, { id: PAGE, info: undefined, title: 'Draft A' })))).toEqual([VIEW(PAGE)]);
    expect(hrefs(html(createElement(ArtifactPreview, { id: PAGE, info: { mediaType: 'application/octet-stream' }, title: 'Draft A' })))).toEqual([VIEW(PAGE)]);
  });

  it('Storyboard: a clip that cannot be shown is opened in the viewer', () => {
    const board = { shots: [{ shot: 1, description: 'Bread', imagePrompt: 'p', durationSec: 5, clipArtifactId: CLIP }], voiceover: 'v', totalSec: 5 };
    expect(hrefs(html(createElement(Storyboard, { board, media: { [CLIP]: { mediaType: 'application/octet-stream' } } })))).toEqual([VIEW(CLIP)]);
  });

  it('Markdown: a link to one of byway’s own artifacts opens the viewer; other links are left as written', () => {
    const own = hrefs(html(createElement(Markdown, { text: `See [the page](/artifacts/${PAGE}) and [the image](/api/artifacts/${encodeURIComponent(MEMO)}).` })));
    expect(own).toEqual([VIEW(PAGE), VIEW(MEMO)]);
    expect(hrefs(html(createElement(Markdown, { text: 'See [the docs](https://example.org/docs).' })))).toEqual(['https://example.org/docs']);
  });

  it('Markdown: a link to one of byway’s own artifacts with a #fragment or a query opens the viewer too; other links keep theirs', () => {
    const text = [
      `[top](/artifacts/${PAGE}#top)`,
      `[scripts](/artifacts/${PAGE}?scripts=1)`,
      `[download](/api/artifacts/${encodeURIComponent(MEMO)}?download=1&name=memo.md#end)`,
      '[docs](https://example.org/docs?a=1#b)',
      `[elsewhere](https://attacker.example/artifacts/${PAGE}#top)`,
    ].join(' ');
    expect(hrefs(html(createElement(Markdown, { text })))).toEqual([VIEW(PAGE), VIEW(PAGE), VIEW(MEMO), 'https://example.org/docs?a=1#b', `https://attacker.example/artifacts/${PAGE}#top`]);
  });
});

describe('page frames ask for scripts exactly when their sandbox allows them (F05)', () => {
  const pairsOk = (markup: string) => {
    const found = frames(markup);
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) expect(f.src.endsWith('?scripts=1'), JSON.stringify(f)).toBe(f.sandbox === 'allow-scripts');
    return found;
  };

  it('ScaledPage and PageResult derive the address and the sandbox from one switch', () => {
    expect(pairsOk(html(createElement(ScaledPage, { id: PAGE, title: 'Draft A' })))).toEqual([{ src: artifactUrl(PAGE), sandbox: '' }]);
    expect(pairsOk(html(createElement(ScaledPage, { id: PAGE, title: 'Draft A', scripts: true })))).toEqual([{ src: `${artifactUrl(PAGE)}?scripts=1`, sandbox: 'allow-scripts' }]);
    expect(pairsOk(html(createElement(PageResult, { id: PAGE, title: 'My page' })))).toEqual([{ src: artifactUrl(PAGE), sandbox: '' }]);
    pairsOk(html(createElement(ArtifactPreview, { id: PAGE, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'thumb' })));
    pairsOk(html(createElement(ArtifactPreview, { id: PAGE, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'large' })));
    pairsOk(html(createElement(ArtifactPreview, { id: PAGE, info: { mediaType: 'text/html' }, title: 'Draft A', size: 'large', scripts: true })));
  });
});

describe('no link in the app opens an artifact’s raw address (F05)', () => {
  /** `href={artifactUrl(x)}` with one argument is a raw open; with a second (the file name) it is a download. */
  function rawOpens(source: string): string[] {
    const found: string[] = [];
    for (const m of source.matchAll(/href=\{artifactUrl\(/g)) {
      let depth = 1;
      let i = (m.index ?? 0) + m[0].length;
      let topLevelComma = false;
      for (; i < source.length && depth > 0; i++) {
        const ch = source[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 1) topLevelComma = true;
      }
      if (!topLevelComma) found.push(source.slice(m.index ?? 0, i + 1));
    }
    return found;
  }

  it('finds raw opens when they are there', () => {
    expect(rawOpens('<a href={artifactUrl(id)}>x</a> <a href={artifactUrl(a.b(c), name)} download>')).toEqual(['href={artifactUrl(id)}']);
  });

  it('has none in the app’s screens and components', () => {
    const web = path.join(REPO, 'apps', 'web');
    const files = [...filesUnder(path.join(web, 'src'), /\.(ts|tsx)$/), ...filesUnder(path.join(web, 'app'), /\.(ts|tsx)$/)];
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((f) => rawOpens(readFileSync(f, 'utf8')).map((hit) => `${path.relative(REPO, f)}: ${hit}`));
    expect(offenders).toEqual([]);
  });
});
