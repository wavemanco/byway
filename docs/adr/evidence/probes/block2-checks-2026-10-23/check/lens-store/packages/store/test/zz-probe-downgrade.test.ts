import { describe, expect, it } from 'vitest';
import { createStore as createMainStore } from '../main-src/store.ts';
import { createStore } from '../src/index.ts';
import { tempDir } from './helpers.ts';

describe('probe: main build on a block 2 database', () => {
  it('refuses with a plain message and leaves the file as it was', async () => {
    const dataDir = tempDir();
    const s = createStore({ dataDir });
    const ws = await s.ensureDefaultWorkspace();
    await s.setAnswerWait(ws.id, { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30 });
    s.close();
    let err: unknown;
    try { createMainStore({ dataDir }).close(); } catch (e) { err = e; }
    console.log('PROBE', (err as Error)?.message);
    const again = createStore({ dataDir });
    expect(await again.getAnswerWaits(ws.id)).toMatchObject([{ minutes: 30 }]);
    again.close();
    expect(err).toBeDefined();
  });
});
