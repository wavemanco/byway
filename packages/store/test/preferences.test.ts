import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

describe('preferences', () => {
  it('answers with the defaults when a workspace never set any', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    expect(DEFAULT_PREFERENCES).toEqual({ profileId: 'balanced', demoMode: false, showTechnicalNames: false, singleKeyShortcuts: true });
    expect(await store.getPreferences(ws.id)).toEqual({ profileId: 'balanced', demoMode: false, showTechnicalNames: false, singleKeyShortcuts: true });
  });

  it('patches only the fields given, keeping the rest', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    expect(await store.setPreferences(ws.id, { demoMode: true })).toEqual({ profileId: 'balanced', demoMode: true, showTechnicalNames: false, singleKeyShortcuts: true });
    expect(await store.setPreferences(ws.id, { profileId: 'best', showTechnicalNames: true })).toEqual({ profileId: 'best', demoMode: true, showTechnicalNames: true, singleKeyShortcuts: true });
    expect(await store.setPreferences(ws.id, { demoMode: false, profileId: undefined })).toEqual({ profileId: 'best', demoMode: false, showTechnicalNames: true, singleKeyShortcuts: true });
    expect(await store.setPreferences(ws.id, {})).toEqual({ profileId: 'best', demoMode: false, showTechnicalNames: true, singleKeyShortcuts: true });
    expect(await store.getPreferences(ws.id)).toEqual({ profileId: 'best', demoMode: false, showTechnicalNames: true, singleKeyShortcuts: true });
  });

  it('keeps preferences per workspace and across store instances', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const ws = await a.ensureDefaultWorkspace();
    await a.setPreferences(ws.id, { showTechnicalNames: true });
    a.close();
    const b = openStore({ dataDir });
    expect(await b.getPreferences(ws.id)).toEqual({ ...DEFAULT_PREFERENCES, showTechnicalNames: true });
  });

  it('keeps the single-key shortcuts switch, which a browser at byway’s next address could not (B-188)', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const ws = await a.ensureDefaultWorkspace();
    expect((await a.setPreferences(ws.id, { singleKeyShortcuts: false })).singleKeyShortcuts).toBe(false);
    a.close();
    const b = openStore({ dataDir });
    expect(await b.getPreferences(ws.id)).toEqual({ ...DEFAULT_PREFERENCES, singleKeyShortcuts: false });
    await expect(b.setPreferences(ws.id, { singleKeyShortcuts: 'off' as never })).rejects.toThrow(/singleKeyShortcuts/);
  });

  it('refuses an unknown workspace, unknown keys and values of the wrong type', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    await expect(store.getPreferences('nope')).rejects.toMatchObject({ code: 'not-found' });
    await expect(store.setPreferences('nope', { demoMode: true })).rejects.toMatchObject({ code: 'not-found' });
    await expect(store.setPreferences(ws.id, { theme: 'dark' } as never)).rejects.toThrow(/may only change profileId, demoMode, showTechnicalNames, singleKeyShortcuts; got theme/);
    await expect(store.setPreferences(ws.id, { demoMode: 'yes' as never })).rejects.toThrow(/demoMode/);
    await expect(store.setPreferences(ws.id, { showTechnicalNames: 1 as never })).rejects.toThrow(/showTechnicalNames/);
    await expect(store.setPreferences(ws.id, { profileId: ' ' })).rejects.toThrow(/profileId/);
    await expect(store.setPreferences(ws.id, null as never)).rejects.toMatchObject({ code: 'invalid' });
    expect(await store.getPreferences(ws.id)).toEqual(DEFAULT_PREFERENCES);
  });
});
