import { contentHash } from '@byway/canonical';
import type { Recipe } from './schema.ts';

/** Drop object properties whose value is undefined (absent and undefined optional fields hash alike). */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out;
  }
  return value;
}

/** Content hash of a recipe, excluding its own `hash` field. The schema id is part of the hashed content. */
export function recipeHash(recipe: Recipe): string {
  const { hash: _ignored, ...rest } = recipe;
  return contentHash(stripUndefined(rest));
}

/** Return a copy of the recipe with its `hash` field set. */
export function withHash(recipe: Recipe): Recipe {
  const { hash: _ignored, ...rest } = recipe;
  return { ...rest, hash: recipeHash(recipe) };
}
