/**
 * Each model's answer wait (AnswerWait; Settings' "How long to wait for an answer", the owner's choices of 2026-10-22):
 * one row per workspace, provider and model. The store takes any of the minutes some kind of model offers and nothing
 * else, since it does not know the models; which of them a model's own kind offers is the web API's check.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ANSWER_WAIT_MINUTES, StoreError } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

describe('answer waits', () => {
  it('are none until the person chooses one', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    expect(await store.getAnswerWaits(ws.id)).toEqual([]);
  });

  it('keep one choice per provider and model, a new choice replacing the old, and say when it was made', async () => {
    let now = '2026-10-22T12:00:00.000Z';
    const store = openStore({ now: () => new Date(now) });
    const ws = await store.ensureDefaultWorkspace();
    expect(await store.setAnswerWait(ws.id, { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30 })).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30, changedAt: now });
    // The same model through OpenRouter is a choice of its own.
    now = '2026-10-22T12:05:00.000Z';
    await store.setAnswerWait(ws.id, { provider: 'openrouter', model: 'anthropic/claude-opus-5.5', minutes: 60 });
    now = '2026-10-22T12:10:00.000Z';
    await store.setAnswerWait(ws.id, { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 45 });
    expect(await store.getAnswerWaits(ws.id)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 45, changedAt: '2026-10-22T12:10:00.000Z' },
      { provider: 'openrouter', model: 'anthropic/claude-opus-5.5', minutes: 60, changedAt: '2026-10-22T12:05:00.000Z' },
    ]);
  });

  it('take every minute some kind offers (text 15-60, images 5-20, video 30-75) and refuse anything else', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    expect(ANSWER_WAIT_MINUTES).toEqual([5, 10, 15, 20, 30, 45, 60, 75]);
    for (const minutes of ANSWER_WAIT_MINUTES) expect((await store.setAnswerWait(ws.id, { provider: 'fal', model: 'm', minutes })).minutes).toBe(minutes);
    for (const minutes of [0, -15, 7, 25, 90, 15.5, Number.NaN, Number.POSITIVE_INFINITY, '15']) {
      await expect(store.setAnswerWait(ws.id, { provider: 'fal', model: 'm', minutes } as never)).rejects.toMatchObject({ code: 'invalid' });
    }
    expect(await store.getAnswerWaits(ws.id)).toEqual([expect.objectContaining({ minutes: 75 })]);
  });

  it('refuse a choice that names no provider byway knows, no model, or more than a choice', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    const bad = [
      { provider: 'acme', model: 'm', minutes: 15 },
      { provider: '', model: 'm', minutes: 15 },
      { provider: 'google', model: '', minutes: 15 },
      { provider: 'google', model: '  ', minutes: 15 },
      { provider: 'google', model: 'gemini-3.8-flash', minutes: 15, changedAt: 'now' },
      ['google', 'gemini-3.8-flash', 15],
    ];
    for (const wait of bad) await expect(store.setAnswerWait(ws.id, wait as never)).rejects.toBeInstanceOf(StoreError);
    expect(await store.getAnswerWaits(ws.id)).toEqual([]);
  });

  it('belong to their workspace: another workspace’s are not listed, and an unknown workspace is not found', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    await store.setAnswerWait(ws.id, { provider: 'google', model: 'gemini-3.8-flash', minutes: 30 });
    const db = new DatabaseSync(store.dbPath);
    try {
      db.prepare(`INSERT INTO workspaces (id, name, budget_usd, created_at) VALUES ('other', 'Other', 5, '2026-10-22T00:00:00.000Z')`).run();
    } finally {
      db.close();
    }
    expect(await store.getAnswerWaits('other')).toEqual([]);
    await store.setAnswerWait('other', { provider: 'google', model: 'gemini-3.8-flash', minutes: 60 });
    expect(await store.getAnswerWaits('other')).toEqual([expect.objectContaining({ minutes: 60 })]);
    expect(await store.getAnswerWaits(ws.id)).toEqual([expect.objectContaining({ minutes: 30 })]);
    await expect(store.getAnswerWaits('ws-missing')).rejects.toMatchObject({ code: 'not-found' });
    await expect(store.setAnswerWait('ws-missing', { provider: 'google', model: 'gemini-3.8-flash', minutes: 30 })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('keep a choice for a model no profile uses (the store does not know the models), and hold across store instances', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const ws = await a.ensureDefaultWorkspace();
    await a.setAnswerWait(ws.id, { provider: 'google', model: 'gemini-3.1-pro-preview', minutes: 60 });
    a.close();
    const b = openStore({ dataDir });
    expect(await b.getAnswerWaits(ws.id)).toEqual([expect.objectContaining({ provider: 'google', model: 'gemini-3.1-pro-preview', minutes: 60 })]);
  });
});
