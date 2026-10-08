/**
 * The workflow build (ADR-0070). Temporal bundles workflow code with webpack and transpiles TypeScript with SWC, which
 * refuses its cache folders on this machine; the workspace packages also export TypeScript sources that Temporal's
 * bundler would hand to SWC. So the workflow entry is compiled with esbuild into one ESM file first, with every
 * workspace import inlined and only `@temporalio/*` left external, and the worker loads that `.js` file.
 *
 * The bundle knows its own hash (C7, ENG-11): the sha256 of its code, written into the code where workflow/version.ts
 * reads it. A run records the hash it started under, so a worker built from different code can tell which waiting
 * runs it cannot replay. Comments are not part of the code esbuild emits, so editing them changes nothing.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The workflow entry: it re-exports the workflow functions and nothing that touches Node. */
export const WORKFLOW_ENTRY = path.join(PACKAGE_DIR, 'src', 'workflows', 'index.ts');

/** Where the bundle lands; the worker's `workflowsPath` points here. */
export const DEFAULT_WORKFLOWS_BUNDLE = path.join(PACKAGE_DIR, 'dist', 'workflows.js');

/** The literal the bundle carries its hash in: a prefix, then 64 hex digits (the placeholder is as long). */
const HASH_PREFIX = 'bywaywf:';
const PLACEHOLDER = `${HASH_PREFIX}${'0'.repeat(64)}`;
const HASH_LITERAL = /"bywaywf:([0-9a-f]{64})"/;

export interface BuildWorkflowsOptions {
  /** Output file; defaults to {@link DEFAULT_WORKFLOWS_BUNDLE}. */
  outfile?: string;
}

/** Compile the workflow entry into one ESM file and return its path. Fast (esbuild), so the worker rebuilds on start. */
export async function buildWorkflows(opts: BuildWorkflowsOptions = {}): Promise<string> {
  const outfile = opts.outfile ?? DEFAULT_WORKFLOWS_BUNDLE;
  mkdirSync(path.dirname(outfile), { recursive: true });
  const result = await build({
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
    define: { __BYWAY_WORKFLOW_HASH__: JSON.stringify(PLACEHOLDER) },
    // The map is kept apart so the hash covers the code only, then inlined as before.
    sourcemap: 'external',
    write: false,
    logLevel: 'silent',
  });
  const js = result.outputFiles.find((f) => f.path.endsWith('.js'));
  const map = result.outputFiles.find((f) => f.path.endsWith('.js.map'));
  if (!js) throw new Error('The workflow build produced no JavaScript.');
  const hash = createHash('sha256').update(js.text).digest('hex');
  const code = js.text.split(PLACEHOLDER).join(`${HASH_PREFIX}${hash}`);
  const inline = map ? `//# sourceMappingURL=data:application/json;base64,${Buffer.from(map.text).toString('base64')}\n` : '';
  writeFileSync(outfile, `${code.endsWith('\n') ? code : `${code}\n`}${inline}`);
  return outfile;
}

/** The hash a built bundle carries, or undefined for a file built some other way. */
export function workflowBundleHash(file: string): string | undefined {
  return HASH_LITERAL.exec(readFileSync(file, 'utf8'))?.[1];
}
