// Does the renderer's ready() (what checkRenderer() and the before-spend gates call) start a page renderer process,
// or only the browser? Counts the Chromium child processes by --type, after ready() and after one page.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const WT = 'C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-9';
const pagesMod = await import(pathToFileURL(`${WT}/packages/runner/src/pages.ts`).href);
const { chromium } = await import(pathToFileURL(`${WT}/packages/runner/node_modules/playwright/index.mjs`).href);

function children(marker: string) {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome-headless-shell.exe'" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress`;
  const out = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).stdout.trim();
  const all: { ProcessId: number; ParentProcessId: number; CommandLine: string | null }[] = out ? [].concat(JSON.parse(out)) : [];
  const root = all.find((p) => p.CommandLine?.includes(marker));
  if (!root) return { root: false, types: [] as string[] };
  const kids = all.filter((p) => p.ParentProcessId === root.ProcessId);
  const types = kids.map((k) => /--type=([\w-]+)/.exec(k.CommandLine ?? '')?.[1] ?? '?').map((t, i) => (t === 'utility' ? `utility:${/--utility-sub-type=([\w.]+)/.exec(kids[i]!.CommandLine ?? '')?.[1]}` : t));
  return { root: true, types: types.sort() };
}

const results: Record<string, unknown> = {};
for (const sandbox of [false, true]) {
  const marker = `--byway-d2-probe-${sandbox ? 'on' : 'off'}-${process.pid}`;
  const opts = pagesMod.chromiumLaunchOptions();
  // The same shape ready() produces: launch only (getBrowser()), nothing else.
  const browser = await chromium.launch({ ...opts, chromiumSandbox: sandbox, args: [...(opts.args ?? []), marker] });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const afterLaunch = children(marker);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<!doctype html><p>hi</p><script>document.title="ran"</script>');
    const title = await page.title();
    await new Promise((r) => setTimeout(r, 500));
    const afterPage = children(marker);
    await context.close();
    results[sandbox ? 'sandboxOn' : 'sandboxOff'] = { afterLaunchOnly: afterLaunch, afterOnePage: afterPage, scriptRan: title === 'ran' };
  } finally {
    await browser.close();
  }
}
// And ready() itself, as production calls it (main's setting), to confirm it is launch-only.
const pages = pagesMod.playwrightPages();
const before = Date.now();
await pages.ready();
results.readyMs = Date.now() - before;
await pages.close();
console.log(JSON.stringify(results, null, 2));
