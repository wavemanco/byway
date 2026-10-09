/**
 * ADR-0070: the workflow entry compiles with esbuild into one ESM file in which every workspace import is inlined and
 * only @temporalio/* stays external. The build is platform-neutral, so a Node import in workflow code fails it.
 */
import { readFileSync, rmSync } from 'node:fs';
import type { Plugin } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { buildWorkflows, DEFAULT_WORKFLOWS_BUNDLE, workflowBundleHash } from '../src/build.ts';

/**
 * The workflow bundle's hash at main a768d4d (after ADR-0092's admission work, which changed it from e572716a… at 17eae76),
 * before F03's stage 3, and after it: stage 3 changes no workflow code. Cluster F (ADR-0089, ADR-0090) changed it on
 * purpose from bfdda860… to ec88dae8… on main (`toStepSpec` carries `reads`, the revise-in-place prefill, the link
 * context, the unobservable skip and the `unchecked` loop exit). Cluster A's stages 2-4 (ADR-0093, ADR-0098), merged
 * onto it, change it again on purpose, to fcadfee4…: the cap turn every loop exit at the cap takes, the held voice and
 * the run-time guard over the person's words, a C pick whose judge names no draft fails, the engine's limits checked at
 * workflow start, and `asksSwaps` shared from @byway/recipe/semantics. Alone on its branch that work was bfdda860… to
 * 9f872bb4…, a hash that never reached main. F08's fourth round changes it once more on the same branch, from fcadfee4…
 * to 38afef53…, so that what the run says is true of every admitted recipe: a script VOICE says "It is locked after
 * this" only where nothing the person writes later can change it (`lockedScripts`, read from the recipe at the step),
 * a VOICE is asked by what it covers in the run's medium, and a cliché sweep asks which finds to swap only where nothing
 * puts another critique in their place before the swap step (`asksSwaps` with `replacesCritique`). fcadfee4… never
 * reached main either. Runs waiting under an older bundle end plainly (ADR-0078).
 */
const PINNED_WORKFLOW_HASH = '38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637';

describe('the workflow bundle', () => {
  it('inlines the workspace and leaves only the Temporal workflow SDK external', async () => {
    const out = await buildWorkflows({ outfile: DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `check-${process.pid}.js`) });
    try {
      const code = readFileSync(out, 'utf8');
      const imports = [...code.matchAll(/^import\s[^;]*?from\s*"([^"]+)"/gm)].map((m) => m[1]);
      expect(new Set(imports)).toEqual(new Set(['@temporalio/workflow']));
      expect(code).not.toMatch(/from\s*"(node:|@byway\/)/);
      expect(code).toMatch(/export\s*\{[^}]*runRecipe/);
      // Contract constants are inlined, not imported.
      expect(code).toContain('"resolveCheckpoint"');
      expect(code).toContain('"cancelRun"');
    } finally {
      rmSync(out, { force: true });
    }
  }, 60_000);

  it('is the bundle runs in flight were started under: the spend book’s stage 3 changed no workflow code, cluster F and cluster A changed it on purpose (ADR-0078, ADR-0099, ADR-0090, ADR-0093, ADR-0098)', async () => {
    // A run records the hash of the bundle it started under, and a worker running another bundle ends it plainly
    // (ADR-0078). Pinned, so that a change to workflow code is a decision made with it, never a side effect of activity
    // work: update it in the same change that alters workflow code on purpose.
    const out = await buildWorkflows({ outfile: DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `pinned-${process.pid}.js`) });
    try {
      expect(workflowBundleHash(out)).toBe(PINNED_WORKFLOW_HASH);
    } finally {
      rmSync(out, { force: true });
    }
  }, 60_000);

  /**
   * ADR-0092: the protocol's rule and exception tables are admission data the workflow never reads. @byway/protocol is
   * side-effect free, so they stay out of the bundle and editing them (a new rule such as ST12) does not change the
   * bundle's hash, which would end every run open at the upgrade (ADR-0078).
   */
  it('takes from @byway/protocol only what workflow code reads; rule and exception edits leave its hash alone', async () => {
    const out = (name: string) => DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `${name}-${process.pid}.js`);
    /** Rewrite one @byway/protocol source as esbuild reads it. */
    const editing = (file: string, from: string, to: string): Plugin => ({
      name: 'edit-on-load',
      setup(b) {
        b.onLoad({ filter: new RegExp(`protocol[\\\\/]src[\\\\/]${file}\\.ts$`) }, (args) => {
          const source = readFileSync(args.path, 'utf8');
          if (!source.includes(from)) throw new Error(`${file}.ts no longer holds ${JSON.stringify(from)}`);
          return { contents: source.replace(from, to), loader: 'ts' };
        });
      },
    });
    const base = await buildWorkflows({ outfile: out('proto-base') });
    // A rule added to the catalogue, as ST12 was, and an exception's wording changed.
    const rules = await buildWorkflows({ outfile: out('proto-rules'), plugins: [editing('rules', '  PR1: r(', "  ST99: r('ST12', 'invariant', 'A new rule', 'ADR-0092'),\n  PR1: r(")] });
    const exceptions = await buildWorkflows({ outfile: out('proto-exc'), plugins: [editing('exceptions', "families: ['C1'],", "families: ['C1', 'C1x'],")] });
    // The control: a change to something workflow code does read moves the hash, so the edits above were really made.
    const tells = await buildWorkflows({ outfile: out('proto-tells'), plugins: [editing('blocks', "'fiction',", "'fiction-x',")] });
    try {
      const code = readFileSync(base, 'utf8');
      const protocolFiles = [...code.matchAll(/\/\/ \.\.\/protocol\/src\/([\w-]+)\.ts/g)].map((m) => m[1]);
      expect(new Set(protocolFiles)).toEqual(new Set(['blocks', 'media']));
      expect(code).not.toMatch(/\bvar RULES\b/);
      expect(code).not.toMatch(/\bvar EXCEPTIONS\b/);
      expect(workflowBundleHash(rules)).toBe(workflowBundleHash(base));
      expect(workflowBundleHash(exceptions)).toBe(workflowBundleHash(base));
      expect(workflowBundleHash(tells)).not.toBe(workflowBundleHash(base));
    } finally {
      for (const f of [base, rules, exceptions, tells]) rmSync(f, { force: true });
    }
  }, 60_000);

  it('carries the hash of its own code, the same on every build of the same code (C7)', async () => {
    const a = await buildWorkflows({ outfile: DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `hash-a-${process.pid}.js`) });
    const b = await buildWorkflows({ outfile: DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `hash-b-${process.pid}.js`) });
    try {
      const hash = workflowBundleHash(a);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(workflowBundleHash(b)).toBe(hash);
      const code = readFileSync(a, 'utf8');
      // The placeholder is gone, and the source map is still inline.
      expect(code).not.toContain(`bywaywf:${'0'.repeat(64)}`);
      expect(code).toMatch(/\/\/# sourceMappingURL=data:application\/json;base64,/);
    } finally {
      rmSync(a, { force: true });
      rmSync(b, { force: true });
    }
  }, 60_000);
});
