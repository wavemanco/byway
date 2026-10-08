/**
 * Convention C5 (ENG-3, ENG-12): every model, image and video call an activity makes is memoized under its step call's
 * key, so a retried activity (Temporal's retry after a local failure, or the same step run again after a budget raise)
 * reuses what was already bought instead of paying again.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionResult, Gateway, ImageRequest, ImageResult, VideoRequest, VideoResult } from '@byway/contracts';
import { memoGateway, memoized, seededRandom } from '../src/activities/memo.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let runId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-memo-'));
  store = createTestStore({ dataDir: dir });
  const workspaceId = (await store.ensureDefaultWorkspace()).id;
  runId = (await store.createRun({ id: 'run-memo', workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 })).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A gateway that counts its provider calls and answers each with a new text. */
function counting(text: (n: number) => string = (n) => `answer ${n}`) {
  const made = { complete: 0, image: 0, video: 0 };
  const gateway: Gateway = {
    demo: true,
    async complete(): Promise<CompletionResult> {
      made.complete++;
      return { text: text(made.complete), stopReason: 'end', servedModel: 'm', provider: 'mock', usage: { inputTokens: 3, outputTokens: 4 }, costUsd: 0.25, ledgerEntryId: `l${made.complete}` };
    },
    async image(): Promise<ImageResult> {
      made.image++;
      return { artifactId: `sha256:${String(made.image).padStart(64, '0')}`, mediaType: 'image/png', servedModel: 'i', provider: 'mock', costUsd: 0.04, ledgerEntryId: `i${made.image}` };
    },
    async video(): Promise<VideoResult> {
      made.video++;
      return { artifactId: 'sha256:v', mediaType: 'video/mp4', lastFrameArtifactId: 'sha256:f', lastFrameMediaType: 'image/png', servedModel: 'v', provider: 'mock', costUsd: 1, ledgerEntryId: `v${made.video}` };
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [],
    verifyLedger: async () => null,
  };
  return { gateway, made };
}

const ask = (text: string): CompletionRequest => ({ workspaceId: 'w', runId: 'run-memo', stepId: 'draft', purpose: 'build:prose', tier: 'mid', profileId: 'demo', messages: [{ role: 'user', content: [{ type: 'text', text }] }] });
const scope = { runId: 'run-memo', key: 'run-memo/draft/-/1' };

describe('memoGateway (convention C5)', () => {
  it('a retried activity gets the answer it already bought, with its cost, and pays nothing more', async () => {
    const { gateway, made } = counting();
    const first = await memoGateway(gateway, store, scope).complete(ask('Write it.'));
    const again = await memoGateway(gateway, store, scope).complete(ask('Write it.'));
    expect(made.complete).toBe(1);
    expect(again).toEqual(first);
  });

  it('a call asked twice in one activity is two calls, and a retry replays both in order', async () => {
    const { gateway, made } = counting();
    const one = memoGateway(gateway, store, scope);
    const a = [await one.complete(ask('Same.')), await one.complete(ask('Same.'))];
    expect(made.complete).toBe(2);
    const two = memoGateway(gateway, store, scope);
    expect([await two.complete(ask('Same.')), await two.complete(ask('Same.'))]).toEqual(a);
    expect(made.complete).toBe(2);
  });

  it('a different request, or another step call, is a new call', async () => {
    const { gateway, made } = counting();
    await memoGateway(gateway, store, scope).complete(ask('Write it.'));
    await memoGateway(gateway, store, scope).complete(ask('Write it again, longer.'));
    await memoGateway(gateway, store, { ...scope, key: 'run-memo/draft/-/2' }).complete(ask('Write it.'));
    expect(made.complete).toBe(3);
  });

  it('images and clips are memoized too', async () => {
    const { gateway, made } = counting();
    const img: ImageRequest = { workspaceId: 'w', runId: 'run-memo', stepId: 'art', purpose: 'asset:prose', profileId: 'demo', prompt: 'A loaf', size: '1024x1024' };
    const clip: VideoRequest = { workspaceId: 'w', runId: 'run-memo', stepId: 'clip', purpose: 'relay:media', profileId: 'demo', prompt: 'Shot 1', durationSec: 4, shot: 1 };
    const first = memoGateway(gateway, store, scope);
    const shots = [await first.image(img), await first.video(clip)];
    const second = memoGateway(gateway, store, scope);
    expect([await second.image(img), await second.video(clip)]).toEqual(shots);
    expect(made).toEqual({ complete: 0, image: 1, video: 1 });
  });

  it('a long answer is kept as an artifact of its own, never as the work’s own bytes', async () => {
    const long = `# Page\n\n${'x'.repeat(70_000)}\n`;
    const { gateway, made } = counting(() => long);
    const first = await memoGateway(gateway, store, scope).complete(ask('Long.'));
    const again = await memoGateway(gateway, store, scope).complete(ask('Long.'));
    expect(again.text).toBe(long);
    expect(again).toEqual(first);
    expect(made.complete).toBe(1);
    // The work stored later under its own media type keeps that type.
    expect((await store.artifacts.putText(long, 'text/markdown')).mediaType).toBe('text/markdown');
  });
});

describe('memoized values and a replayable random', () => {
  it('keeps the first value for a key', async () => {
    let n = 0;
    expect(await memoized(store, runId, 'k', () => `v${++n}`)).toBe('v1');
    expect(await memoized(store, runId, 'k', () => `v${++n}`)).toBe('v1');
    expect(n).toBe(1);
  });

  it('a random seeded by the same salt draws the same numbers, in [0, 1)', () => {
    const a = seededRandom('salt');
    const b = seededRandom('salt');
    const draws = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(draws);
    expect(draws.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(draws).size).toBeGreaterThan(40);
    expect(seededRandom('other')()).not.toBe(draws[0]);
  });
});
