/**
 * The local engine for `pnpm dev` and `pnpm demo` (spec §2 process model): a persistent Temporal dev server
 * (`<dataDir>/temporal.sqlite`, port 7233) and the runner worker, in this process, plus a Runner client for the app.
 *
 * The engine owns its Temporal server outright. It refuses a port something already listens on (OPS-1): the CLI would
 * fail to bind and the SDK would still connect to whatever answers there (another `temporal server start-dev`, or a
 * server left over from an earlier byway that was killed), putting runs in a database that is not this one. It runs a
 * CLI binary only this user can have put there (SEC-7) with the HTTP API switched off (SEC-2). And before the worker
 * polls, runs left by an older workflow bundle are retired (C7), so they fail plainly instead of hanging, and the store
 * and the engine are brought to agree in both directions (OPS-1, R4; settleBeforePolling). While it runs, that lost-run
 * pass is repeated every few minutes (reconcileWhilePolling), so a run whose workflow Temporal closed meanwhile fails
 * plainly then, not at the next start.
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
  /**
   * Where the engine says, while it runs, what its repeated lost-run pass ended, or that the pass could not run; as the
   * lines byway prints under "engine" at start. Defaults to console.warn.
   */
  warn?: (message: string) => void;
  /** How the lost-run pass is repeated while the engine runs; repeatEvery by default. For tests, which run it themselves. */
  repeat?: typeof repeatEvery;
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
  /** Only from the pass repeated while the engine runs: workflows whose task kept failing, stopped, their runs failed. */
  stuck?: string[];
}

/**
 * What the engine ended at start, as the lines byway prints under "engine"; none when it ended nothing. The pass the
 * engine repeats while it runs says what it ended in the same words (with no runs retired).
 */
export function engineStartLines(report: EngineStartReport): string[] {
  const runs = (n: number) => `${n} ${n === 1 ? 'run' : 'runs'}`;
  return [
    ...(report.retired.length > 0 ? [`ended ${runs(report.retired.length)} started by an older version of byway, which cannot continue`] : []),
    ...(report.lost.length > 0 ? [`ended ${runs(report.lost.length)} the engine no longer has, which cannot continue`] : []),
    ...(report.orphaned.length > 0 ? [`stopped ${runs(report.orphaned.length)} that byway's records do not have (the data directory was probably restored from an older backup)`] : []),
    ...(report.stuck?.length ? [`ended ${runs(report.stuck.length)} whose next step the engine failed to take each time it tried, which cannot continue`] : []),
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
 * directions, except that a queued run Temporal has no workflow for is left alone, because the app may be starting it
 * (Runner.start writes the run before its workflow). A run whose workflow Temporal closed without byway closing it, at
 * one of Temporal's limits or from outside, is then failed plainly within minutes instead of reading "running" until
 * byway next starts, and so is a run whose workflow Temporal keeps running while its workflow task keeps failing, whose
 * workflow is stopped (whilePolling in lost-runs.ts). Runs from
 * another workflow bundle are not looked for again: the worker retired them all at start, and it starts runs under its
 * own bundle only. Exported so the tests run it directly, without waiting for its timer.
 */
export async function reconcileWhilePolling(client: Client, worker: RunnerWorker, store: Store): Promise<Reconciled> {
  return reconcileLostRuns(client, store, [(await store.ensureDefaultWorkspace()).id], { taskQueue: worker.taskQueue, whilePolling: true });
}

/**
 * How often the engine runs reconcileWhilePolling while it runs. Block 2's design says "every few minutes"; five is
 * Claude's reading of it. The pass is a listing of the queue's open workflows and one look at Temporal per going run.
 */
export const RECONCILE_EVERY_MS = 5 * 60_000;

/** A pass repeated while the engine runs (repeatEvery). */
export interface Repeating {
  /** No pass starts after this. One under way is let finish, and this resolves once it has. */
  stop(): Promise<void>;
}

/**
 * Runs `pass` every `everyMs` until stopped. The next pass is timed from the end of the last, so two never overlap: one
 * that takes longer than the interval delays the next instead of piling up behind it. A pass that fails (throws or
 * rejects) is handed to `onError` and the next runs as usual, so nothing a pass meets stops the engine; an onError that
 * throws is ignored for the same reason. The timer does not keep the process alive.
 */
export function repeatEvery(everyMs: number, pass: () => Promise<void>, onError: (e: unknown) => void): Repeating {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let underWay: Promise<void> | undefined;
  const once = async () => {
    try {
      await pass();
    } catch (e) {
      try {
        onError(e);
      } catch {
        // Saying so is best effort: the pass is tried again either way.
      }
    }
    underWay = undefined;
    if (!stopped) next();
  };
  const next = () => {
    timer = setTimeout(() => {
      underWay = once();
    }, everyMs);
    timer.unref?.();
  };
  next();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await underWay;
    },
  };
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

/**
 * Whether a failed start is Temporal's own wait running out: its core gives the dev server 5 s to answer (a fixed wait in
 * @temporalio/core-bridge 1.24.0, which the SDK's options do not set) and, when it says so, has already killed and
 * awaited the server. A server that could not bind its port ends the same way.
 */
export const startedTooSlowly = (e: unknown): boolean => e instanceof Error && /did not start within/.test(e.message);

/**
 * Starts Temporal's dev server with `start`, and once more when it missed Temporal's 5 s (startedTooSlowly), after
 * `beforeRetry` has made sure the first is gone (the owner's "Retry once, tests and byway's start, on the follow-up
 * branch (Recommended)", 2026-10-23 10:10; backlog row B-117). Any other failure, or a second miss, is thrown as it came.
 * Used by byway's own engine start and by the runner tests' harness.
 */
export async function startOnceMore<T>(start: () => Promise<T>, beforeRetry: () => Promise<void> = async () => undefined): Promise<T> {
  try {
    return await start();
  } catch (e) {
    if (!startedTooSlowly(e)) throw e;
    await beforeRetry();
    return start();
  }
}

export async function startDevEngine(opts: DevEngineOptions): Promise<DevEngine> {
  const port = opts.port ?? Number(DEFAULT_TEMPORAL_ADDRESS.split(':')[1]);
  await assertPortFree(port);
  const cacheDir = path.join(opts.dataDir, TEMPORAL_BIN_DIR);
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const dbFilename = path.join(opts.dataDir, TEMPORAL_DB_FILENAME);
  // The port is byway's own (OPS-1), so the second start uses it too, once nothing listens there: the first server is gone.
  const env = await startOnceMore(
    () =>
      TestWorkflowEnvironment.createLocal({
        server: {
          dbFilename,
          port,
          ip: '127.0.0.1',
          executable: temporalExecutable({ cacheDir, tmpDir: tmpdir(), version: sdkVersion() }),
          extraArgs: devServerArgs(opts.httpPort !== undefined ? { httpPort: opts.httpPort } : {}),
        },
      }),
    () => assertPortFree(port),
  );
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
    // The lost-run pass again every few minutes while the worker polls, leaving alone queued runs with no workflow yet;
    // what it ends, or why it could not run, is said, and never stops the engine.
    const warn = opts.warn ?? ((message: string) => console.warn(message));
    const whileRunning = (opts.repeat ?? repeatEvery)(
      RECONCILE_EVERY_MS,
      async () => {
        const { lost, orphaned, stuck } = await reconcileWhilePolling(env.client, worker, opts.store);
        for (const line of engineStartLines({ retired: [], lost, orphaned, stuck })) warn(`  engine     ${line}`);
      },
      (e) => warn(`  engine     could not look for runs the engine no longer has (${e instanceof Error ? e.message : String(e)}); it looks again in ${RECONCILE_EVERY_MS / 60_000} minutes`),
    );
    return {
      address: env.address,
      runner,
      client: env.client,
      worker,
      atStart,
      async stop() {
        // The repeated pass stops first, and one under way is let finish, so it never meets a worker or a server that
        // has stopped. The Temporal server is stopped even if the worker did not stop cleanly: a server left running
        // would hold the port and this data directory's database (OPS-1).
        try {
          await whileRunning.stop();
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
