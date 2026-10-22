const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-fix-money/packages';
const { estimateRecipe } = await import(`${W}/advisor/src/estimate.ts`);
const { PRICES } = await import(`${W}/gateway/src/prices.ts`);
const { PROFILES } = await import(`${W}/gateway/src/profiles.ts`);
const { PROTOCOL_CONFIGS } = await import(`${W}/catalog/src/index.ts`);
const before = (await import('./prices-481b2e5.ts')).PRICES;
let diffs = 0, n = 0;
for (const p of PROFILES) for (const r of PROTOCOL_CONFIGS) for (const images of [false, true]) for (const video of [false, true]) for (const otherFamily of [false, true]) {
  const ctx = { profile: p, images, video, otherFamily, at: new Date('2026-10-21T12:00:00Z') };
  const a = JSON.stringify(estimateRecipe(r, { ...ctx, prices: before })), b = JSON.stringify(estimateRecipe(r, { ...ctx, prices: PRICES }));
  n++; if (a !== b) { diffs++; console.log(p.id, r.id, a, b); }
}
console.log(`${n} estimates, ${diffs} differ between 481b2e5's price rows and this branch's`);
