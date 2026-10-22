import { PROTOCOL_CONFIGS } from 'C:/Users/arvik/code/byway/.worktrees/fx-b1/packages/catalog/src/index.ts';
import { PROFILES, PRICES } from 'C:/Users/arvik/code/byway/.worktrees/fx-b1/packages/gateway/src/index.ts';
import { estimateRecipe } from 'C:/Users/arvik/code/byway/.worktrees/fx-b1/packages/advisor/src/index.ts';
const at = new Date('2026-10-18T12:00:00Z');
const oldPrices = PRICES.map((r) => (r.model === 'gemini-nano-banana-2.1' ? { ...r, outputPerMTok: 0, estimatedOutputTokensPerImage: undefined } : r));
const budget = (h: number) => (h <= 0 ? 1 : Math.max(0.5, Math.ceil(h * 1.25 * 2) / 2));
for (const r of PROTOCOL_CONFIGS.filter((x) => x.channel === 'protocol')) {
  const row: string[] = [];
  for (const p of PROFILES.filter((p) => p.id !== 'demo')) {
    const ctx = { profile: p, images: true, video: true, otherFamily: true, at };
    const e = estimateRecipe(r, ctx);
    const o = estimateRecipe(r, { ...ctx, prices: oldPrices });
    row.push(`${p.id}: ${e.lowUsd.toFixed(2)}-${e.highUsd.toFixed(2)} budget ${budget(e.highUsd)} (old gemini: ${o.highUsd.toFixed(2)} budget ${budget(o.highUsd)})`);
  }
  console.log(r.id, '|', row.join(' | '));
}
