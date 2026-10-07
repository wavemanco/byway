import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Recipe } from '@byway/recipe';
import { CATALOG } from './index.ts';

export const RECIPES_DIR = resolve(import.meta.dirname, '../../../recipes');

/** The exact text written for one recipe file. */
export function recipeFileText(recipe: Recipe): string {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}

/** The manifest: every catalog id with its kind, channel and hash. */
export function manifestText(recipes: readonly Recipe[] = CATALOG): string {
  const manifest = {
    schema: 'byway.catalog/1',
    recipes: recipes.map((r) => ({ id: r.id, kind: r.kind, channel: r.channel, hash: r.hash })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Write recipes/<id>.json for every catalog recipe and recipes/manifest.json. */
export function emitCatalog(dir: string = RECIPES_DIR, recipes: readonly Recipe[] = CATALOG): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const r of recipes) {
    const file = join(dir, `${r.id}.json`);
    writeFileSync(file, recipeFileText(r));
    written.push(file);
  }
  writeFileSync(join(dir, 'manifest.json'), manifestText(recipes));
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = emitCatalog();
  console.log(`wrote ${files.length} recipes and manifest.json to ${RECIPES_DIR}`);
}
