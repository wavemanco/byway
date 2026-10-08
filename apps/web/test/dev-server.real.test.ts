/**
 * Contributor mode with the real next dev (SEC-6): scripts/dev-web.ts, as `pnpm dev` starts it, on a free port with a
 * temp data folder and the mock forced on. A foreign Host or a cross-site request to Next's internal endpoints (open a
 * file in an editor, attach a debugger), the re-check's encoded `..` variant and the HMR WebSocket upgrade are all
 * refused by byway's guard; byway's own HMR upgrade still reaches Next; and the guarded port is the only one the
 * process tree listens on, so there is no unguarded next dev port to find.
 *
 * It builds into apps/web/.next-e2e (the test suites' own folder), so a `pnpm dev` you are running is not disturbed.
 * Nothing here renders a page, so no model is called and no key is read.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withoutSecrets } from '../src/server/serving.ts';
import { request, upgrade } from './fixtures/http.ts';
import { REPO } from './guards/scan.ts';

const WEB = path.join(REPO, 'apps', 'web');

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });

/** Every process under `root`, `root` included, from a list of (pid, parent pid) pairs. */
function tree(root: number, pairs: Array<[number, number]>): Set<number> {
  const out = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [pid, ppid] of pairs) if (out.has(ppid) && !out.has(pid)) (out.add(pid), (grew = true));
  }
  return out;
}

/** What the process tree under `root` listens on: TCP listeners and bound UDP sockets, as "TCP 127.0.0.1:3000". */
function listening(root: number): string[] {
  if (process.platform === 'win32') {
    const ps = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }'], { encoding: 'utf8' });
    const pids = tree(root, ps.stdout.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number) as [number, number]));
    const netstat = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    return netstat.stdout.split(/\r?\n/).flatMap((line) => {
      const [proto, local, , state, pid] = line.trim().split(/\s+/);
      if (proto === 'TCP' && state === 'LISTENING' && pids.has(Number(pid))) return [`TCP ${local}`];
      // UDP rows have no state: the pid is the fourth column.
      if (proto === 'UDP' && pids.has(Number(state))) return [`UDP ${local}`];
      return [];
    });
  }
  const ps = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  const pids = tree(root, ps.stdout.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number) as [number, number]));
  const lsof = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-i'], { encoding: 'utf8' });
  if (lsof.error) throw new Error('lsof is needed to list the listening ports here.');
  return lsof.stdout.split('\n').flatMap((line) => {
    const cols = line.trim().split(/\s+/);
    const proto = cols[7];
    const name = cols[8];
    if (proto === 'TCP' && line.includes('(LISTEN)')) return [`TCP ${name}`];
    if (proto === 'UDP') return [`UDP ${name}`];
    return [];
  });
}

let child: ChildProcess | undefined;
let port = 0;
let dataDir = '';
const output: string[] = [];

beforeAll(async () => {
  port = await freePort();
  dataDir = mkdtempSync(path.join(tmpdir(), 'byway-dev-test-'));
  child = spawn(process.execPath, [path.join(REPO, 'scripts', 'dev-web.ts')], {
    cwd: WEB,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      // No key or other secret from this shell reaches it, and nothing it does here would use one.
      ...withoutSecrets(process.env, []),
      NODE_ENV: 'development',
      PORT: String(port),
      BYWAY_DATA_DIR: dataDir,
      BYWAY_DEMO: '1',
      BYWAY_NEXT_DIST_DIR: '.next-e2e',
      // No engine runs here; nothing in this test reaches it.
      BYWAY_TEMPORAL_ADDRESS: '127.0.0.1:9',
    },
  });
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', (d: Buffer) => output.push(d.toString()));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dev-web.ts was not ready in 150 s:\n${output.join('')}`)), 150_000);
    child!.on('message', (m: unknown) => {
      if ((m as { ready?: boolean } | null)?.ready) (clearTimeout(timer), resolve());
    });
    child!.once('exit', (code) => (clearTimeout(timer), reject(new Error(`dev-web.ts exited with code ${code}:\n${output.join('')}`))));
  });
}, 180_000);

afterAll(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
    // The clean stop: it stops itself when its parent goes away. Forced after 15 s.
    child.disconnect();
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && child!.pid) spawnSync('taskkill', ['/pid', String(child!.pid), '/T', '/F'], { stdio: 'ignore' });
      else child!.kill('SIGKILL');
    }, 15_000);
    await exited;
    clearTimeout(timer);
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}, 30_000);

const INTERNALS = [
  '/__nextjs_launch-editor?file=C%3A%5Cnope%5Cbyway-test.txt&lineNumber=1',
  '/__nextjs_attach-nodejs-inspector',
  '/_next/%2e%2e/__nextjs_launch-editor?file=C%3A%5Cnope%5Cbyway-test.txt&lineNumber=1',
];

describe('pnpm dev’s web server, with the real next dev', () => {
  it('refuses a foreign Host (DNS rebinding) on Next’s internal endpoints and the app, before Next sees it', async () => {
    for (const path of [...INTERNALS, '/', '/settings', '/_next/static/chunks/main.js']) {
      for (const method of ['GET', 'POST']) {
        const res = await request(port, path, { Host: `rebind.evil.example:${port}` }, method);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(res.body, `${method} ${path}`).toContain('only answers requests addressed to this computer');
      }
    }
  });

  it('refuses Next’s internal endpoints to another site even with byway’s own Host', async () => {
    for (const path of INTERNALS) {
      for (const mode of ['no-cors', 'navigate', 'cors']) {
        const res = await request(port, path, { Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': mode });
        expect(res.status, `${mode} ${path}`).toBe(403);
        expect(res.body).toContain('Only byway itself may use this.');
      }
      const post = await request(port, path, { Host: `127.0.0.1:${port}`, Origin: 'http://evil.example' }, 'POST');
      expect(post.status, `POST ${path}`).toBe(403);
    }
  });

  it('refuses the HMR WebSocket to a foreign Host or another site, and connects byway’s own', async () => {
    expect((await upgrade(port, { Host: `rebind.evil.example:${port}` })).status).toMatch(/ 403 /);
    expect((await upgrade(port, { Host: `127.0.0.1:${port}`, Origin: 'http://evil.example' })).status).toMatch(/ 403 /);
    expect((await upgrade(port, { Host: `127.0.0.1:${port}`, Origin: 'null' })).status).toMatch(/ 403 /);
    // Next's own HMR handler answers byway's page: the guard sits in front of it, not instead of it.
    expect((await upgrade(port, { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' })).status).toMatch(/ 101 /);
  });

  it('listens on the guarded port only: no internal next dev port, no other listener in its process tree', () => {
    const found = listening(child!.pid!);
    console.log(`dev-web.ts (pid ${child!.pid}) listens on: ${found.join(', ')}`);
    expect(found).toEqual([`TCP 127.0.0.1:${port}`]);
  }, 30_000);
});
