/**
 * `pnpm --filter @byway/runner build:workflows`: compile the workflow entry into dist/workflows.js with esbuild
 * (ADR-0070). The worker also does this on start; this script is for checking the bundle by hand.
 */
import { buildWorkflows } from '../src/build.ts';

const out = await buildWorkflows();
console.log(`workflow bundle: ${out}`);
