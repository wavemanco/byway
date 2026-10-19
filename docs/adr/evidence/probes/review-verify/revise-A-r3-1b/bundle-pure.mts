// Read-only, in-memory: does pointing prompts' pure modules at protocol leaf files (media.ts, blocks.ts) instead of the
// @byway/protocol index drop RULES from the workflow bundle, and does a later ST12 registration then leave the hash alone?
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { build } from 'file:///C:/Users/arvik/code/byway/packages/runner/node_modules/esbuild/lib/main.js';

const PKG = 'C:/Users/arvik/code/byway/packages/runner';
const ENTRY = path.join(PKG, 'src', 'workflows', 'index.ts');
const PLACEHOLDER = `bywaywf:${'0'.repeat(64)}`;
const OUTDIR = 'C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b';
const BACKSLASH = String.fromCharCode(92);

async function hashWithMany(edits: Record<string, (s: string) => string>) {
  const plugins = [{
    name: 'many',
    setup(b: any) {
      b.onLoad({ filter: /.*/ }, (a: any) => {
        const p = String(a.path).split(BACKSLASH).join('/');
        const k = Object.keys(edits).find((s) => p.endsWith(s));
        if (!k) return undefined;
        return { contents: edits[k]!(readFileSync(a.path, 'utf8')), loader: 'ts' };
      });
    },
  }];
  const r = await build({
    entryPoints: [ENTRY], outfile: `${OUTDIR}/never-written.js`, absWorkingDir: PKG, bundle: true, format: 'esm', platform: 'neutral',
    target: 'es2022', external: ['@temporalio/*'], mainFields: ['module', 'main'], conditions: ['import', 'default'],
    define: { __BYWAY_WORKFLOW_HASH__: JSON.stringify(PLACEHOLDER) }, sourcemap: 'external', write: false, logLevel: 'silent', plugins,
  });
  const js = r.outputFiles.find((f: any) => f.path.endsWith('.js'));
  return { hash: createHash('sha256').update(js.text).digest('hex'), hasRules: js.text.includes('var RULES'), hasExceptions: js.text.includes('ALL_CHANNELS') };
}

const P = 'C:/Users/arvik/code/byway/packages/protocol/src';
const decouple = {
  'prompts/src/ids.ts': (s: string) =>
    s.replace(
      "import { MEDIA, TELLS_DOMAINS, type Medium, type TellsDomain } from '@byway/protocol';",
      `import { MEDIA, type Medium } from '${P}/media.ts';\nimport { TELLS_DOMAINS, type TellsDomain } from '${P}/blocks.ts';`,
    ),
  'prompts/src/outputs.ts': (s: string) => s.replace("import { MEDIA, type Medium } from '@byway/protocol';", `import { MEDIA, type Medium } from '${P}/media.ts';`),
};
const st12 = (s: string) => s.replace('  PR1: r(', "  ST12: r('ST12', 'invariant', 'Declared effects and operators agree with what the engine executes', 'ADR-0081'),\n  PR1: r(");

const pure = (s: string) => s.split(': r(').join(': /* @__PURE__ */ r(');
const base = await hashWithMany({});
const decoupled = await hashWithMany({ 'protocol/src/rules.ts': pure });
const decoupledPlusSt12 = await hashWithMany({ 'protocol/src/rules.ts': (s: string) => pure(st12(s)) });
const res = {
  base,
  decoupled,
  decoupledPlusSt12,
  decouplingChangesHashOnce: decoupled.hash !== base.hash,
  st12AfterDecouplingChangesHash: decoupledPlusSt12.hash !== decoupled.hash,
};
console.log(JSON.stringify(res, null, 1));
writeFileSync(`${OUTDIR}/bundle-pure.out.json`, JSON.stringify(res, null, 1));
