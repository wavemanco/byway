// Probe (scratch only): run inside a job object that denies Chromium's sandbox its desktop (nodesktop.ps1), with the
// real launch. What the start-up check, a run's readiness check with and without the check's finding, and a renderer
// with the sandbox off say. Nothing is written to any store; no provider is called.
const WT = process.env.BYWAY_WT!;
const { checkRenderer, playwrightPages, rendererLine } = await import(`file:///${WT.replace(/\\/g, '/')}/packages/runner/src/pages.ts`);

const out = (k: string, v: unknown) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const check = await checkRenderer({ osSandbox: true });
out('CHECK', check);
out('LINE', rendererLine(check));

const noFinding = playwrightPages({ osSandbox: () => true });
out('READY, NO FINDING', await noFinding.ready().then(() => 'ready', (e: Error) => `REFUSED: ${e.message}`));
await noFinding.close();

const withFinding = playwrightPages({ osSandbox: () => true, lastCheck: async () => check });
const refused = await withFinding.ready().then(() => 'ready', (e: Error) => e.message);
out('READY, WITH FINDING', refused);
out('REFUSAL EQUALS CHECK MESSAGE', refused === check.message);
await withFinding.close();

const off = playwrightPages({ osSandbox: () => false });
out('READY, SANDBOX OFF', await off.ready().then(() => 'ready', (e: Error) => `REFUSED: ${e.message}`));
await off.close();
