import http from 'node:http';
const s = http.createServer((req, res) => { res.end('ok'); }).listen(0, '127.0.0.1');
await new Promise(r => s.on('listening', r));
const sym = Symbol.for('undici.globalDispatcher.1');
console.log('before fetch, global dispatcher set:', !!globalThis[sym]);
await (await fetch(`http://127.0.0.1:${s.address().port}/`)).text();
const d = globalThis[sym];
console.log('after fetch:', d?.constructor?.name);
const own = Object.getOwnPropertySymbols(d).map(x => x.description);
console.log('agent own symbols:', own.join(' | '));
const hits = own.filter(x => x.includes('headers timeout') || x.includes('body timeout'));
console.log('symbols raiseUndiciTimeouts would touch on the Agent:', hits.length ? hits : 'none');
// look one level down: options object
for (const k of Object.getOwnPropertySymbols(d)) { const v = d[k]; if (v && typeof v === 'object' && !Array.isArray(v) && ('headersTimeout' in v || 'bodyTimeout' in v)) console.log('options under', k.description, JSON.stringify({h: v.headersTimeout, b: v.bodyTimeout})); }
s.close();
