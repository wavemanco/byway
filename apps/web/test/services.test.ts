import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TEMPORAL_ADDRESS, type ModelProfile, type ProfileStatus, type Runner } from '@byway/contracts';
import { questionsSlot } from '@byway/advisor';
import { CHOOSER } from '@byway/catalog';
import { createPromptRenderer } from '@byway/prompts';
import { DEMO_PROFILE_ID as GATEWAY_DEMO_PROFILE_ID } from '@byway/gateway';
import { resolveDataDir } from '@byway/store';
import { DEMO_PROFILE_ID, effectiveMode, findRepoRoot, flagOn, liveUsable, runProfileId, servicesConfig } from '../src/services/config.ts';
import { loadEngine } from '../src/services/engine.ts';
import { LEDGER_FILENAME } from '../src/services/create.ts';
import { EngineUnavailableError, engineRunner, isEngineUnavailable, isTransportFailure } from '../src/services/engine-runner.ts';
import { ENGINE, testHost, type TestHost } from './fixtures/services.ts';

const temp: string[] = [];
let current: TestHost | undefined;
afterEach(async () => {
  await current?.dispose();
  current = undefined;
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-cfg-'));
  temp.push(dir);
  return dir;
};

const status = (id: string, usable: boolean): ProfileStatus => ({
  profile: { id, label: id, tiers: { big: { provider: 'mock', model: 'b' }, mid: { provider: 'mock', model: 'm' } } } as ModelProfile,
  usable,
  missing: usable ? [] : ['anthropic'],
  images: false,
  video: false,
  otherFamily: false,
});

/** Sentinel values: tests never hold real keys, and these must never surface anywhere the browser could see. */
const FAKE_KEYS = { ANTHROPIC_API_KEY: 'sk-ant-test-0000-never-real', FAL_KEY: 'fal-test-0000-never-real' };

describe('services config (spec §2 process model)', () => {
  it('reads the data directory, the demo flag and the engine address from the environment', () => {
    const dataDir = tempDir();
    const root = tempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
    const config = servicesConfig({ BYWAY_DATA_DIR: dataDir, BYWAY_DEMO: '1', BYWAY_TEMPORAL_ADDRESS: '127.0.0.1:7299' }, path.join(root, 'apps', 'web'), resolveDataDir);
    expect(config).toEqual({ dataDir: path.resolve(dataDir), demo: true, temporalAddress: '127.0.0.1:7299', envFile: path.join(root, '.env.agents') });
    expect(servicesConfig({ BYWAY_DATA_DIR: dataDir }, dataDir, resolveDataDir)).toMatchObject({ demo: false, temporalAddress: DEFAULT_TEMPORAL_ADDRESS });
    expect(servicesConfig({ BYWAY_DATA_DIR: dataDir }, dataDir, resolveDataDir).envFile).toBeUndefined();
  });

  it('refuses a data directory inside a git working tree', () => {
    const repo = tempDir();
    mkdirSync(path.join(repo, '.git'));
    expect(() => servicesConfig({ BYWAY_DATA_DIR: path.join(repo, 'data') }, repo, resolveDataDir)).toThrow(/git repository/);
  });

  it('finds the repo root by its workspace file', () => {
    const root = tempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), '');
    mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    expect(findRepoRoot(path.join(root, 'a', 'b'))).toBe(path.resolve(root));
  });

  it('names the demo profile as the gateway does', () => {
    expect(DEMO_PROFILE_ID).toBe(GATEWAY_DEMO_PROFILE_ID);
  });

  it('turns flags on only for 1 or true', () => {
    expect(['1', 'true', 'TRUE', ' 1 '].map(flagOn)).toEqual([true, true, true, true]);
    expect(['0', 'false', '', undefined, 'yes'].map(flagOn)).toEqual([false, false, false, false, false]);
  });

  it('is in demo mode when forced, switched on, or when no real profile has keys', () => {
    const live = [status('demo', true), status('balanced', true)];
    const none = [status('demo', true), status('balanced', false)];
    expect(liveUsable(live)).toBe(true);
    expect(liveUsable(none)).toBe(false);
    expect(effectiveMode({ forced: false, preference: false, statuses: live })).toBe('live');
    expect(effectiveMode({ forced: true, preference: false, statuses: live })).toBe('demo');
    expect(effectiveMode({ forced: false, preference: true, statuses: live })).toBe('demo');
    expect(effectiveMode({ forced: false, preference: false, statuses: none })).toBe('demo');
  });

  it('runs and estimates on the demo profile in demo mode, else on the chosen usable profile', () => {
    const statuses = [status('balanced', false), status('openai', true), status('demo', true)];
    expect(runProfileId('demo', 'balanced', statuses)).toBe('demo');
    expect(runProfileId('live', 'openai', statuses)).toBe('openai');
    // The chosen profile has no keys: the first usable real one stands in.
    expect(runProfileId('live', 'balanced', statuses)).toBe('openai');
    expect(runProfileId('live', 'balanced', [status('balanced', false), status('demo', true)])).toBe('demo');
  });
});

describe('the engine Runner (the web process is only a Temporal client)', () => {
  it('connects on first use, retries after a failed connection, and reads views from the store without the engine', async () => {
    current = testHost();
    const { store } = current.host;
    let attempts = 0;
    const real = { start: async () => ({ id: 'r' }) } as unknown as Runner;
    const runner = engineRunner(store, async () => {
      attempts++;
      if (attempts === 1) throw new Error('connect ECONNREFUSED 127.0.0.1:1');
      return real;
    });
    expect(attempts).toBe(0);
    await expect(runner.pause('x')).rejects.toBeInstanceOf(EngineUnavailableError);
    await expect(runner.pause('x')).rejects.toThrow(/is not a function|pause/);
    expect(attempts).toBe(2);

    const ws = await store.ensureDefaultWorkspace();
    await store.createRun({ id: 'run-1', workspaceId: ws.id, recipeId: 'c4', recipeHash: 'h', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 1 });
    await store.appendEvent({ runId: 'run-1', type: 'run-started', data: { recipeId: 'c4', profileId: 'demo', budgetUsd: 1 } });
    const view = await engineRunner(store, () => Promise.reject(new Error('down'))).view('run-1');
    expect(view.run.id).toBe('run-1');
    expect(view.events.map((e) => e.type)).toEqual(['run-started']);
    await expect(runner.view('missing')).rejects.toThrow(/no run/);
  });

  it('turns an engine that stopped after connecting into the same plain 503, and reconnects next time (OPS-2)', async () => {
    current = testHost();
    const { store } = current.host;
    let connects = 0;
    let down = true;
    // What the Temporal client throws when its server has gone: a gRPC ServiceError with code 14 (UNAVAILABLE).
    const unavailable = Object.assign(new Error('Failed to start Workflow'), {
      name: 'ServiceError',
      cause: Object.assign(new Error('14 UNAVAILABLE: No connection established. Last error: connect ECONNREFUSED 127.0.0.1:7405'), { code: 14 }),
    });
    const real = {
      start: async () => {
        if (down) throw unavailable;
        return { id: 'r' };
      },
      resolve: async () => {
        throw Object.assign(new Error('Workflow Update failed'), { name: 'WorkflowUpdateFailedError', cause: Object.assign(new Error('deadline'), { code: 4 }) });
      },
      pause: async () => {
        throw new Error('This run has already ended.');
      },
    } as unknown as Runner;
    const runner = engineRunner(store, async () => {
      connects++;
      return real;
    });
    await expect(runner.start({} as never)).rejects.toBeInstanceOf(EngineUnavailableError);
    await expect(runner.resolve({ checkpointId: 'c' })).rejects.toBeInstanceOf(EngineUnavailableError);
    // An error that is not about the connection stays what it was.
    await expect(runner.pause('x')).rejects.toThrow('This run has already ended.');
    // Each transport failure dropped the cached connection, so the next call connects again.
    expect(connects).toBe(3);
    down = false;
    await expect(runner.start({} as never)).resolves.toEqual({ id: 'r' });
  });

  it('recognises transport failures anywhere in the cause chain, and nothing else', () => {
    expect(isTransportFailure(Object.assign(new Error('x'), { code: 14 }))).toBe(true);
    expect(isTransportFailure(new Error('outer', { cause: new Error('connect ECONNREFUSED 127.0.0.1:7233') }))).toBe(true);
    expect(isTransportFailure(Object.assign(new Error('x'), { code: 4 }))).toBe(true);
    expect(isTransportFailure(Object.assign(new Error('That answer was not accepted.'), { code: 3 }))).toBe(false);
    expect(isTransportFailure('ECONNREFUSED')).toBe(false);
  });

  it('says plainly that the engine stopped or did not answer, and how to bring it back, and is recognised across server bundles', () => {
    // A timeout (gRPC 4) is one of its causes, and an engine that answers slowly may still have done what it was asked,
    // so the words do not say only that it is not running (B1, ADR-0107).
    expect(new EngineUnavailableError(new Error('x')).message).toBe('byway’s run engine is not running, or did not answer in time. Restart byway (pnpm start), then try again.');
    // Another bundle's copy of the class: same name, different constructor.
    const other = Object.assign(new Error('elsewhere'), { name: 'EngineUnavailableError' });
    expect(isEngineUnavailable(other)).toBe(true);
    expect(isEngineUnavailable(new Error('x'))).toBe(false);
    expect(isEngineUnavailable('EngineUnavailableError')).toBe(false);
  });
});

describe('prompts for the advisor', () => {
  it('fence the chooser questions once: the advisor passes bare JSON and the template fences it', () => {
    const out = createPromptRenderer().render('advisor.intake', { problem: 'A memo for my team.', questions: questionsSlot(CHOOSER) });
    expect(out.user).not.toMatch(/```json\s*\n```/);
    expect(out.user).toContain(CHOOSER[0]!.id);
  });
});

describe('the engine packages', () => {
  it('load at run time as the modules the app is built against, with only the runner client entry', async () => {
    const engine = await loadEngine();
    expect(engine.store.createStore).toBe(ENGINE.store.createStore);
    expect(engine.prompts.createPromptRenderer).toBe(ENGINE.prompts.createPromptRenderer);
    expect(Object.keys(engine.runner)).not.toContain('createWorker');
    expect(Object.keys(engine.runner)).not.toContain('startDevEngine');
    expect(typeof engine.runner.connectRunner).toBe('function');
  });
});

describe('the service host', () => {
  it('opens the store and the ledger in the data directory and recommends through the mock in demo mode', async () => {
    current = testHost({ demo: true });
    const services = current.host.services(false);
    expect(services.mode).toBe('demo');
    const ws = await services.store.ensureDefaultWorkspace();
    const rec = await services.advisor.recommend({ text: 'A landing page for my pottery studio' }, { workspaceId: ws.id, profileId: 'demo' });
    expect(rec.recipeId).toBe('c1');
    expect(rec.estimate.highUsd).toBe(0);
    expect(existsSync(path.join(current.dataDir, 'byway.sqlite'))).toBe(true);
    expect(existsSync(path.join(current.dataDir, LEDGER_FILENAME))).toBe(true);
    expect(await services.gateway.verifyLedger()).toBeNull();
    expect((await services.gateway.spend(ws.id)).spentUsd).toBe(0);
  });

  it('forces the mock when demo mode is switched on, and uses real profiles when keys exist and it is off', async () => {
    current = testHost({ demo: false, env: { ...FAKE_KEYS } });
    const live = current.host.services(false);
    expect(live.mode).toBe('live');
    expect(live.gateway.profiles().map((p) => p.id)).toContain('balanced');
    const demo = current.host.services(true);
    expect(demo.mode).toBe('demo');
    expect(demo.gateway.profiles().map((p) => p.id)).toEqual(['demo']);
    // One gateway per setting, reused.
    expect(current.host.services(true).gateway).toBe(demo.gateway);
  });

  it('gives both of its gateways the store’s spend book, the one the worker shares, and closes them before the store (ADR-0095)', async () => {
    current = testHost({ demo: false, env: { ...FAKE_KEYS } });
    const live = current.host.services(false);
    const demo = current.host.services(true);
    const ws = await live.store.ensureDefaultWorkspace();
    // A call in flight elsewhere (the worker), admitted in the store's book: both gateways see it.
    await live.store.spendBook.admit({ opId: 'worker-call', owner: 'worker', leaseMs: 60_000, workspaceId: ws.id, purpose: 'build:prose', kind: 'completion', provider: 'anthropic', model: 'claude-opus-5-5', reserveUsd: 0.75, paid: true, caps: { workspaceUsd: 100 } });
    expect((await live.gateway.spend(ws.id)).inFlightUsd).toBe(0.75);
    expect((await demo.gateway.spend(ws.id)).inFlightUsd).toBe(0.75);
    const closed: string[] = [];
    for (const g of [live.gateway, demo.gateway]) {
      const close = g.close.bind(g);
      g.close = async () => {
        // The store must still be open while the gateway writes what is left of its outbox.
        closed.push(await live.store.spendBook.spend(ws.id).then(() => 'closed with the store open', () => 'closed after the store'));
        await close();
      };
    }
    await current.host.close();
    expect(closed).toEqual(['closed with the store open', 'closed with the store open']);
    await expect(live.store.spendBook.spend(ws.id)).rejects.toMatchObject({ code: 'closed' });
  });

  it('is in demo mode with no keys, and reports providers without their keys', async () => {
    current = testHost({ demo: false, env: { FAL_KEY: FAKE_KEYS.FAL_KEY } });
    const services = current.host.services(false);
    expect(services.mode).toBe('demo');
    const shown = JSON.stringify([services.gateway.providers(), services.gateway.profileStatus()]);
    expect(shown).not.toContain(FAKE_KEYS.FAL_KEY);
    expect(services.gateway.providers().find((p) => p.provider === 'fal')?.configured).toBe(true);
  });

  it('loads keys from the env file without overriding the environment', async () => {
    const dir = tempDir();
    const file = path.join(dir, '.env.agents');
    writeFileSync(file, `ANTHROPIC_API_KEY=${FAKE_KEYS.ANTHROPIC_API_KEY}\nFAL_KEY=from-file\n`);
    const env: Record<string, string | undefined> = { FAL_KEY: FAKE_KEYS.FAL_KEY };
    const { createServiceHost } = await import('../src/services/create.ts');
    const host = createServiceHost(ENGINE, { dataDir: tempDir(), demo: false, temporalAddress: '127.0.0.1:1', env, envFile: file, connect: async () => ({}) as Runner });
    try {
      expect(env.ANTHROPIC_API_KEY).toBe(FAKE_KEYS.ANTHROPIC_API_KEY);
      expect(env.FAL_KEY).toBe(FAKE_KEYS.FAL_KEY);
      expect(host.services(false).mode).toBe('live');
    } finally {
      await host.close();
    }
  });

  it('finds a held provider key anywhere in a request body, a FAL_KEY by its secret half alone, naming only the variable (ADR-0088)', async () => {
    const anthropic = 'sk-ant-test-0000-never-real-0000';
    const falSecret = '0011223344556677never-real-secret';
    current = testHost({ env: { ANTHROPIC_API_KEY: anthropic, FAL_KEY: `fal-test-key-id-never-real:${falSecret}` } });
    expect(current.host.heldKeyIn({ text: `my key is ${anthropic}` })).toBe('ANTHROPIC_API_KEY');
    expect(current.host.heldKeyIn({ routes: { [falSecret]: 'yes' } })).toBe('FAL_KEY');
    expect(current.host.heldKeyIn({ attachments: [{ name: 'a', text: `x ${falSecret} y` }] })).toBe('FAL_KEY');
    expect(current.host.heldKeyIn({ text: 'A landing page', budgetUsd: 2 })).toBeUndefined();
  });
});
