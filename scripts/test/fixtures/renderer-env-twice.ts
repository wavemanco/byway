/**
 * Loads the gateway as `pnpm start` does (scripts/serve.ts): by a relative path, then the page renderer's module, which
 * takes the gateway through the @byway/gateway link. Started from a current directory whose drive letter is lowercase
 * (Windows), the path import is `file:///c:/…` and the link resolves to `file:///C:/…`: two copies of the gateway.
 *
 * Loads the secrets file given as the first argument with the path's copy, as serve.ts does, and prints as JSON whether
 * the link's copy is another module, and the environment the renderer's Chromium would be launched with.
 */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as viaPath from '../../../packages/gateway/src/index.ts';
import { chromiumLaunchOptions } from '../../../packages/runner/src/pages.ts';

// The module pages.ts gets: Node resolves @byway/gateway through the workspace link to its real path.
const here = path.dirname(fileURLToPath(import.meta.url));
const linked = realpathSync(path.join(here, '../../../packages/runner/node_modules/@byway/gateway/src/index.ts'));
const viaLink = (await import(pathToFileURL(linked).href)) as typeof viaPath;

const env: Record<string, string | undefined> = { PATH: 'C:\\Windows' };
viaPath.loadEnvFile(process.argv[2]!, env);
console.log(JSON.stringify({ twoCopies: viaLink.namesFromEnvFile !== viaPath.namesFromEnvFile, chromiumEnv: chromiumLaunchOptions({ osSandbox: true }, env).env }));
