// Scratch probe (lens-tests): an image and a clip whose model's wait cannot be read.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import type { OpenAIClientLike } from '../src/providers/openai.ts';
import type { FalClientLike } from '../src/providers/fal.ts';
import { MemoryArtifacts } from './fakes.ts';

const caps = { workspaceCapUsd: () => 100, runCapUsd: () => 50, waitMinutes: () => { throw new Error('the store is closed'); } };

it('image: a wait that cannot be read holds nothing and sends nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-probe-'));
  let sent = 0;
  const client: OpenAIClientLike = { chat: { completions: { create: () => Promise.reject(new Error('no')) } }, images: { generate: async () => { sent++; throw new Error('no'); } } };
  const book = new MemorySpendBook();
  const g = createGateway({ ledgerPath: join(dir, 'l.jsonl'), artifacts: new MemoryArtifacts(), caps, spendBook: book, env: { OPENAI_API_KEY: '[redacted]' }, clients: { openai: client }, retry: { sleep: async () => {}, random: () => 0.5 } });
  await expect(g.image({ workspaceId: 'ws', runId: 'run-1', stepId: 'art', purpose: 'asset:web-page', profileId: 'openai', prompt: 'a loaf', size: '1024x1024' })).rejects.toThrow('the store is closed');
  console.log('IMAGE spend after failed read', JSON.stringify(await g.spend('ws')), 'sent', sent);
  expect(sent).toBe(0);
  expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  await g.close();
});

it('video: a wait that cannot be read holds nothing and sends nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-probe-'));
  const artifacts = new MemoryArtifacts();
  const startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
  let submitted = 0;
  const client: FalClientLike = { storage: { upload: async () => 'https://v3.fal.media/x.png' }, queue: { submit: async () => { submitted++; return { request_id: 'r' }; }, subscribeToStatus: async () => ({}), result: async () => ({ data: {}, requestId: 'r' }), cancel: async () => ({ status: 'failed', detail: '' }) } };
  const g = createGateway({ ledgerPath: join(dir, 'l.jsonl'), artifacts, caps, spendBook: new MemorySpendBook(), env: { FAL_KEY: '[redacted]' }, clients: { fal: client }, retry: { sleep: async () => {}, random: () => 0.5 } });
  await expect(g.video({ workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', profileId: 'balanced', prompt: 'p', startFrameArtifactId: startFrame, durationSec: 5 })).rejects.toThrow('the store is closed');
  console.log('VIDEO spend after failed read', JSON.stringify(await g.spend('ws')), 'submitted', submitted);
  expect(submitted).toBe(0);
  expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  await g.close();
});
