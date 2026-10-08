/**
 * The workflow build (ADR-0070). Temporal bundles workflow code with webpack and transpiles TypeScript with SWC, which
 * refuses its cache folders on this machine; the workspace packages also export TypeScript sources that Temporal's
 * bundler would hand to SWC. So the workflow entry is compiled with esbuild into one ESM file first, with every
 * workspace import inlined and only `@temporalio/*` left external, and the worker loads that `.js` file.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The workflow entry: it re-exports the workflow functions and nothing that touches Node. */
export const WORKFLOW_ENTRY = path.join(PACKAGE_DIR, 'src', 'workflows', 'index.ts');

/** Where the bundle lands; the worker's `workflowsPath` points here. */
export const DEFAULT_WORKFLOWS_BUNDLE = path.join(PACKAGE_DIR, 'dist', 'workflows.js');

export interface BuildWorkflowsOptions {
  /** Output file; defaults to {@link DEFAULT_WORKFLOWS_BUNDLE}. */
  outfile?: string;
}

/** Compile the workflow entry into one ESM file and return its path. Fast (esbuild), so the worker rebuilds on start. */
export async function buildWorkflows(opts: BuildWorkflowsOptions = {}): Promise<string> {
  const outfile = opts.outfile ?? DEFAULT_WORKFLOWS_BUNDLE;
  mkdirSync(path.dirname(outfile), { recursive: true });
  await build({
    entryPoints: [WORKFLOW_ENTRY],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    // Temporal's own bundler resolves these from the runner's node_modules and wires the workflow sandbox.
    external: ['@temporalio/*'],
    mainFields: ['module', 'main'],
    conditions: ['import', 'default'],
    sourcemap: 'inline',
    logLevel: 'silent',
  });
  return outfile;
}
