// Usage: tsx rec2-est.ts <repoRoot> [nanoOutZero]
import { pathToFileURL } from 'node:url';
const root = process.argv[2]!;
const nanoZero = process.argv[3] === 'nanoZero';
const imp = (p: string) => import(pathToFileURL(`${root}/${p}`).href);
const est = await imp('packages/advisor/src/estimate.ts');
const gw = await imp('packages/gateway/src/index.ts');
const cat = await imp('packages/catalog/src/index.ts');
const fmt = await imp('apps/web/src/view/format.ts');
let prices = gw.PRICES;
if (nanoZero) prices = prices.map((r: any) => (r.model === 'gemini-nano-banana-2.1' ? { ...r, outputPerMTok: 0, estimatedOutputTokensPerImage: undefined } : r));
const at = new Date('2026-10-19T12:00:00Z');
for (const pid of ['balanced', 'best', 'google', 'openai', 'openrouter']) {
  const profile = gw.PROFILES.find((p: any) => p.id === pid);
  for (const r of cat.PROTOCOL_CONFIGS) {
    const e = est.estimateRecipe(r, { profile, images: !!profile.image, video: !!profile.video, otherFamily: !!profile.otherFamily, at, prices });
    console.log(`${pid}\t${r.id}\tcalls ${e.modelCalls.low}-${e.modelCalls.high}\timages ${e.images.low}-${e.images.high}\tusd ${e.lowUsd}-${e.highUsd}\tbudget ${fmt.suggestBudget(e)}`);
  }
}
