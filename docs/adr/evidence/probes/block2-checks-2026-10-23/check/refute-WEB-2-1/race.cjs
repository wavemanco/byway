const { createRequire } = require('node:module');
const req = createRequire('C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b2check-clones/refute-WEB-2-1/apps/web/package.json');
const { chromium } = req('@playwright/test');
const BASE = 'http://127.0.0.1:4187';
const mode = process.argv[2] || 'natural';
const iterations = Number(process.argv[3] || 50);

async function stored(page, idx) {
  await page.reload();
  await page.waitForSelector('select.wait-choice');
  return page.locator('select.wait-choice').nth(idx).inputValue();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const log = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/waits')) log.push({ t: Date.now(), kind: 'req', body: r.postData() }); });
  page.on('response', (r) => { if (r.url().endsWith('/api/waits')) log.push({ t: Date.now(), kind: 'res', status: r.status() }); });
  await page.goto(BASE + '/settings');
  await page.waitForSelector('select.wait-choice');
  const sel = () => page.locator('select.wait-choice').nth(idx);
  let idx = 0;
  const count = await page.locator('select.wait-choice').count();
  console.log('selects', count);
  if (mode === 'cold') {
    idx = 0;
    await sel().focus();
    log.length = 0;
    for (const k of ['ArrowDown','ArrowDown','ArrowUp','ArrowDown','ArrowDown']) await page.keyboard.press(k);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
    const shown = await sel().inputValue();
    const live = await page.locator('[role=status]').allTextContents();
    const alert = await page.locator('[role=alert]').allTextContents();
    let inflight = 0, maxInflight = 0; for (const e of log) { inflight += e.kind === 'req' ? 1 : -1; maxInflight = Math.max(maxInflight, inflight); }
    const t0 = log[0] && log[0].t; const timeline = log.map((e) => ({ ...e, t: e.t - t0 }));
    const st = await stored(page, idx);
    console.log(JSON.stringify({ mode, shown, stored: st, live: live.filter(Boolean), alert: alert.filter(Boolean), maxInflight, timeline }));
  } else if (mode === 'natural') {
    let mismatches = 0, errors = 0, total = 0, overlaps = 0, maxInflightSeen = 0;
    for (let i = 0; i < iterations; i++) {
      idx = i % count;
      await sel().focus();
      log.length = 0;
      const dir = i % 2 === 0 ? 'ArrowDown' : 'ArrowUp';
      const burst = Number(process.env.BURST || 0);
      if (burst) { const opp = dir === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown'; for (let k = 0; k < burst; k++) await page.keyboard.press(k % 2 === 0 ? dir : opp); if (i % 3 === 0) await page.keyboard.press(dir); }
      else for (let k = 0; k < 3; k++) await page.keyboard.press(dir);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(150);
      const shown = await sel().inputValue();
      const live = await page.locator('[role=status]').allTextContents();
      const alert = await page.locator('[role=alert]').allTextContents();
      // overlap: a second request sent before the first response
      const reqs = log.filter((e) => e.kind === 'req').length;
      let inflight = 0, maxInflight = 0;
      for (const e of log) { inflight += e.kind === 'req' ? 1 : -1; maxInflight = Math.max(maxInflight, inflight); }
      if (maxInflight > 1) overlaps++; maxInflightSeen = Math.max(maxInflightSeen, maxInflight);
      const st = await stored(page, idx);
      total++;
      if (alert.some((a) => a.trim())) errors++;
      if (st !== shown) { mismatches++; console.log('MISMATCH', { i, idx, shown, st, live, alert, log }); }
    }
    console.log(JSON.stringify({ total, mismatches, errors, iterationsWithOverlap: overlaps, maxInflightSeen }));
  } else if (mode === 'holdResponse' || mode === 'holdRequest' || mode === 'failFirstLate' || mode === 'failFirstFast') {
    idx = 0;
    await page.reload(); await page.waitForSelector('select.wait-choice');
    // Reset row 0 to its first choice
    const opts = await sel().locator('option').evaluateAll((os) => os.map((o) => o.value));
    await sel().selectOption(opts[0]);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
    await page.reload(); await page.waitForSelector('select.wait-choice');
    const start = await sel().inputValue();
    let n = 0;
    await page.route('**/api/waits', async (route) => {
      n++;
      if (n === 1) {
        if (mode === 'holdResponse') { const r = await route.fetch(); await new Promise((s) => setTimeout(s, 1500)); return route.fulfill({ response: r }); }
        if (mode === 'holdRequest') { await new Promise((s) => setTimeout(s, 1500)); return route.continue(); }
        if (mode === 'failFirstLate') { await new Promise((s) => setTimeout(s, 1500)); return route.abort(); }
        if (mode === 'failFirstFast') { return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Something went wrong inside byway. Try again.' }) }); }
      }
      return route.continue();
    });
    await sel().focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(2500);
    const shown = await sel().inputValue();
    const live = await page.locator('[role=status]').allTextContents();
    const alert = await page.locator('[role=alert]').allTextContents();
    await page.unroute('**/api/waits');
    const st = await stored(page, idx);
    console.log(JSON.stringify({ mode, start, shown, live, alert, stored: st }));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
