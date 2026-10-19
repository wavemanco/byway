import { createRequire } from 'node:module';
const require = createRequire('C:/Users/arvik/code/byway/.worktrees/fx-d2/packages/runner/package.json');
const { chromium } = require('playwright');
const WAITING = '<!doctype html><html><body><img src="/slow.png" width="10" height="10">Waiting</body></html>';
const reason = 'byway closed the page renderer as it shut down';
const first = (e) => String(e?.message ?? e).split('\n')[0];
for (const mode of ['reason', 'bare']) {
  const b = await chromium.launch();
  const context = await b.newContext();
  const page = await context.newPage();
  await context.route('**/*', (r) => (r.request().url().endsWith('/page') ? r.fulfill({ body: WAITING, contentType: 'text/html' }) : new Promise(() => {})));
  const going = page.goto('http://byway-render.localhost/page', { waitUntil: 'load' }).then(() => 'ok', first);
  const evaluating = page.evaluate('new Promise(() => {})').then(() => 'ok', first);
  await new Promise((r) => setTimeout(r, 800));
  await b.close(mode === 'reason' ? { reason } : undefined);
  console.log(mode, 'goto    :', await going);
  console.log(mode, 'evaluate:', await evaluating);
  console.log(mode, 'shot    :', await page.screenshot().then(() => 'ok', first));
  console.log(mode, 'newPage :', await context.newPage().then(() => 'ok', first));
  console.log(mode, 'route   :', await context.route('**/x', () => {}).then(() => 'ok', first));
  console.log(mode, 'newCtx  :', await b.newContext().then(() => 'ok', first));
  console.log(mode, 'clock   :', await context.clock.install({ time: 0 }).then(() => 'ok', first));
}
