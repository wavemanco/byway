/**
 * A fal clip whose wait runs out during a relay step, end to end through the real workflow and the real fal adapter
 * (backlog row B-073 (4): until now that wait was tested at the activity level with the real memo, and the engine tests
 * read the relay's scheduled limits and its calls' waits from history). Nothing leaves this computer: fal's client is a
 * stand-in whose clip job never finishes and which answers its cancel as asked to stop. The adapter is given a wait of
 * 50 ms in place of the video model's 30 minutes, so the clip's wait, not any check of this test, is what ends it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { falAdapter, mockAdapter, type FalClientLike, type ProviderAdapter } from '@byway/gateway';
import { relay, seq, step, withHash, type Recipe, type Step } from '@byway/recipe';
import { createHarness, type Harness } from './helpers/harness.ts';

const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const WAIT_MS = 50;

/** A storyboard, its frames, and one relay link. */
const oneLink: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'one-link',
  title: 'one-link',
  kind: 'composed',
  family: 'test',
  channel: 'workspace',
  medium: 'media',
  inputs: ['intent'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        step({ id: 'board', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.test.board', consumes: ['intent'], produces: ['artifact'], writes: true }),
        step({ id: 'frames', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', prompt: 'product.test.frames', consumes: ['artifact'], produces: ['artifact', 'anchor'], writes: true }),
        relay('links', 1, step({ id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true }) as Step),
      ),
    },
  ],
  sitsOut: [],
  exceptions: [],
  bank: false,
});

/** fal's client, as far as a clip that never finishes needs it: every submission and cancel is kept. */
function neverDone() {
  const submitted: string[] = [];
  const cancels: string[] = [];
  const client: FalClientLike = {
    storage: { upload: async () => 'https://v3.fal.media/files/upload-0.png' },
    queue: {
      async submit(endpoint) {
        submitted.push(endpoint);
        return { request_id: `req-${submitted.length}` };
      },
      subscribeToStatus(_endpoint, options) {
        return new Promise((_, reject) => options.abortSignal?.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })), { once: true }));
      },
      async status() {
        return { status: 'IN_PROGRESS' };
      },
      async result() {
        throw new Error('the clip was never made');
      },
      async cancel(_endpoint, options) {
        cancels.push(options.requestId);
        return { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' };
      },
    },
  };
  return { client, submitted, cancels };
}

describe('a relay link whose clip outlasts its wait, through the engine and the real fal adapter', () => {
  let h: Harness;
  const fal = neverDone();
  beforeAll(async () => {
    const real = falAdapter({ client: fal.client });
    // The demo's mock for everything else; the relay link's clip through fal's adapter, on a fal model, with a short wait.
    const clips: ProviderAdapter = { ...mockAdapter(), id: 'mock', video: (req) => real.video!({ ...req, model: KLING, waitMs: WAIT_MS }) };
    h = await createHarness({ book: 'store', adapters: { mock: clips } });
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  }, 60_000);

  it('cancels the clip at its wait, never submits it again, fails the run saying so, and lists the call as waited', async () => {
    const run = await h.start(oneLink, { problem: { text: 'A 10-second ad for a reusable cup' } });
    const view = await h.drive(run.id);
    expect(view.run.status).toBe('failed');
    expect(view.run.error).toMatch(/did not finish clip job req-1 within .* minutes, the wait chosen in Settings, so byway stopped waiting and cancelled it: fal was asked to stop it while it ran \(HTTP 202 CANCELLATION_REQUESTED\)/);
    // One clip job, cancelled once: a wait that ran out is not tried again (the error is not retryable).
    expect(fal.submitted).toEqual([KLING]);
    expect(fal.cancels).toEqual(['req-1']);
    const { uncertain } = await h.store.spendBook.records(h.workspaceId);
    expect(uncertain).toEqual([expect.objectContaining({ runId: run.id, purpose: 'relay:media', reason: 'waited', waited: { minutes: WAIT_MS / 60_000, how: 'clip', cancel: 'fal was asked to stop it while it ran (HTTP 202 CANCELLATION_REQUESTED), and it can still finish it' }, providerJobs: { generation: 'req-1' } })]);
  });
});
