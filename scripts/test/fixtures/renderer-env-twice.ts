/**
 * Loads the gateway twice, as a `pnpm start` from a current directory whose drive letter is lowercase does on Windows:
 * scripts/serve.ts imports the gateway by a relative path (`file:///c:/…`), and pages.ts takes it through the
 * @byway/gateway link, which Node resolves to its real path (`file:///C:/…`). The two URLs are two module copies.
 * Whether a machine's current directory and link give two spellings depends on how its paths are written (on GitHub's
 * Windows runner they did not), so the fixture makes the second copy itself: it imports the gateway under the URL of
 * pages.ts's copy with the drive letter's case flipped.
 *
 * Loads the secrets file given as the first argument with that other copy, as serve.ts does, and prints as JSON whether
 * it is a module other than pages.ts's, and the environment the renderer's Chromium would be launched with.
 */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as Gateway from '../../../packages/gateway/src/index.ts';
import { chromiumLaunchOptions } from '../../../packages/runner/src/pages.ts';

// The module pages.ts gets: Node resolves @byway/gateway through the workspace link to its real path.
const here = path.dirname(fileURLToPath(import.meta.url));
const linked = pathToFileURL(
  realpathSync(path.join(here, '../../../packages/runner/node_modules/@byway/gateway/src/index.ts')),
).href;
// The same file under the other case of its drive letter: another module to Node.
const otherCase = (d: string) => (d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase());
const flipped = linked.replace(/^file:\/\/\/([A-Za-z]):/, (_, d: string) => `file:///${otherCase(d)}:`);
const viaLink = (await import(linked)) as typeof Gateway;
const other = (await import(flipped)) as typeof Gateway;

const env: Record<string, string | undefined> = { PATH: 'C:\\Windows' };
other.loadEnvFile(process.argv[2]!, env);
console.log(JSON.stringify({ twoCopies: flipped !== linked && other.namesFromEnvFile !== viaLink.namesFromEnvFile, chromiumEnv: chromiumLaunchOptions({ osSandbox: true }, env).env }));
