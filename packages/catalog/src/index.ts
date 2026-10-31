import type { Recipe } from '@byway/recipe';
import { baselines } from './baselines.ts';
import { c1 } from './c1.ts';
import { c1h, c1hAblations } from './c1h.ts';
import { c2 } from './c2.ts';
import { c3 } from './c3.ts';
import { c4 } from './c4.ts';
import { c5 } from './c5.ts';
import { c6 } from './c6.ts';
import { c6a } from './c6a.ts';
import { c7 } from './c7.ts';

export { c1 } from './c1.ts';
export { c2 } from './c2.ts';
export { c3 } from './c3.ts';
export { c4 } from './c4.ts';
export { c5, C5_CHAIN_LINKS } from './c5.ts';
export { c6 } from './c6.ts';
export { c6a } from './c6a.ts';
export { c7 } from './c7.ts';
export { c1h, c1hAblations } from './c1h.ts';
export { bBon, bPlain, bRandom, bSkill, baselines } from './baselines.ts';
export { BLOCK_NAMES, PRESENTATIONS, STAGE_NAMES, presentationOf, presentedStepFor, routeChoice, stepPresentation, type PresentedStep, type RouteChoice } from './presentation.ts';
export { CHOOSER, CHOOSER_FALLBACK } from './chooser.ts';

/** The eight protocol configurations of 03 (C1–C7 and C6a), in 03's order, on the protocol channel. */
export const PROTOCOL_CONFIGS: readonly Recipe[] = [c1, c2, c3, c4, c5, c6, c6a, c7];

/** Every recipe in the catalog, hashed. Order is stable (it fixes the manifest order). */
export const CATALOG: readonly Recipe[] = [...PROTOCOL_CONFIGS, c1h, ...c1hAblations, ...baselines];
