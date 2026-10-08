/**
 * CRITIC modes, lineups and verdicts without Temporal: which note a fallback carries (LABEL-2); a lineup whose items
 * all take one form, with nothing that gives ours away and nothing nested under the lineup's labels (ENG-7,
 * BLIND-1); web pages shown by their named surfaces, references too (RENDER-1); and the rank a GREAT critic hands its
 * gate, with the lineup size the gate's threshold was written for (GATE-1).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Gateway } from '@byway/contracts';
import { buildLineup, FEW_REFS_NOTE, OK_FALLBACK_NOTE, planCritic, verdictOf, type Lineup } from '../src/activities/critic.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { ArtifactReader, userMessage } from '../src/activities/prompting.ts';
import { textView } from '../src/formats.ts';
import { sectionOf } from '../src/parse.ts';
import { SURFACE_CAPTIONS } from '../src/surfaces.ts';
import type { View } from '../src/types.ts';
import { fakePages, png } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let deps: RunnerDeps;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-critic-'));
  store = createTestStore({ dataDir: dir });
  deps = { gateway: {} as Gateway, store, prompts: fakePrompts(), pages: fakePages() };
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const headings = (text: string) => [...text.matchAll(/^#{1,6}[ \t]+([A-Z]{1,2})[ \t]*$/gm)].map((m) => m[1]);

describe('a GREAT lineup: every item one block, in one form, nothing that gives ours away', () => {
  it('a pooled view (C2’s option set) is one item under one label, its options numbered, not labelled (ENG-7)', async () => {
    const pool = await Promise.all(['1. Fix-it Fridays: weekly repair nights\n   Why: habit', '1. Parts club: members get parts at cost\n   Why: loyalty', '1. Ride clinic: tune-ups on the trail\n   Why: reach'].map((t) => store.artifacts.putText(t, 'text/plain')));
    const view: View = { pool: true, items: pool.map((r) => ({ textArtifactId: r.id, imageArtifactIds: [] })) };
    const refs = await Promise.all([1, 2, 3].map((i) => store.artifacts.putText(JSON.stringify({ options: [{ title: `Prior art ${i}`, pitch: 'Known', rationale: 'Worked' }] }), 'application/json')));
    const lineup = await buildLineup(deps, new ArtifactReader(deps), 'options', { view }, refs.map((r) => r.id), () => 0.3);
    expect(headings(lineup.slots.view!)).toEqual(lineup.labels);
    const ours = sectionOf(lineup.slots.view!, lineup.ours)!;
    expect(ours).toContain('1. Fix-it Fridays');
    expect(ours).toContain('3. Ride clinic');
  });

  it('a storyboard against image references is shown as its frames only: no image prompts, no process lines (BLIND-1)', async () => {
    const frame = (await store.artifacts.put(png(4, 3, [1, 2, 3]), 'image/png')).id;
    const board = (await store.artifacts.putText('Shot 1 (3s): Open on hands.\n   Frame: Close-up of hands, morning light\n   Clip: made\n\nVoice-over: Less time.', 'text/plain')).id;
    const view: View = { pool: false, items: [{ textArtifactId: board, imageArtifactIds: [frame] }] };
    const refs = await Promise.all([10, 20, 30].map(async (c) => (await store.artifacts.put(png(4, 3, [c, c, c]), 'image/png')).id));
    const lineup = await buildLineup(deps, new ArtifactReader(deps), 'media', { view }, refs, () => 0.6);
    // Media judges see frames (MEDIUM_FORMAT): with every item images only, the view slot has no text at all.
    expect(lineup.slots.view).toBe('');
    expect(lineup.images.map((g) => g.label)).toEqual(lineup.labels);
    expect(lineup.images.find((g) => g.label === lineup.ours)?.artifactIds).toEqual([frame]);
  });

  it('a storyboard read as text never shows how it was made (BLIND-1)', async () => {
    const sb = { storyboard: [{ shot: 1, description: 'Open on hands.', imagePrompt: 'Close-up, morning light', durationSec: 3, caption: 'Again?', clipArtifactId: 'sha256:x' }], voiceover: 'Less time.', headline: 'Time, handed back.' };
    const text = textView('media', JSON.stringify(sb));
    expect(text).toBe('Headline: Time, handed back.\n\nShot 1 (3s): Open on hands.\n   On screen: Again?\n\nVoice-over: Less time.');
  });

  it('a web page and its HTML references are shown by the same named surfaces, under their labels (RENDER-1)', async () => {
    const shot = async (c: number) => (await store.artifacts.put(png(4, 3, [c, 0, 0]), 'image/png')).id;
    const view: View = { pool: false, items: [{ imageArtifactIds: [], surfaces: [{ surface: 'desktop', imageArtifactIds: [await shot(1)] }, { surface: 'mobile', imageArtifactIds: [await shot(2)] }, { surface: 'fold', imageArtifactIds: [await shot(3)] }] }] };
    const refs = await Promise.all([1, 2, 3].map((i) => store.artifacts.putText(`<!doctype html><html><body><h1>Ref ${i}</h1></body></html>`, 'text/html')));
    const reader = new ArtifactReader(deps);
    const lineup = await buildLineup(deps, reader, 'web-page', { view }, refs.map((r) => r.id), () => 0.1, true, ['desktop', 'mobile']);
    for (const label of lineup.labels) {
      expect(lineup.images.filter((g) => g.label === label).map((g) => g.caption)).toEqual([SURFACE_CAPTIONS.desktop, SURFACE_CAPTIONS.mobile]);
    }
    const message = await userMessage(reader, 'Rank them.', lineup.images);
    const texts = message.content.flatMap((p) => (p.type === 'text' ? [p.text] : []));
    expect(texts.filter((t) => /^### [A-D]$/.test(t))).toEqual(lineup.labels.map((l) => `### ${l}`));
  });
});

describe('our section of a lineup critique is the top-level one (ENG-7)', () => {
  it('takes the shallowest heading for the label, not an inner one of the same name', () => {
    const critique = '## A\n- Generic.\n\n## B\n#### Option 1\n- Fine.\n### A\n- inner\n\n## C\n- Plain.';
    expect(sectionOf(critique, 'A')).toBe('- Generic.');
    expect(sectionOf('### A\n- inner\n# A\n- outer', 'A')).toBe('- outer');
  });
});

const great = { knobs: { mode: 'GREAT', refs: 4 } };
const random = () => 0.5;

describe('the OK fallback says what was supplied (LABEL-2)', () => {
  it('no examples: the ADR-0071 note; one or two: says fewer than three were given', () => {
    expect(planCritic(great, [], random)).toMatchObject({ mode: 'OK', note: OK_FALLBACK_NOTE });
    expect(planCritic(great, ['a'], random)).toMatchObject({ mode: 'OK', note: FEW_REFS_NOTE });
    expect(planCritic(great, ['a', 'b'], random)).toMatchObject({ mode: 'OK', note: FEW_REFS_NOTE });
    expect(FEW_REFS_NOTE).toMatch(/^Fewer than three examples were supplied/);
    expect(planCritic(great, ['a', 'b', 'c'], random)).toMatchObject({ mode: 'GREAT' });
  });
});

describe('a GREAT verdict names the lineup its gate was written for (GATE-1)', () => {
  it('carries the refs knob plus ours with our rank', () => {
    const lineup: Lineup = { slots: {}, images: [], labels: ['A', 'B', 'C', 'D'], ours: 'B' };
    const v = verdictOf([{ answer: { mode: 'GREAT', critique: '### B\n- gap', ranking: ['A', 'B', 'C', 'D'] }, lineup }], 5);
    expect(v.score).toEqual({ kind: 'rank', rank: 2, of: 4, writtenFor: 5 });
  });
});
