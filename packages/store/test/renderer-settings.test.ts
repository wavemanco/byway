/**
 * The page renderer's settings (ADR-0105): one set for the data directory, since the engine's one renderer serves every
 * workspace. The OS sandbox is on until the person switches it off in Settings (setRendererSandbox, the only writer), and
 * the start-up check's finding is recorded beside it without ever changing it.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { RendererCheckRecord } from '@byway/contracts';
import { DEFAULT_RENDERER_SETTINGS, migrate } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

/** A clock stopped at one instant (opening a store reads it too). */
const at = (iso: string) => () => new Date(iso);

const CHECK: RendererCheckRecord = { at: '2026-10-18T14:00:00.000Z', osSandbox: true, ready: true, sandbox: 'starts' };

describe('the page renderer settings (ADR-0105)', () => {
  it('are the sandbox on, with no check, when never set', async () => {
    const store = openStore();
    expect(DEFAULT_RENDERER_SETTINGS).toEqual({ osSandbox: true });
    expect(await store.getRendererSettings()).toEqual({ osSandbox: true });
  });

  it('switch only when the person switches them, recording when, and hold across store instances (one set for the data directory)', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir, now: at('2026-10-18T14:00:00.000Z') });
    expect(await a.setRendererSandbox(false)).toEqual({ osSandbox: false, changedAt: '2026-10-18T14:00:00.000Z' });
    a.close();
    const b = openStore({ dataDir, now: at('2026-10-18T15:00:00.000Z') });
    expect(await b.getRendererSettings()).toEqual({ osSandbox: false, changedAt: '2026-10-18T14:00:00.000Z' });
    expect(await b.setRendererSandbox(true)).toEqual({ osSandbox: true, changedAt: '2026-10-18T15:00:00.000Z' });
  });

  it('record the start-up check beside the setting, never changing it, and keep only the latest', async () => {
    const store = openStore({ now: at('2026-10-18T14:00:00.000Z') });
    expect(await store.recordRendererCheck(CHECK)).toEqual({ osSandbox: true, lastCheck: CHECK });
    await store.setRendererSandbox(false);
    const failed: RendererCheckRecord = {
      at: '2026-10-18T16:00:00.000Z',
      osSandbox: false,
      ready: true,
      sandbox: 'fails',
      message: 'The page renderer could not start inside its OS sandbox on this computer.',
      why: 'byway is running as root, and Chromium does not start its sandbox for root.',
      fix: 'Start byway as an ordinary user.',
    };
    // A check that ran with the sandbox on does not switch it back on, and one that found it failing does not switch it off.
    expect(await store.recordRendererCheck({ ...CHECK, at: '2026-10-18T15:30:00.000Z' })).toMatchObject({ osSandbox: false });
    expect(await store.recordRendererCheck(failed)).toEqual({ osSandbox: false, changedAt: '2026-10-18T14:00:00.000Z', lastCheck: failed });
    await store.setRendererSandbox(true);
    expect((await store.getRendererSettings()).lastCheck).toEqual(failed);
  });

  it('refuse a setting that is not true or false, and a check that is not one', async () => {
    const store = openStore();
    await expect(store.setRendererSandbox('off' as never)).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.setRendererSandbox(0 as never)).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.setRendererSandbox(undefined as never)).rejects.toMatchObject({ code: 'invalid' });
    for (const bad of [
      { ...CHECK, sandbox: 'maybe' },
      { ...CHECK, ready: 'yes' },
      { ...CHECK, osSandbox: undefined },
      { ...CHECK, at: '' },
      { ...CHECK, message: 7 },
      { ...CHECK, why: '' },
      { ...CHECK, extra: 1 },
      null,
    ]) {
      await expect(store.recordRendererCheck(bad as never), JSON.stringify(bad)).rejects.toMatchObject({ code: 'invalid' });
    }
    expect(await store.getRendererSettings()).toEqual({ osSandbox: true });
  });

  it('live in one row of their own table, which an older database gains with the sandbox on', () => {
    const db = new DatabaseSync(':memory:');
    try {
      migrate(db);
      expect(db.prepare('SELECT COUNT(*) AS n FROM renderer_settings').get()?.n).toBe(0);
      const insert = db.prepare('INSERT INTO renderer_settings (id, os_sandbox, changed_at, last_check) VALUES (?, ?, NULL, NULL)');
      insert.run(1, 0);
      expect(() => insert.run(2, 1)).toThrow(/CHECK/);
      expect(() => db.prepare('UPDATE renderer_settings SET os_sandbox = 2').run()).toThrow(/CHECK/);
      expect(() => db.prepare("UPDATE renderer_settings SET last_check = 'not json'").run()).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });
});
