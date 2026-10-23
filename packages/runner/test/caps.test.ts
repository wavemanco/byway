/**
 * The gateway's caps read from the store (caps.ts): beside the budgets, each model's answer wait chosen in Settings
 * ("How long to wait for an answer", the owner's choices of 2026-10-22), by provider and model, read on every call.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { storeCaps } from '../src/caps.ts';
import { createTestStore } from './helpers/memo.ts';

describe('the answer waits the gateway reads from the store', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-caps-'));
  const store = createTestStore({ dataDir: dir });
  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('are the choice for the call’s own provider and model, none when it has none, and read afresh on every call', async () => {
    const ws = (await store.ensureDefaultWorkspace()).id;
    const caps = storeCaps(store);
    const opus = { provider: 'anthropic', model: 'claude-opus-5-5' } as const;
    expect(await caps.waitMinutes?.(ws, opus)).toBeUndefined();
    await store.setAnswerWait(ws, { ...opus, minutes: 45 });
    // The same model through OpenRouter, and another Anthropic model, are choices of their own.
    await store.setAnswerWait(ws, { provider: 'openrouter', model: 'claude-opus-5-5', minutes: 60 });
    await store.setAnswerWait(ws, { provider: 'anthropic', model: 'claude-sonnet-5-5', minutes: 30 });
    expect(await caps.waitMinutes?.(ws, opus)).toBe(45);
    expect(await caps.waitMinutes?.(ws, { provider: 'anthropic', model: 'claude-sonnet-5-5' })).toBe(30);
    expect(await caps.waitMinutes?.(ws, { provider: 'openrouter', model: 'claude-opus-5-5' })).toBe(60);
    expect(await caps.waitMinutes?.(ws, { provider: 'openai', model: 'gpt-6-astra' })).toBeUndefined();
    // A change applies from the next call.
    await store.setAnswerWait(ws, { ...opus, minutes: 15 });
    expect(await caps.waitMinutes?.(ws, opus)).toBe(15);
  });
});
