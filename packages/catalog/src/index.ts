import type { Recipe } from '@byway/recipe';
import { baselines } from './baselines.ts';
import { c1 } from './c1.ts';
import { c1h, c1hAblations } from './c1h.ts';

export { c1 } from './c1.ts';
export { c1h, c1hAblations } from './c1h.ts';
export { bBon, bPlain, bRandom, bSkill, baselines } from './baselines.ts';

/** Every recipe in the catalog, hashed. Order is stable (it fixes the manifest order). */
export const CATALOG: readonly Recipe[] = [c1, c1h, ...c1hAblations, ...baselines];
