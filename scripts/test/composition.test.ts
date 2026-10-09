/**
 * The composition roots give every gateway the store's spend book (F03, ADR-0095), and close the gateway before the
 * store. The gateway refuses to start without a book, and the web service host's own test shows its gateways share
 * the store's; scripts/serve.ts starts byway's engine and cannot run here, so its source is read instead.
 */
import { describe, expect, it } from 'vitest';
import { read } from './docs.ts';

describe('scripts/serve.ts composes the gateway on the spend book (ADR-0095)', () => {
  const serve = read('scripts/serve.ts');

  it('passes the store’s spend book to the gateway it creates', () => {
    const creates = [...serve.matchAll(/createGateway\(\{[^}]*\}\)/g)].map((m) => m[0]);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatch(/spendBook: store\.spendBook/);
  });

  it('closes the gateway before the store on every way out', () => {
    const storeCloses = [...serve.matchAll(/store\.close\(\)/g)].map((m) => m.index ?? 0);
    expect(storeCloses.length).toBeGreaterThanOrEqual(3);
    for (const at of storeCloses) expect(serve.slice(Math.max(0, at - 200), at)).toMatch(/await gateway\.close\(\);\s*(\/\/[^\n]*\n\s*)?$/);
  });
});

describe('byway’s stop reaches the web process’s services (follow-up (f); ADR-0099)', () => {
  const serve = read('scripts/serve.ts');
  const devWeb = read('scripts/dev-web.ts');
  const instrumentation = read('apps/web/instrumentation.ts');

  it('starts next start with an IPC channel, which the app’s instrumentation hook listens on, and asks it to stop before ending it', () => {
    expect(serve).toMatch(/\[nextBin\(\), 'start'[^\n]*stdio: \['ignore', 'inherit', 'inherit', 'ipc'\]/);
    expect(instrumentation).toMatch(/stopOnRequest\(\)/);
    const stopWeb = serve.slice(serve.indexOf('async function stopWeb'), serve.indexOf('const exitCode'));
    expect(stopWeb.indexOf("child.send('stop')")).toBeGreaterThan(0);
    expect(stopWeb.indexOf("child.send('stop')")).toBeLessThan(stopWeb.indexOf('stopTree(child)'));
  });

  it('in contributor mode, closes the guarded server first, then the services, and owns its stop', () => {
    expect(devWeb).toMatch(/\[STOPPER_KEY\] = 'dev-web'/);
    expect(devWeb.indexOf('.close()')).toBeLessThan(devWeb.indexOf('closeServices()'));
  });
});
