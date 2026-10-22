// Prints estimateRecipe for every protocol configuration and profile, with the web app's suggestBudget.
// Run from inside a clone: pnpm exec tsx <this file> <clone root> <label>
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.argv[2]!;
const label = process.argv[3] ?? '';
const imp = (p: string) => import(pathToFileURL(path.join(root, p)).href);

const { estimateRecipe } = await imp('packages/advisor/src/estimate.ts');
const { PROTOCOL_CONFIGS } = await imp('packages/catalog/src/index.ts');
const { PROFILES } = await imp('packages/gateway/src/profiles.ts');

function suggestBudget(e: { lowUsd: number; highUsd: number }): number {
  if (e.highUsd <= 0) return 1;
  return Math.max(0.5, Math.ceil(e.highUsd * 1.25 * 2) / 2);
}

const at = new Date('2026-10-19T12:00:00Z');
const combos: Array<[string, { images: boolean; video: boolean; otherFamily: boolean }]> = [
  ['all', { images: true, video: true, otherFamily: true }],
  ['noOther', { images: true, video: true, otherFamily: false }],
  ['noImg', { images: false, video: true, otherFamily: true }],
  ['textOnly', { images: false, video: false, otherFamily: false }],
];
for (const profile of PROFILES) {
  if (profile.id === 'demo') continue;
  for (const [cname, flags] of combos) {
    for (const r of PROTOCOL_CONFIGS) {
      const e = estimateRecipe(r, { profile, ...flags, at });
      console.log(`${label} ${profile.id} ${cname} ${r.id} low=${e.lowUsd.toFixed(2)} high=${e.highUsd.toFixed(2)} budget=${suggestBudget(e).toFixed(2)} calls=${e.modelCalls.low}-${e.modelCalls.high} images=${e.images.low}-${e.images.high}`);
    }
  }
}
