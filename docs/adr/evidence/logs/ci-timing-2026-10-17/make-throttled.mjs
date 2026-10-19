// Writes a TEMPORARY copy of the rewritten pages.test.ts (removed after the run) whose every launch, the stated launch
// and the test-only launchWith, gives pages whose CPU Chromium throttles BYWAY_TEST_THROTTLE times (default 4), as a
// slower machine would run them. Usage: node make-throttled.mjs <out file> [source file, default the rewritten one]
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'C:/Users/arvik/code/byway/.worktrees/fx-ci-timing/packages/runner/test/pages.test.ts';
const out = process.argv[2];
let s = readFileSync(process.argv[3] ?? SRC, 'utf8');
const once = (from, to) => {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`expected one occurrence of ${from}, found ${n}`);
  s = s.replace(from, () => to);
};
once("allowedUrl, chromiumLaunchOptions, launchChromium, LINK_CLOSE", "allowedUrl, chromiumLaunchOptions, launchChromium as launchStated, LINK_CLOSE");
once(
  "const pages = playwrightPages({ maxTileHeight: 1200 });",
  `const RATE = Number(process.env.BYWAY_TEST_THROTTLE ?? '4');
const throttle = (b: Browser): Browser =>
  new Proxy(b, {
    get(t, p, r) {
      if (p !== 'newContext') return Reflect.get(t, p, r);
      return async (...a: Parameters<Browser['newContext']>) => {
        const c = await t.newContext(...a);
        return new Proxy(c, {
          get(cc, pp, rr) {
            if (pp !== 'newPage') return Reflect.get(cc, pp, rr);
            return async () => {
              const page = await cc.newPage();
              const session = await cc.newCDPSession(page);
              await session.send('Emulation.setCPUThrottlingRate', { rate: RATE });
              return page;
            };
          },
        });
      };
    },
  });
const launchChromium = async (): Promise<Browser> => throttle(await launchStated());
const pages = playwrightPages({ maxTileHeight: 1200, launch: launchChromium });`,
);
once(
  'return chromium.launch({ ...opts, ...change, args: [...(opts.args ?? []), ...extra] });',
  'return throttle(await chromium.launch({ ...opts, ...change, args: [...(opts.args ?? []), ...extra] }));',
);
writeFileSync(out, `// TEMPORARY (scratch, removed after the run): pages.test.ts with Chromium's CPU throttled.\n${s}`);
console.log(`wrote ${out}`);
