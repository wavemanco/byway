// F02 end-to-end probe (verify-F02-reproduce): the real composer admission (checkAnswer), the real Runner client,
// the real worker and workflow bundle on a local Temporal dev server (cached CLI, port 7609, in-memory), the real
// gateway in demo mode (mock provider, env {} so no keys), a temp SQLite store and fake pages. Everything it writes
// goes under this script's folder. Usage (cwd C:/Users/arvik/code/byway): pnpm exec tsx <this file> <n> [<n> ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const R = 'file:///C:/Users/arvik/code/byway/packages';
const HERE = 'C:/Users/arvik/AppData/Local/Temp/byway-review-verify/verify-F02-reproduce';
const { TestWorkflowEnvironment } = await import(`${R}/runner/node_modules/@temporalio/testing/lib/index.js`);
const { DefaultLogger, Runtime } = await import(`${R}/runner/node_modules/@temporalio/worker/lib/index.js`);
const { buildWorkflows } = await import(`${R}/runner/src/build.ts`);
const { createRunnerClient } = await import(`${R}/runner/src/client.ts`);
const { storeCaps } = await import(`${R}/runner/src/caps.ts`);
const { createWorker } = await import(`${R}/runner/src/worker.ts`);
const { workflowIdFor } = await import(`${R}/runner/src/types.ts`);
const { fakePages } = await import(`${R}/runner/test/helpers/fake-pages.ts`);
const { createTestStore } = await import(`${R}/runner/test/helpers/memo.ts`);
const { createGateway, PROFILES } = await import(`${R}/gateway/src/index.ts`);
const { createPromptRenderer } = await import(`${R}/prompts/src/index.ts`);
const { checkAnswer } = await import(`${R}/advisor/src/index.ts`);
const { c1, PROTOCOL_CONFIGS } = await import(`${R}/catalog/src/index.ts`);

try { Runtime.install({ logger: new DefaultLogger('ERROR') }); } catch {}
const ns = process.argv.slice(2).map(Number);
const OBSERVE_MS = Number(process.env.OBSERVE_MS ?? 60_000);
const dir = path.join(HERE, `temporal-run-${Date.now()}`);
mkdirSync(dir, { recursive: true });
const log = (o: unknown) => { const line = JSON.stringify(o); process.stderr.write(line + '\n'); writeFileSync(path.join(dir, 'log.jsonl'), line + '\n', { flag: 'a' }); };

const store = createTestStore({ dataDir: path.join(dir, 'data') });
const ws = await store.ensureDefaultWorkspace();
const gateway = createGateway({ ledgerPath: path.join(dir, 'ledger.jsonl'), artifacts: store.artifacts, caps: storeCaps(store), demo: true, env: {}, profiles: PROFILES, retry: { maxAttempts: 1 } });
const prompts = createPromptRenderer();
const workflowsPath = await buildWorkflows({ outfile: path.join(dir, 'workflows.js') });
const exe = 'C:/Users/arvik/AppData/Local/Temp/temporal-sdk-typescript-1.24.0.exe';
const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: exe }, port: 7609, ui: false } });
const taskQueue = 'f02-probe';
let worker: any;
try {
  worker = await createWorker({ connection: env.nativeConnection, taskQueue, gateway, store, prompts, pages: fakePages(), workflowsPath });
} catch (e: any) {
  log({ createWorkerError: `${e?.name}: ${String(e?.message).slice(0, 500)}` });
  await env.teardown();
  process.exit(1);
}
const running = worker.run().catch((e: any) => log({ workerRunRejected: `${e?.name}: ${e?.message}` }));
const runner = createRunnerClient({ client: env.client, store, taskQueue });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function observe(runId: string) {
  const h = env.client.workflow.getHandle(workflowIdFor(runId));
  const d = await h.describe();
  const raw: any = d.raw;
  const events = await store.events(runId, 0);
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const run = await store.getRun(runId);
  let wftFailed = 0; const causes = new Set<string>(); let scheduled = 0; let completed = 0; let histLen = 0;
  const hist: any = await h.fetchHistory();
  for (const ev of (hist.events ?? []) as any[]) {
    histLen++;
    if (ev.workflowTaskFailedEventAttributes) { wftFailed++; causes.add(String(ev.workflowTaskFailedEventAttributes.cause)); const m = ev.workflowTaskFailedEventAttributes.failure?.message; if (m) causes.add(`msg:${String(m).slice(0, 200)}`); }
    if (ev.workflowExecutionTerminatedEventAttributes) causes.add(`terminated:${ev.workflowExecutionTerminatedEventAttributes.reason}|identity:${ev.workflowExecutionTerminatedEventAttributes.identity}`);
    if (ev.workflowExecutionCanceledEventAttributes) causes.add('workflow-cancelled');
    if (ev.activityTaskScheduledEventAttributes) scheduled++;
    if (ev.activityTaskCompletedEventAttributes) completed++;
  }
  return {
    storeStatus: run?.status, storeError: run?.error, temporalStatus: d.status.name, historyLength: histLen,
    pendingActivities: raw.pendingActivities?.length ?? 0, pendingWorkflowTaskAttempt: raw.pendingWorkflowTask?.attempt ?? null,
    activityScheduledEvents: scheduled, activityCompletedEvents: completed, workflowTaskFailedEvents: wftFailed, wftFailureCauses: [...causes],
    events: byType,
  };
}

try {
for (const n of ns) {
  const raw = structuredClone(c1) as any;
  raw.stages[0].body.n = n;
  const cand = checkAnswer(JSON.stringify(raw), c1, { prompts, catalog: PROTOCOL_CONFIGS }, `composed-f02-n${n}`);
  log({ n, admitted: !!cand.recipe && cand.violations.length === 0, violations: cand.violations });
  if (!cand.recipe || cand.violations.length) continue;
  const t0 = Date.now();
  const run = await runner.start({ workspaceId: ws.id, recipe: cand.recipe, problem: { text: 'A landing page for a neighborhood bakery' }, profileId: 'demo', budgetUsd: 1 });
  log({ n, started: run.id, startMs: Date.now() - t0 });
  const deadline = Date.now() + OBSERVE_MS;
  while (Date.now() < deadline) {
    await sleep(Math.min(10_000, Math.max(1000, deadline - Date.now())));
    try { log({ n, t: Math.round((Date.now() - t0) / 1000), ...(await observe(run.id)) }); } catch (e: any) { log({ n, observeError: `${e?.name}: ${e?.message}` }); }
    const ev = await store.events(run.id, 0);
    if (ev.filter((e: any) => e.type === 'step-finished' && e.stepId === 'seed-build').length >= n && process.env.BREAK_ON_D1 !== '0') { log({ n, d1DoneSec: Math.round((Date.now() - t0) / 1000) }); break; }
  }
  // Does cancel stop it?
  const tc = Date.now();
  try { await runner.cancel(run.id); log({ n, cancelSent: true }); } catch (e: any) { log({ n, cancelError: `${e?.name}: ${e?.message}` }); }
  const cancelWait = Number(process.env.CANCEL_WAIT_MS ?? 15_000);
  for (let waited = 0; waited < cancelWait; waited += 15_000) {
    await sleep(15_000);
    try { const o = await observe(run.id); log({ n, afterCancelSecSoFar: Math.round((Date.now() - tc) / 1000), storeStatus: o.storeStatus, temporalStatus: o.temporalStatus, attempt: o.pendingWorkflowTaskAttempt }); if (o.temporalStatus !== 'RUNNING') break; } catch {}
  }
  try { log({ n, afterCancelSec: Math.round((Date.now() - tc) / 1000), ...(await observe(run.id)) }); } catch (e: any) { log({ n, observeError: `${e?.name}: ${e?.message}` }); }
  try { await env.client.workflow.getHandle(workflowIdFor(run.id)).terminate('F02 probe cleanup'); log({ n, terminated: true }); } catch (e: any) { log({ n, terminateNote: `${e?.name}: ${e?.message}` }); }
}
} catch (e: any) {
  log({ loopError: `${e?.name}: ${String(e?.message).slice(0, 500)}` });
} finally {
  try { await Promise.race([worker.shutdown(), sleep(45_000)]); } catch (e: any) { log({ shutdownError: `${e?.name}: ${e?.message}` }); }
  await Promise.race([running, sleep(5_000)]);
  await env.teardown();
}
log({ done: true, dir });
process.exit(0);
