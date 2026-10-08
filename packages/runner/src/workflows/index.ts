/**
 * The workflow entry Temporal loads (ADR-0070: compiled to dist/workflows.js by esbuild before the worker starts).
 * It exports workflow functions only; everything it pulls in must be deterministic and free of Node APIs.
 */
export { runRecipe } from '../workflow/run.ts';
