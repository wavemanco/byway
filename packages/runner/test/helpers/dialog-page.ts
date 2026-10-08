/**
 * Run as its own Node process by pages.test.ts (SEC-5): renders a page that opens dialogs, then reports whether the
 * process lived through the render's deadline and the closing of its page. A page's dialogs used to crash the host
 * process with an unhandled rejection from Playwright's own auto-dismiss once the context was closed; the engine runs
 * the renderer in-process, so that crash would stop all of byway. A child process is the honest test: inside vitest an
 * unhandled rejection is caught by the test runner instead of ending the process.
 *
 * Usage: node dialog-page.ts <variant>. Prints "rendered" or "rejected: <message>", then "survived" and exits 0.
 */
import { playwrightPages } from '../../src/pages.ts';

/** The re-check's variants (alert-variants.mts): dialogs on a timer, in a loop on load, and one of each kind. */
const DIALOG_PAGES: Record<string, string> = {
  interval: `<!doctype html><html><body><h1>dialogs</h1><script>setInterval(() => alert('x'), 5);</script></body></html>`,
  alertloop: `<!doctype html><html><body><h1>alert loop</h1><script>addEventListener('load', () => { for (;;) alert('x'); });</script></body></html>`,
  confirmloop: `<!doctype html><html><body><h1>confirm loop</h1><script>addEventListener('load', () => { while (true) confirm('x'); });</script></body></html>`,
  promptloop: `<!doctype html><html><body><h1>prompt loop</h1><script>addEventListener('load', () => { for (;;) prompt('x', 'y'); });</script></body></html>`,
  once: `<!doctype html><html><body><h1>dialog once</h1><script>addEventListener('load', () => alert('x'));</script></body></html>`,
};

const which = process.argv[2] ?? 'interval';
const html = DIALOG_PAGES[which];
if (html !== undefined) {
  const pages = playwrightPages({ timeoutMs: Number(process.argv[3] ?? 3000), closeTimeoutMs: 3000 });
  try {
    const shots = await pages.render(html, async () => undefined, ['desktop', 'fold', 'mobile']);
    console.log(`rendered ${shots.map((s) => `${s.surface}:${s.tiles.length}`).join(',')}`);
  } catch (e) {
    console.log(`rejected: ${(e as Error).message.split('\n')[0]}`);
  }
  // Give any late rejection from the closed context time to surface before declaring the process alive.
  await new Promise((r) => setTimeout(r, 1500));
  await pages.close();
  console.log('survived');
}
