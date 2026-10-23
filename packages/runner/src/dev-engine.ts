/**
 * The local engine for `pnpm dev` and `pnpm demo` (spec §2 process model): a persistent Temporal dev server
 * (`<dataDir>/temporal.sqlite`, port 7233) and the runner worker, in this process, plus a Runner client for the app.
 *
 * The engine owns its Temporal server outright. It refuses a port something already listens on (OPS-1): the CLI would
 * fail to bind and the SDK would still connect to whatever answers there (another `temporal server start-dev`, or a
 * server left over from an earlier byway that was killed), putting runs in a database that is not this one. It runs a
 * CLI binary only this user can have put there (SEC-7) with the HTTP API switched off (SEC-2). And before the worker
 * polls, runs left by an older workflow bundle are retired (C7), so they fail plainly instead of hanging, and the store
 * and the engine are brought to agree in both directions (OPS-1, R4; settleBeforePolling).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Client } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { DEFAULT_TEMPORAL_ADDRESS, type Gateway, type PromptRenderer, type Runner, type Store } from '@byway/contracts';
import { createRunnerClient } from './client.ts';
import { reconcileLostRuns, type Reconciled } from './lost-runs.ts';
import type { PageRenderer } from './pages.ts';
import { cliFileName, devServerArgs, fileFacts, temporalExecutable, trustedBinary } from './temporal-cli.ts';
import { createWorker, type RunnerWorker } from './worker.ts';

/** The dev server's database inside the product data directory (spec §2 "Data"). */
export const TEMPORAL_DB_FILENAME = 'temporal.sqlite';

/** Where the engine keeps its own copy of the Temporal CLI, inside the data directory (a per-user folder). */
export const TEMPORAL_BIN_DIR = 'bin';

const sdkVersion = (): string => (createRequire(import.meta.url)('@temporalio/testing/package.json') as { version: string }).version;

/**
 * The Temporal CLI the SDK already downloaded into the system temp folder, when this user may run it (a regular file
 * owned by this user and writable by nobody else; see temporal-cli.ts): using it by path means starting the engine
 * never reaches the network once it has run before. The test harness uses this too.
 */
export function cachedTemporalExecutable(): { type: 'existing-path'; path: string } | undefined {
  try {
    const file = path.join(tmpdir(), cliFileName(sdkVersion()));
    const facts = fileFacts(file);
    return facts && trustedBinary(facts, process.getuid?.()) ? { type: 'existing-path', path: file } : undefined;
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
  /** Pin the dev server's (closed) HTTP API to this port; by default the CLI picks a random free one. For tests. */
  httpPort?: number;
  /**
   * A workflow bundle built beforehand (buildWorkflows). By default the worker builds dist/workflows.js on every start;
   * a test, or the e2e suite's byway (serve.ts's BYWAY_WORKFLOWS_BUNDLE), passes its own file, so it never shares that
   * one with a byway or another suite building it at the same time.
   */
  workflowsPath?: string;
}

export interface DevEngine {
  /** host:port of the dev server. */
  address: string;
  runner: Runner;
  client: Client;
  worker: RunnerWorker;
  /** What the engine ended at start, before its worker polled; byway prints it. */
  atStart: EngineStartReport;
  stop(): Promise<void>;
}

/** The runs the engine ended at start, before its worker polled, as run ids. */
export interface EngineStartReport {
  /** Started by another workflow bundle, whose history this one cannot replay (C7): failed plainly. */
  retired: string[];
  /** Shown as going by the store, not run by the engine (OPS-1): failed plainly. */
  lost: string[];
  /** Run by the engine, missing from the store (R4: a store older than the engine): their workflows were terminated. */
  orphaned: string[];
}

/** What the engine ended at start, as the lines byway prints under "engine"; none when it ended nothing. */
export function engineStartLines(report: EngineStartReport): string[] {
  const runs = (n: number) => `${n} ${n === 1 ? 'run' : 'runs'}`;
  return [
    ...(report.retired.length > 0 ? [`ended ${runs(report.retired.length)} started by an older version of byway, which cannot continue`] : []),
    ...(report.lost.length > 0 ? [`ended ${runs(report.lost.length)} the engine no longer has, which cannot continue`] : []),
    ...(report.orphaned.length > 0 ? [`stopped ${runs(report.orphaned.length)} that byway's records do not have (the data directory was probably restored from an older backup)`] : []),
  ];
}

/**
 * What the engine does after it connects and before its worker polls: runs another workflow bundle started cannot
 * replay on this one (C7), and the store and the engine are brought to agree in both directions (OPS-1, R4), so a run
 * nobody can move on fails plainly and a workflow whose run the store does not have is stopped before any step of it
 * runs. Exported so that order is tested with a worker that has not polled yet.
 */
export async function settleBeforePolling(client: Client, worker: RunnerWorker, store: Store): Promise<EngineStartReport> {
  const retired = await worker.retireStaleRuns(client);
  const { lost, orphaned } = await reconcileLostRuns(client, store, [(await store.ensureDefaultWorkspace()).id], { taskQueue: worker.taskQueue });
  return { retired, lost, orphaned };
}

/**
 * The lost-run pass the engine repeats while its worker polls (lost-runs.ts): the one it ran at start, in both
 * directions, except that queued runs are left alone, because the app may be starting one (Runner.start writes the run
 * before its workflow). A run whose workflow Temporal closed without byway closing it, at one of Temporal's limits or
 * from outside, is then failed plainly within minutes instead of reading "running" until byway next starts. Runs from
 * another workflow bundle are not looked for again: the worker retired them all at start, and it starts runs under its
 * own bundle only. Exported so the tests run it directly, without waiting for its timer.
 */
export async function reconcileWhilePolling(client: Client, worker: RunnerWorker, store: Store): Promise<Reconciled> {
  return reconcileLostRuns(client, store, [(await store.ensureDefaultWorkspace()).id], { taskQueue: worker.taskQueue, skipQueued: true });
}

/** The plain message for a port that is taken (OPS-1). */
export const portInUseMessage = (port: number): string =>
  `Port ${port} on 127.0.0.1 is already in use, so byway cannot start its engine there. Another Temporal server, or one left over from an earlier byway that did not stop cleanly, may be holding it. Stop that process, or choose another port with BYWAY_TEMPORAL_PORT.`;

/** Resolves when nothing listens on 127.0.0.1:port; rejects with a plain message when something does. */
export function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? new Error(portInUseMessage(port)) : e));
    probe.listen({ port, host: '127.0.0.1', exclusive: true }, () => probe.close(() => resolve()));
  });
}

export async function startDevEngine(opts: DevEngineOptions): Promise<DevEngine> {
  const port = opts.port ?? Number(DEFAULT_TEMPORAL_ADDRESS.split(':')[1]);
  await assertPortFree(port);
  const cacheDir = path.join(opts.dataDir, TEMPORAL_BIN_DIR);
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const dbFilename = path.join(opts.dataDir, TEMPORAL_DB_FILENAME);
  const env = await TestWorkflowEnvironment.createLocal({
    server: {
      dbFilename,
      port,
      ip: '127.0.0.1',
      executable: temporalExecutable({ cacheDir, tmpDir: tmpdir(), version: sdkVersion() }),
      extraArgs: devServerArgs(opts.httpPort !== undefined ? { httpPort: opts.httpPort } : {}),
    },
  });
  try {
    // The server we reached keeps its state in this data directory, so it is the one we started.
    if (!existsSync(dbFilename)) throw new Error(`The Temporal server on port ${port} is not the one byway started (it does not use ${dbFilename}). ${portInUseMessage(port)}`);
    const worker = await createWorker({ connection: env.nativeConnection, namespace: env.namespace ?? 'default', gateway: opts.gateway, store: opts.store, ...(opts.prompts ? { prompts: opts.prompts } : {}), ...(opts.pages ? { pages: opts.pages } : {}), ...(opts.workflowsPath ? { workflowsPath: opts.workflowsPath } : {}) });
    let atStart: EngineStartReport;
    try {
      atStart = await settleBeforePolling(env.client, worker, opts.store);
    } catch (e) {
      await worker.shutdown();
      throw e;
    }
    const running = worker.run();
    const runner = createRunnerClient({ client: env.client, store: opts.store });
    return {
      address: env.address,
      runner,
      client: env.client,
      worker,
      atStart,
      async stop() {
        // The Temporal server is stopped even if the worker did not stop cleanly: a server left running would hold the
        // port and this data directory's database (OPS-1).
        try {
          await worker.shutdown();
          await running.catch(() => undefined);
        } finally {
          await env.teardown();
        }
      },
    };
  } catch (e) {
    await env.teardown();
    throw e;
  }
}

/** A Runner for another process (the web app) talking to a running engine; defined in the client entry. */
export { connectRunner, type ConnectedRunner } from './client-entry.ts';
