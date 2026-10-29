/**
 * Run by pages.test.ts on Windows, as its own Node process inside a job object that denies Chromium's sandbox a desktop
 * of its own (JOB_OBJECT_UILIMIT_DESKTOP): a sandboxed Chromium then dies at launch with no word of why, as on a Windows
 * computer whose security software blocks the sandbox, and Chromium without the sandbox needs none (D2 (g); ADR-0105;
 * round 2's probe, docs/adr/evidence/probes/d2/probe-s2/). With the real launch, it prints as one JSON line what the
 * start-up check finds, what a run's readiness check says without and with that finding, and whether a renderer with
 * the sandbox off is ready. Nothing is written to any store.
 */
import { checkRenderer, playwrightPages, type PlaywrightPagesOptions } from '../../src/pages.ts';

/** A readiness check under `osSandbox`, in a renderer of its own: "ready", or what it refused with. */
const said = async (osSandbox: boolean, lastCheck?: PlaywrightPagesOptions['lastCheck']) => {
  const pages = playwrightPages({ osSandbox: () => osSandbox, ...(lastCheck ? { lastCheck } : {}) });
  try {
    await pages.ready();
    return 'ready';
  } catch (e) {
    return (e as Error).message;
  } finally {
    await pages.close();
  }
};

const check = await checkRenderer({ osSandbox: true });
const refused = await said(true);
const refusedWithFinding = await said(true, async () => check);
const off = await said(false);
console.log(JSON.stringify({ check, refused, refusedWithFinding, off }));
