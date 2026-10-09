/**
 * The web process closes its services when byway stops (follow-up (f); ADR-0099, closing ADR-0095 decision 5's
 * residual). Its gateways admit recommending and composing calls in the spend book; nothing closed them on a stop, so a
 * call in flight then counted as under way until its 60 s lease ran out, as a crashed process's would. Now the stop path
 * (byway's 'stop' over the IPC channel scripts/serve.ts opens to `next start`, or scripts/dev-web.ts's own stop) closes
 * the service host: its gateways hand their calls back at once, and the store closes.
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompletionRequest } from '@byway/contracts';
import { createGateway, type GatewayOptions, type ProviderAdapter } from '@byway/gateway';
import { createStore } from '@byway/store';
import { createServiceHost, type ServiceHost } from '../src/services/create.ts';
import type { EngineModules } from '../src/services/engine.ts';
import { closeServices, SERVICES_KEY, stopOnRequest, STOPPER_KEY, stopping } from '../src/services/shutdown.ts';
import { ENGINE } from './fixtures/services.ts';
import { fakeRunner } from './fixtures/runner.ts';

const KEY_ENV = { ANTHROPIC_API_KEY: 'sk-ant-test-0000-never-real' };

const temps: string[] = [];
const hosts: ServiceHost[] = [];
afterEach(async () => {
  for (const h of hosts.splice(0)) await h.close().catch(() => undefined);
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A provider that never answers: a recommending call stays in flight. */
function hanging() {
  let sent = 0;
  const adapter = {
    id: 'anthropic',
    async complete() {
      sent += 1;
      await new Promise(() => undefined);
    },
  } as unknown as ProviderAdapter;
  return { adapter, sent: () => sent };
}

/** The real service host, with the Anthropic adapter replaced by one that never answers. */
function hostWithHangingProvider(adapter: ProviderAdapter): { host: ServiceHost; dataDir: string } {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'byway-web-stop-'));
  temps.push(dataDir);
  const engine: EngineModules = { ...ENGINE, gateway: { ...ENGINE.gateway, createGateway: (o: GatewayOptions) => createGateway({ ...o, adapters: { anthropic: adapter } }) } };
  const host = createServiceHost(engine, { dataDir, demo: false, temporalAddress: '127.0.0.1:1', env: { ...KEY_ENV }, connect: async (s) => fakeRunner(s) });
  hosts.push(host);
  return { host, dataDir };
}

const intake: Omit<CompletionRequest, 'workspaceId'> = {
  purpose: 'advisor.intake',
  profileId: 'balanced',
  tier: 'mid',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'A memo for the board.' }] }],
  maxOutputTokens: 1000,
};

const until = async (cond: () => boolean) => {
  const end = Date.now() + 5000;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** A process as stopOnRequest sees it: an IPC channel byway sends 'stop' over, and exit. */
function fakeProcess(withChannel = true) {
  const proc = Object.assign(new EventEmitter(), {
    exited: [] as number[],
    exit(code: number) {
      proc.exited.push(code);
    },
    ...(withChannel ? { send: () => true } : {}),
  });
  return proc;
}

describe('the web process closes its services when byway stops (follow-up (f))', () => {
  it('hands a recommending call in flight back at once on byway’s stop: it counts as may have been billed, not as under way for a minute', async () => {
    const provider = hanging();
    const { host, dataDir } = hostWithHangingProvider(provider.adapter);
    const holder: Record<symbol, unknown> = { [SERVICES_KEY]: Promise.resolve(host) };
    const workspaceId = (await host.store.ensureDefaultWorkspace()).id;
    void host.services(false).gateway.complete({ ...intake, workspaceId }).catch(() => undefined);
    await until(() => provider.sent() === 1);

    const proc = fakeProcess();
    stopOnRequest(proc, holder);
    proc.emit('message', 'stop');
    await until(() => proc.exited.length > 0);
    expect(proc.exited).toEqual([0]);
    expect(stopping(holder)).toBe(true);

    // Another process on the data directory (the worker) sees it at once: no time has passed.
    const other = createStore({ dataDir });
    try {
      const spend = await other.spendBook.spend(workspaceId);
      expect(spend.inFlightUsd).toBe(0);
      expect(spend.uncertainUsd).toBeGreaterThan(0);
      expect((await other.spendBook.records(workspaceId)).uncertain).toEqual([expect.objectContaining({ purpose: 'advisor.intake', reason: 'interrupted' })]);
    } finally {
      other.close();
    }
  });

  it('stops the same way when byway goes away (the channel closes), and only once', async () => {
    const { host } = hostWithHangingProvider(hanging().adapter);
    let closes = 0;
    const counted = { ...host, close: async () => void (closes += 1, await host.close()) };
    const holder: Record<symbol, unknown> = { [SERVICES_KEY]: Promise.resolve(counted) };
    const proc = fakeProcess();
    stopOnRequest(proc, holder);
    proc.emit('disconnect');
    proc.emit('message', 'stop');
    await until(() => proc.exited.length > 0);
    await closeServices(holder);
    expect(closes).toBe(1);
  });

  it('leaves the stop to whoever already owns it (scripts/dev-web.ts in contributor mode), and does nothing without a channel (next start run by hand)', () => {
    const owned = fakeProcess();
    stopOnRequest(owned, { [STOPPER_KEY]: 'dev-web' });
    expect(owned.listenerCount('message')).toBe(0);
    const unattached = fakeProcess(false);
    stopOnRequest(unattached, {});
    expect(unattached.listenerCount('message')).toBe(0);
  });

  it('closes nothing when no services were opened, or when they failed to open, and never throws', async () => {
    await expect(closeServices({})).resolves.toBeUndefined();
    const failed = Promise.reject(new Error('the data directory is in a git repository'));
    failed.catch(() => undefined);
    await expect(closeServices({ [SERVICES_KEY]: failed })).resolves.toBeUndefined();
  });
});
