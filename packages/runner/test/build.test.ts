/**
 * ADR-0070: the workflow entry compiles with esbuild into one ESM file in which every workspace import is inlined and
 * only @temporalio/* stays external. The build is platform-neutral, so a Node import in workflow code fails it.
 */
import { readFileSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWorkflows, DEFAULT_WORKFLOWS_BUNDLE, workflowBundleHash } from '../src/build.ts';

/** The workflow bundle's hash at main 17eae76, before F03's stage 3, and after it. */
const PINNED_WORKFLOW_HASH = 'e572716aaa5b6d3467b705ab8510f0473b49bc6838e78510917719b06c5d90e0';

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

  it('is the bundle runs in flight were started under: the spend book’s stage 3 changed no workflow code (ADR-0078, ADR-0099)', async () => {
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
