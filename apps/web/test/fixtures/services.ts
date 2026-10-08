/**
 * The app's real services for tests: the service host on a temp data directory, with the gateway's mock provider
 * (demo mode, no keys, no network), the real prompts and advisor, and the fake Runner in place of the Temporal client.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Runner, Store } from '@byway/contracts';
import * as advisor from '@byway/advisor';
import * as catalog from '@byway/catalog';
import * as gateway from '@byway/gateway';
import * as prompts from '@byway/prompts';
import * as runner from '@byway/runner/client';
import * as store from '@byway/store';
import { createServiceHost, type ServiceHost } from '../../src/services/create.ts';
import type { EngineModules } from '../../src/services/engine.ts';
import { fakeRunner, type FakeRunner } from './runner.ts';

/** The engine packages, imported statically (the app loads the same modules at run time). */
export const ENGINE: EngineModules = { advisor, catalog, gateway, prompts, runner, store };

export interface TestHost {
  host: ServiceHost;
  dataDir: string;
  /** The fake Runner the host connected to (undefined until the first runner call). */
  runner(): FakeRunner | undefined;
  dispose(): Promise<void>;
}

export function testHost(opts: { demo?: boolean; env?: Record<string, string | undefined>; connect?: (store: Store) => Promise<Runner> } = {}): TestHost {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'byway-web-'));
  let fake: FakeRunner | undefined;
  const host = createServiceHost(ENGINE, {
    dataDir,
    demo: opts.demo ?? true,
    temporalAddress: '127.0.0.1:1',
    env: opts.env ?? {},
    connect:
      opts.connect ??
      (async (store) => {
        fake ??= fakeRunner(store);
        return fake;
      }),
  });
  return {
    host,
    dataDir,
    runner: () => fake,
    async dispose() {
      await host.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** A 1×1 PNG, for "examples you admire" uploads. */
export const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
