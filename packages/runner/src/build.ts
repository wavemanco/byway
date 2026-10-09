/**
 * The workflow build (ADR-0070). Temporal bundles workflow code with webpack and transpiles TypeScript with SWC, which
 * refuses its cache folders on this machine; the workspace packages also export TypeScript sources that Temporal's
 * bundler would hand to SWC. So the workflow entry is compiled with esbuild into one ESM file first, with every
 * workspace import inlined and only `@temporalio/*` left external, and the worker loads that `.js` file.
 *
 * The bundle knows its own hash (C7, ENG-11): the sha256 of its code, written into the code where workflow/version.ts
 * reads it. A run records the hash it started under, so a worker built from different code can tell which waiting
 * runs it cannot replay. esbuild keeps some comments in the code it emits (a doc comment on a class member can survive,
 * as LoopExit's does), so editing a comment in workflow code can change the hash; build.test.ts pins it, so such a
 * change shows.
 *
 * The bundle is replaced whole (replaceFile): written beside its final name, then renamed into place. Two byway starts
 * from one checkout build the same file at the same time, and a worker reading it while the other wrote it in place
 * could load half a bundle.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

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
  /**
   * esbuild plugins, for tests that change a source as it is read, to show what the bundle does and does not depend on
   * (an edit to @byway/protocol's rule table must leave the hash alone, ADR-0092). The worker passes none.
   */
  plugins?: Plugin[];
}

/** Compile the workflow entry into one ESM file and return its path. Fast (esbuild), so the worker rebuilds on start. */
export async function buildWorkflows(opts: BuildWorkflowsOptions = {}): Promise<string> {
  const outfile = opts.outfile ?? DEFAULT_WORKFLOWS_BUNDLE;
  mkdirSync(path.dirname(outfile), { recursive: true });
  const result = await build({
    entryPoints: [WORKFLOW_ENTRY],
    outfile,
    // The bundle's file comments are relative to this folder, so its hash does not depend on where byway was started.
    absWorkingDir: PACKAGE_DIR,
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
    ...(opts.plugins?.length ? { plugins: opts.plugins } : {}),
  });
  const js = result.outputFiles.find((f) => f.path.endsWith('.js'));
  const map = result.outputFiles.find((f) => f.path.endsWith('.js.map'));
  if (!js) throw new Error('The workflow build produced no JavaScript.');
  const hash = createHash('sha256').update(js.text).digest('hex');
  const code = js.text.split(PLACEHOLDER).join(`${HASH_PREFIX}${hash}`);
  const inline = map ? `//# sourceMappingURL=data:application/json;base64,${Buffer.from(map.text).toString('base64')}\n` : '';
  await replaceFile(outfile, `${code.endsWith('\n') ? code : `${code}\n`}${inline}`);
  return outfile;
}

/** Errors a rename on Windows gives while another process (a worker loading the bundle, a virus scanner) briefly holds the target. */
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_TRIES = 5;

/**
 * Writes `text` to `file` so that a reader sees the old file or the new one, never part of one: the text goes to a
 * temporary file beside it (same folder, so the rename stays on one volume), which is then renamed over it. A write
 * that fails leaves the old file as it was and removes the temporary one.
 */
async function replaceFile(file: string, text: string): Promise<void> {
  const temp = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, text);
    for (let n = 1; ; n++) {
      try {
        renameSync(temp, file);
        return;
      } catch (e) {
        if (n >= RENAME_TRIES || !BUSY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
        await new Promise((r) => setTimeout(r, 50 * n));
      }
    }
  } catch (e) {
    rmSync(temp, { force: true });
    throw e;
  }
}

/** The hash a built bundle carries, or undefined for a file built some other way. */
export function workflowBundleHash(file: string): string | undefined {
  return HASH_LITERAL.exec(readFileSync(file, 'utf8'))?.[1];
}
