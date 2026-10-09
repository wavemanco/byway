/**
 * A harness worker as a process of its own (F03 stage 3; ADR-0099): the runner worker the e2e harness runs, on the
 * harness's data directory, Temporal server and task queue, with the store's spend book. A test kills it outright
 * mid-step (no clean stop, no calls handed back, as a crash or a power cut leaves them) and sees another worker carry
 * the run on.
 *
 * Run by the harness (spawnWorkerProcess) as: node worker-process.ts '<options as JSON>'. Prints "ready" once its worker
 * is polling. Nothing it does leaves this computer: the provider is the mock, or the relay board on 127.0.0.1.
 */
import { DefaultLogger, NativeConnection, Runtime } from '@temporalio/worker';
import { createWorker } from '../../src/worker.ts';
import { fakePages } from './fake-pages.ts';
import { fakePrompts } from './fake-prompts.ts';
import { createTestStore } from './memo.ts';
import { boardAdapter } from './relay-board.ts';
import { testGateways } from './worker-config.ts';

export interface WorkerProcessOptions {
  address: string;
  taskQueue: string;
  dataDir: string;
  workflowsPath: string;
  /** The relay board to make clips through (relay-board.ts), when the test uses one. */
  boardUrl?: string;
  leaseMs?: number;
  renewEveryMs?: number;
}

const options = JSON.parse(process.argv[2] ?? '{}') as WorkerProcessOptions;
Runtime.install({ logger: new DefaultLogger('ERROR') });
const store = createTestStore({ dataDir: options.dataDir });
const { demo } = testGateways({
  dir: options.dataDir,
  store,
  book: 'store',
  ...(options.boardUrl ? { adapters: { mock: boardAdapter(options.boardUrl) } } : {}),
  ...(options.leaseMs !== undefined ? { leaseMs: options.leaseMs } : {}),
  ...(options.renewEveryMs !== undefined ? { renewEveryMs: options.renewEveryMs } : {}),
});
const connection = await NativeConnection.connect({ address: options.address });
let seeds = 0;
const worker = await createWorker({
  connection,
  taskQueue: options.taskQueue,
  gateway: demo,
  store,
  prompts: fakePrompts(),
  pages: fakePages(),
  workflowsPath: options.workflowsPath,
  seed: () => `sd${++seeds}xproc${process.pid}`,
});
const running = worker.run();
console.log('ready');
await running;
