// Read-only, in-memory (write:false): does treating @byway/protocol as side-effect free (package.json "sideEffects": false,
// simulated through esbuild's onResolve) drop RULES and EXCEPTIONS from the workflow bundle, and does an ST12 edit
// then leave the hash alone? Same options as packages/runner/src/build.ts.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { build } from 'file:///C:/Users/arvik/code/byway/packages/runner/node_modules/esbuild/lib/main.js';
const PKG = 'C:/Users/arvik/code/byway/packages/runner';
const ENTRY = path.join(PKG, 'src', 'workflows', 'index.ts');
const PLACEHOLDER = `bywaywf:${'0'.repeat(64)}`;
const PROTO = 'C:/Users/arvik/code/byway/packages/protocol/src/';
const BS = String.fromCharCode(92);
async function h(sideEffectsFree: boolean, editRules?: (s: string) => string) {
  const plugins = [{ name: 'p', setup(b: any) {
    if (sideEffectsFree) b.onResolve({ filter: /^(@byway\/protocol|\.\/(ports|blocks|rules|exceptions|media)\.ts)$/ }, (a: any) => {
      const imp = String(a.importer).split(BS).join('/');
      if (a.path === '@byway/protocol') return { path: PROTO + 'index.ts', sideEffects: false };
      if (imp.startsWith(PROTO)) return { path: PROTO + a.path.slice(2), sideEffects: false };
      return undefined;
    });
    if (editRules) b.onLoad({ filter: /rules\.ts$/ }, (a: any) => String(a.path).split(BS).join('/').startsWith(PROTO) ? { contents: editRules(readFileSync(a.path, 'utf8')), loader: 'ts' } : undefined);
  } }];
  const r = await build({ entryPoints: [ENTRY], outfile: 'never-written.js', absWorkingDir: PKG, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', external: ['@temporalio/*'], mainFields: ['module', 'main'], conditions: ['import', 'default'], define: { __BYWAY_WORKFLOW_HASH__: JSON.stringify(PLACEHOLDER) }, sourcemap: 'external', write: false, logLevel: 'silent', plugins });
  const js = r.outputFiles.find((f: any) => f.path.endsWith('.js')).text;
  return { hash: createHash('sha256').update(js).digest('hex'), rules: js.includes('var RULES'), exceptions: js.includes('var EXCEPTIONS'), protocolFiles: [...js.matchAll(/\/\/ \.\.\/protocol\/src\/(\w+)\.ts/g)].map((m) => m[1]) };
}
const st12 = (s: string) => s.replace('  PR1: r(', "  ST12: r('ST12', 'invariant', 'Declared effects agree with what the engine executes', 'ADR-0081'),\n  PR1: r(");
const res = { base: await h(false), sideEffectsFree: await h(true), sideEffectsFreePlusSt12: await h(true, st12) };
console.log(JSON.stringify(res, null, 1));
writeFileSync('C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b/bundle-se.out.json', JSON.stringify(res, null, 1));
