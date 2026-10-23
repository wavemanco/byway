// Local only (127.0.0.1): what Node 24's built-in fetch does with a silent body, a body kept alive by small writes,
// and headers held past 300 s, with the default dispatcher and with an Agent whose timeouts are raised.
import http from 'node:http';
const t0 = Date.now();
const s = http.createServer((req, res) => {
  if (req.url === '/silent') { res.writeHead(200); res.write('x'); return; }               // one byte, then nothing
  if (req.url === '/pings') { res.writeHead(200); let n = 0; const iv = setInterval(() => { res.write(':\n'); if (++n >= 14) { clearInterval(iv); res.end('done'); } }, 30_000); return; } // 7 min of 30 s pings
  if (req.url === '/noheaders') { setTimeout(() => { res.writeHead(200); res.end('late'); }, 330_000); return; }
}).listen(0, '127.0.0.1');
await new Promise(r => s.on('listening', r));
const base = `http://127.0.0.1:${s.address().port}`;
const Agent = globalThis[Symbol.for('undici.globalDispatcher.1')].constructor;
const raised = new Agent({ headersTimeout: 400_000, bodyTimeout: 400_000 });
const probe = async (name, path, init = {}) => {
  const start = Date.now();
  try { const r = await fetch(base + path, init); const body = await r.text(); return `${name}: ok after ${((Date.now() - start) / 1000).toFixed(0)} s (${body.length} chars)`; }
  catch (e) { return `${name}: failed after ${((Date.now() - start) / 1000).toFixed(0)} s with ${e?.cause?.code ?? e?.code ?? e?.name}`; }
};
const results = await Promise.all([
  probe('default, silent body', '/silent'),
  probe('default, body with a ping every 30 s for 7 min', '/pings'),
  probe('default, headers held 330 s', '/noheaders'),
  probe('raised Agent (400 s), headers held 330 s', '/noheaders', { dispatcher: raised }),
]);
console.log(`node ${process.version}, undici ${process.versions.undici}`);
for (const r of results) console.log(r);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
s.closeAllConnections(); s.close(); process.exit(0);
