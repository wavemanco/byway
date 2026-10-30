/**
 * Images an ASSET step keeps beside a prose piece or a page (ADR-0112, B-047): those its placing answer left out, or
 * every one when no answer could be used. Before, the Result screen showed images beside the deliverable only for an
 * options run, so a kept image was found only through "Open the run". Both screens, both cases: no image placed, and
 * some placed.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RunEvent, RunRecord } from '@byway/contracts';
import { ResultView } from '../src/components/result/ResultView.tsx';
import { StepDetail } from '../src/components/run/StepDetail.tsx';
import { withMoodBoards } from '../src/server/export.ts';
import { boardedOptions, howItWasMade, resultImages } from '../src/view/run.ts';
import { buildTimeline } from '../src/view/timeline.ts';

let n = 0;
const ev = (type: RunEvent['type'], stepId: string | undefined, data: Record<string, unknown>): RunEvent => ({
  runId: 'r1',
  seq: ++n,
  at: `2026-10-07T10:00:${String(n).padStart(2, '0')}.000Z`,
  type,
  ...(stepId ? { stepId } : {}),
  data,
});

const KEPT_NOTE = 'The image for “detail” was not placed in the work, even when the AI was asked again, so it is kept beside the work.';
const NONE_NOTE = 'The AI’s answer placing the images in the work could not be used, even when it was asked again, so the work is unchanged, and the images for “header” and “detail” are kept beside it.';

/** A run whose Custom imagery step made `placed` and `kept` images, and the work when it placed any. */
function timeline(placed: string[], kept: string[]) {
  const events = [
    ev('step-started', 'illustrate', { label: 'Custom imagery', stage: 'D2', role: 'asset', actor: 'model', block: 'ASSET' }),
    ...[...placed, ...kept].map((id) => ev('artifact', 'illustrate', { artifactId: id, mediaType: 'image/png', label: `Image: ${id.slice(7, 11)}` })),
    ...(placed.length > 0 ? [ev('artifact', 'illustrate', { artifactId: `sha256:${'9'.repeat(64)}`, mediaType: 'text/markdown', label: 'Memo' })] : []),
    ev('step-finished', 'illustrate', { costUsd: 0.2, note: placed.length > 0 ? KEPT_NOTE : NONE_NOTE }),
    ev('run-finished', undefined, { costUsd: 0.2 }),
  ];
  return buildTimeline(events, [], 'done', null);
}

const A = `sha256:${'a'.repeat(64)}`;
const B = `sha256:${'b'.repeat(64)}`;
const piece = (placed: string[]) => ['# Memo', '', 'Two lines, the ask first.', ...placed.map((id) => `![A header](/api/artifacts/${id})`)].join('\n');
const page = (placed: string[]) => `<!doctype html><html><body><h1>Memo</h1>${placed.map((id) => `<img src="/api/artifacts/${id}" alt="">`).join('')}</body></html>`;

describe('the Result screen shows the images a piece or page does not hold (B-047)', () => {
  it('shows every image when none was placed, and only those left out when some were', () => {
    const none = resultImages('prose', timeline([], [A, B]), piece([]));
    expect(none.map((i) => i.artifactId)).toEqual([A, B]);
    expect(none[0]).toMatchObject({ step: 'Custom imagery', label: 'Image: aaaa' });
    expect(resultImages('prose', timeline([A], [B]), piece([A])).map((i) => i.artifactId)).toEqual([B]);
    expect(resultImages('web-page', timeline([A], [B]), page([A])).map((i) => i.artifactId)).toEqual([B]);
    expect(resultImages('web-page', timeline([A, B], []), page([A, B]))).toEqual([]);
  });

  it('downloads an options run with its mood boards: the option map the image step kept beside it (B-014)', async () => {
    const kept = `sha256:${'c'.repeat(64)}`;
    const withBoards = buildTimeline(
      [
        ev('step-started', 'mood-boards', { label: 'Custom imagery', stage: 'D1', role: 'asset', actor: 'model', block: 'ASSET' }),
        ev('artifact', 'mood-boards', { artifactId: A, mediaType: 'image/png', label: 'Image: A' }),
        ev('artifact', 'mood-boards', { artifactId: kept, mediaType: 'application/json', label: 'Mood boards (kept beside the work)' }),
        ev('step-finished', 'mood-boards', { costUsd: 0.1 }),
        ev('run-finished', undefined, { costUsd: 0.1 }),
      ],
      [],
      'done',
      null,
    );
    expect(boardedOptions('options', withBoards)).toBe(kept);
    expect(boardedOptions('prose', withBoards)).toBeUndefined();
    expect(boardedOptions('options', timeline([], []))).toBeUndefined();
    // A composed recipe whose VOICE rewrote the map after the boards: the deliverable, in the person's words (the check).
    const voicedAfter = buildTimeline(
      [
        ev('step-started', 'mood-boards', { label: 'Custom imagery', stage: 'D1', role: 'asset', actor: 'model', block: 'ASSET' }),
        ev('artifact', 'mood-boards', { artifactId: kept, mediaType: 'application/json', label: 'Mood boards (kept beside the work)' }),
        ev('step-finished', 'mood-boards', { costUsd: 0.1 }),
        ev('step-started', 'voice', { label: 'Your words', stage: 'D1', role: 'voice', actor: 'human', block: 'VOICE' }),
        ev('artifact', 'voice', { artifactId: B, mediaType: 'application/json', label: 'Option map' }),
        ev('step-finished', 'voice', { costUsd: 0 }),
        ev('run-finished', undefined, { costUsd: 0.1 }),
      ],
      [],
      'done',
      null,
    );
    expect(boardedOptions('options', voicedAfter)).toBeUndefined();
    // The download carries each board inline beside its option, and leaves the rest of the map as it was.
    const png = new Uint8Array([137, 80, 78, 71]);
    const store = { has: async (id: string) => id === A, get: async () => ({ record: { id: A, mediaType: 'image/png', bytes: png.length, createdAt: '' }, bytes: png }) };
    const out = JSON.parse(await withMoodBoards(JSON.stringify({ options: [{ title: 'A', imageArtifactId: A, chosen: true }, { title: 'B', chosen: false }] }), store)) as { options: { moodBoard?: string }[] };
    expect(out.options[0]!.moodBoard).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
    expect(out.options[1]).not.toHaveProperty('moodBoard');
    // Anything that is not an option map is returned as it was.
    expect(await withMoodBoards('not json', store)).toBe('not json');
    expect(await withMoodBoards('{"storyboard":[]}', store)).toBe('{"storyboard":[]}');
    expect(await withMoodBoards('null', store)).toBe('null');
  });

  it('still shows every image beside an options list, which cannot hold them (UX-8)', () => {
    expect(resultImages('options', timeline([], [A, B]), `{"options":[{"imageArtifactId":"${A}"}]}`).map((i) => i.artifactId)).toEqual([A, B]);
  });

  it('shows them with a download each, and says they are kept beside the result and left out of its export', () => {
    const t = timeline([A], [B]);
    const run: RunRecord = {
      id: 'r1',
      workspaceId: 'w',
      recipeId: 'c3',
      recipeHash: 'h',
      profileId: 'balanced',
      title: 'Memo',
      problem: 'A memo',
      medium: 'prose',
      status: 'done',
      costUsd: 0.2,
      budgetUsd: 2,
      createdAt: '2026-10-07T10:00:00.000Z',
      updatedAt: '2026-10-07T10:00:00.000Z',
      outputArtifactId: `sha256:${'9'.repeat(64)}`,
    };
    const html = renderToStaticMarkup(
      createElement(ResultView, {
        run,
        artifactId: run.outputArtifactId as string,
        mediaType: 'text/markdown',
        text: piece([A]),
        made: howItWasMade(t),
        media: {},
        presentation: null,
        label: null,
        images: resultImages(run.medium, t, piece([A])),
      }),
    );
    expect(html).toContain('Images made in this run that are not in the result above. They are kept beside it, and the export leaves them out.');
    expect(html).toContain(`/artifacts/${encodeURIComponent(B)}`);
    expect(html).not.toContain(`"/artifacts/${encodeURIComponent(A)}`);
    expect(html).not.toContain('They are not part of the options above.');
    expect(html.match(/download=""/g)?.length).toBe(2); // the export, and the kept image
  });
});

describe('the Run screen shows the kept images in the step’s outputs, with its note (B-047)', () => {
  for (const [what, placed, kept, note] of [
    ['no image placed', [], [A, B], NONE_NOTE],
    ['some placed', [A], [B], KEPT_NOTE],
  ] as const) {
    it(what, () => {
      const step = timeline([...placed], [...kept]).flatMap((s) => s.steps).find((s) => s.block === 'ASSET');
      expect(step).toBeDefined();
      const html = renderToStaticMarkup(createElement(StepDetail, { step: step!, artifacts: {}, onClose: () => undefined, closeLabel: 'Close' }));
      expect(html).toContain(note);
      for (const id of [...placed, ...kept]) expect(html).toContain(`/view/${encodeURIComponent(id)}`);
    });
  }
});
