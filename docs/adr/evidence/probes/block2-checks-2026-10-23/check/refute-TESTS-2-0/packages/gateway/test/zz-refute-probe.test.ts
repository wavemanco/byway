// Scratch probe (refute-TESTS-2-0): an image or a clip whose model's wait cannot be read from Settings.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import { fakeFal, fakeGoogle, fakeOpenAI, MemoryArtifacts } from './fakes.ts';

const closed = () => {
  throw new Error('the store is closed');
};
const caps = { workspaceCapUsd: () => 100, runCapUsd: () => 50, waitMinutes: closed };
const KEYS = { OPENAI_API_KEY: '[redacted]', GEMINI_API_KEY: '[redacted]', FAL_KEY: '[redacted]' };

function make(clients: Record<string, unknown>, artifacts = new MemoryArtifacts()) {
  const dir = mkdtempSync(join(tmpdir(), 'refute-probe-'));
  const book = new MemorySpendBook();
  const admitted: string[] = [];
  const admit = book.admit.bind(book);
  book.admit = async (req: Parameters<typeof admit>[0]) => {
    admitted.push(req.purpose);
    return admit(req);
  };
  const g = createGateway({ ledgerPath: join(dir, 'l.jsonl'), artifacts, caps, spendBook: book, env: KEYS, clients: clients as never, retry: { sleep: async () => {}, random: () => 0.5 } });
  return { g, admitted, book };
}

it.each(['openai', 'google'] as const)('image (%s): a wait that cannot be read holds nothing and sends nothing', async (profileId) => {
  const oa = fakeOpenAI();
  const go = fakeGoogle();
  const { g, admitted } = make({ openai: oa.client, google: go.client });
  await expect(g.image({ workspaceId: 'ws', runId: 'run-1', stepId: 'art', purpose: 'asset:web-page', profileId, prompt: 'a loaf', size: '1024x1024' })).rejects.toThrow('the store is closed');
  const spend = await g.spend('ws');
  console.log(`IMAGE ${profileId}`, JSON.stringify({ spend, admitted, sent: oa.calls.length + go.calls.length }));
  expect(oa.calls.length + go.calls.length).toBe(0);
  expect(admitted).toEqual([]);
  expect(spend).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  await g.close();
});

it('video (fal): a wait that cannot be read holds nothing and submits nothing', async () => {
  const artifacts = new MemoryArtifacts();
  const startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
  const fal = fakeFal();
  const { g, admitted } = make({ fal: fal.client }, artifacts);
  await expect(g.video({ workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', profileId: 'balanced', prompt: 'p', startFrameArtifactId: startFrame, durationSec: 5 })).rejects.toThrow('the store is closed');
  const spend = await g.spend('ws');
  console.log('VIDEO', JSON.stringify({ spend, admitted, submitted: fal.calls.length }));
  expect(fal.calls).toEqual([]);
  expect(admitted).toEqual([]);
  expect(spend).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  // And the run's cap: a later clip in the same run still sees the whole run budget.
  await g.close();
});
