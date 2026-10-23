// Local only (127.0.0.1): the shape of packages/gateway/src/providers/fetch.ts (the undici package's own fetch, with an
// Agent as its dispatcher), on the undici the gateway now pins, against the routes of the 2026-10-22 probe
// (docs/adr/evidence/probes/node-fetch-limits-2026-10-22/undici-timeouts.mjs), with the package's default Agent and with
// one whose timeouts are raised to 400 s. Usage: node package-timeouts.mjs <path to packages/gateway/package.json>
import http from 'node:http';
import { createRequire } from 'node:module';
const gatewayPackage = process.argv[2];
const { Agent, fetch } = createRequire(gatewayPackage)('undici');
const version = createRequire(gatewayPackage)('undici/package.json').version;
const t0 = Date.now();
const s = http.createServer((req, res) => {
  if (req.url === '/silent') { res.writeHead(200); res.write('x'); return; } // one byte, then nothing
  if (req.url === '/silent330') { res.writeHead(200); res.write('x'); setTimeout(() => res.end('y'), 330_000); return; } // one byte, 330 s of nothing, then the end
  if (req.url === '/pings') { res.writeHead(200); let n = 0; const iv = setInterval(() => { res.write(':\n'); if (++n >= 14) { clearInterval(iv); res.end('done'); } }, 30_000); return; } // 7 min of 30 s pings
  if (req.url === '/noheaders') { setTimeout(() => { res.writeHead(200); res.end('late'); }, 330_000); return; }
  if (req.method === 'POST' && req.url === '/json') { let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ echoed: JSON.parse(body) })); }); return; }
}).listen(0, '127.0.0.1');
await new Promise((r) => s.on('listening', r));
const base = `http://127.0.0.1:${s.address().port}`;
const plain = new Agent();
const raised = new Agent({ headersTimeout: 400_000, bodyTimeout: 400_000 });
const probe = async (name, path, init = {}) => {
  const start = Date.now();
  try { const r = await fetch(base + path, init); const body = await r.text(); return `${name}: ok after ${((Date.now() - start) / 1000).toFixed(0)} s (${body.length} chars${path === '/json' ? `: ${body}` : ''})`; }
  catch (e) { return `${name}: failed after ${((Date.now() - start) / 1000).toFixed(0)} s with ${e?.cause?.code ?? e?.code ?? e?.name}`; }
};
const results = await Promise.all([
  probe('raised Agent, JSON POST as the SDKs send it', '/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hello: 'world' }), dispatcher: raised }),
  probe('default Agent, silent body', '/silent', { dispatcher: plain }),
  probe('default Agent, body with a ping every 30 s for 7 min', '/pings', { dispatcher: plain }),
  probe('default Agent, headers held 330 s', '/noheaders', { dispatcher: plain }),
  probe('raised Agent (400 s), headers held 330 s', '/noheaders', { dispatcher: raised }),
  probe('raised Agent (400 s), body silent 330 s', '/silent330', { dispatcher: raised }),
]);
console.log(`node ${process.version}, Node's own undici ${process.versions.undici}, the package's undici ${version}`);
for (const r of results) console.log(r);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
s.closeAllConnections(); s.close(); process.exit(0);
