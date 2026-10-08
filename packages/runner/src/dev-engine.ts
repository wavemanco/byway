/**
 * The local engine for `pnpm dev` and `pnpm demo` (spec §2 process model): a persistent Temporal dev server
 * (`<dataDir>/temporal.sqlite`, port 7233) and the runner worker, in this process, plus a Runner client for the app.
 */
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Client } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { DEFAULT_TEMPORAL_ADDRESS, type Gateway, type PromptRenderer, type Runner, type Store } from '@byway/contracts';
import { createRunnerClient } from './client.ts';
import type { PageRenderer } from './pages.ts';
import { createWorker, type RunnerWorker } from './worker.ts';

/** The dev server's database inside the product data directory (spec §2 "Data"). */
export const TEMPORAL_DB_FILENAME = 'temporal.sqlite';

/**
 * The Temporal CLI the SDK already downloaded, if it is in the system temp folder: using it by path means starting the
 * engine never reaches the network once it has run before.
 */
export function cachedTemporalExecutable(): { type: 'existing-path'; path: string } | undefined {
  try {
    const version = (createRequire(import.meta.url)('@temporalio/testing/package.json') as { version: string }).version;
    const file = path.join(tmpdir(), `temporal-sdk-typescript-${version}${process.platform === 'win32' ? '.exe' : ''}`);
    return existsSync(file) ? { type: 'existing-path', path: file } : undefined;
  } catch {
    return undefined;
  }
}

export interface DevEngineOptions {
  dataDir: string;
  gateway: Gateway;
  store: Store;
  /** The prompt templates; defaults to @byway/prompts. */
  prompts?: PromptRenderer;
  /** Defaults to 7233 (DEFAULT_TEMPORAL_ADDRESS). */
  port?: number;
  pages?: PageRenderer;
}

export interface DevEngine {
  /** host:port of the dev server. */
  address: string;
  runner: Runner;
  client: Client;
  worker: RunnerWorker;
  stop(): Promise<void>;
}

export async function startDevEngine(opts: DevEngineOptions): Promise<DevEngine> {
  const executable = cachedTemporalExecutable();
  const env = await TestWorkflowEnvironment.createLocal({
    server: {
      dbFilename: path.join(opts.dataDir, TEMPORAL_DB_FILENAME),
      port: opts.port ?? Number(DEFAULT_TEMPORAL_ADDRESS.split(':')[1]),
      ip: '127.0.0.1',
      ...(executable ? { executable } : {}),
    },
  });
  try {
    const worker = await createWorker({ connection: env.nativeConnection, namespace: env.namespace ?? 'default', gateway: opts.gateway, store: opts.store, ...(opts.prompts ? { prompts: opts.prompts } : {}), ...(opts.pages ? { pages: opts.pages } : {}) });
    const running = worker.run();
    const runner = createRunnerClient({ client: env.client, store: opts.store });
    return {
      address: env.address,
      runner,
      client: env.client,
      worker,
      async stop() {
        await worker.shutdown();
        await running.catch(() => undefined);
        await env.teardown();
      },
    };
  } catch (e) {
    await env.teardown();
    throw e;
  }
}

/** A Runner for another process (the web app) talking to a running engine; defined in the client entry. */
export { connectRunner, type ConnectedRunner } from './client-entry.ts';
