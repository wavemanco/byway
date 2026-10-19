// Build the workflow bundle from the worktree and report its hash and which workspace files it holds.
import { readFileSync, rmSync } from 'node:fs';
const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-ports-rendered/packages/runner/src/build.ts';
const b = await import(W);
const out = b.DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `probe-${process.pid}.js`);
await b.buildWorkflows({ outfile: out });
const code = readFileSync(out, 'utf8');
console.log('hash', b.workflowBundleHash(out));
console.log([...new Set([...code.matchAll(/\/\/ (\.\.\/[\w/.-]+\.ts)/g)].map((m) => m[1]))].join('\n'));
console.log('zod?', /strictObject|ZodError/.test(code), 'TEMPLATE_SLOTS?', code.includes('TEMPLATE_SLOTS'), 'ai-draft?', code.includes('product.c3.ai-draft'));
rmSync(out, { force: true });
