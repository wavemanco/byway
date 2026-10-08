/**
 * ADR-0070: the workflow entry compiles with esbuild into one ESM file in which every workspace import is inlined and
 * only @temporalio/* stays external. The build is platform-neutral, so a Node import in workflow code fails it.
 */
import { readFileSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWorkflows, DEFAULT_WORKFLOWS_BUNDLE } from '../src/build.ts';

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
});
