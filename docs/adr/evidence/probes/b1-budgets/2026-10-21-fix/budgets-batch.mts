// MONEY-3 / REC-2: each configuration's estimate and default run budget on every profile, at main (8401820) and at the
// fix branch's head, with every key combination that changes the estimate. Run from the worktree:
//   pnpm exec tsx <this file>
// main's estimate.ts and prices.ts are copies read with `git show 8401820:<path>` into ./main (imports rewritten to the
// worktree's unchanged recipe package and fal.ts, which did not change between main and head).
const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-batch/packages';
const head = await import(`${W}/advisor/src/estimate.ts`);
const headPrices = (await import(`${W}/gateway/src/prices.ts`)).PRICES;
const { PROFILES } = await import(`${W}/gateway/src/profiles.ts`);
const { PROTOCOL_CONFIGS } = await import(`${W}/catalog/src/index.ts`);
const main = await import('./main/estimate.ts');
const mainPrices = (await import('./main/prices.ts')).PRICES;

const AT = new Date('2026-10-21T12:00:00Z');
// apps/web/src/view/format.ts suggestBudget.
const budget = (e: { highUsd: number }) => (e.highUsd <= 0 ? 1 : Math.max(0.5, Math.ceil(e.highUsd * 1.25 * 2) / 2));

const KEYS = ['anthropic', 'openai', 'google', 'openrouter', 'fal'] as const;
type Flags = { images: boolean; video: boolean; otherFamily: boolean };
function combos(p: any): { flags: Flags; keys: string }[] {
  const seen = new Map<string, { flags: Flags; keys: string }>();
  for (let mask = 0; mask < 1 << KEYS.length; mask++) {
    const has = new Set(KEYS.filter((_, i) => mask & (1 << i)));
    if (![p.tiers.big.provider, p.tiers.mid.provider].every((x: string) => has.has(x as never))) continue;
    const flags = { images: !!p.image && has.has(p.image.provider), video: !!p.video && has.has(p.video.provider), otherFamily: !!p.otherFamily && has.has(p.otherFamily.provider) };
    const id = JSON.stringify(flags);
    const keys = [...has].join('+');
    if (!seen.has(id) || keys.length > seen.get(id)!.keys.length) seen.set(id, { flags, keys });
  }
  return [...seen.values()];
}

// Planning every OpenAI prompt as written to the cache (the high end if no call hits it): input at the write rate.
const writePlanned = headPrices.map((r: any) => (r.provider === 'openai' && r.cacheWritePerMTok !== undefined ? { ...r, inputPerMTok: r.cacheWritePerMTok } : r));

const rows: any[] = [];
for (const p of PROFILES.filter((x: any) => x.id !== 'demo')) {
  for (const { flags, keys } of combos(p)) {
    for (const r of PROTOCOL_CONFIGS) {
      const ctx = { profile: p, ...flags, at: AT };
      const m = main.estimateRecipe(r, { ...ctx, prices: mainPrices });
      const h = head.estimateRecipe(r, { ...ctx, prices: headPrices });
      const w = head.estimateRecipe(r, { ...ctx, prices: writePlanned });
      rows.push({ profile: p.id, keys, flags, config: r.id, main: m, head: h, writes: w, mainBudget: budget(m), headBudget: budget(h), writesBudget: budget(w) });
    }
  }
}

const f = (x: number) => x.toFixed(2);
const flagStr = (fl: Flags) => `img=${+fl.images} vid=${+fl.video} oth=${+fl.otherFamily}`;
console.log('profile | keys | flags | config | main low-high calls budget | head low-high calls budget | change | head w/ OpenAI writes planned: high budget');
for (const x of rows) {
  const d = x.headBudget - x.mainBudget;
  console.log(
    [
      x.profile,
      x.keys,
      flagStr(x.flags),
      x.config,
      `${f(x.main.lowUsd)}-${f(x.main.highUsd)} ${x.main.modelCalls.low}-${x.main.modelCalls.high} $${f(x.mainBudget)}`,
      `${f(x.head.lowUsd)}-${f(x.head.highUsd)} ${x.head.modelCalls.low}-${x.head.modelCalls.high} $${f(x.headBudget)}`,
      d === 0 ? '=' : `${d > 0 ? '+' : ''}${f(d)}`,
      `${f(x.writes.highUsd)} $${f(x.writesBudget)}`,
    ].join(' | '),
  );
}

console.log('\nDefault budgets that change, main -> head:');
for (const x of rows) if (x.headBudget !== x.mainBudget) console.log(`  ${x.profile} [${x.keys}; ${flagStr(x.flags)}] ${x.config}: $${f(x.mainBudget)} -> $${f(x.headBudget)} (high ${f(x.main.highUsd)} -> ${f(x.head.highUsd)})`);

console.log('\nHigh-end model calls by configuration, main -> head (every profile and key set):');
for (const r of PROTOCOL_CONFIGS) {
  const mine = rows.filter((x) => x.config === r.id);
  const pairs = new Set(mine.map((x) => `${x.main.modelCalls.low}-${x.main.modelCalls.high} -> ${x.head.modelCalls.low}-${x.head.modelCalls.high}`));
  console.log(`  ${r.id}: ${[...pairs].join(' / ')}`);
}

console.log('\nOne Gemini image (advisor estimate: the per-image price, 300 prompt tokens, and the planned output tokens):');
for (const [name, table] of [['main', mainPrices], ['head', headPrices]] as const) {
  const row = table.find((r: any) => r.model === 'gemini-nano-banana-2.1');
  const each = (row.perImageUsd ?? 0) + (300 * row.inputPerMTok + (row.estimatedOutputTokensPerImage ?? 0) * row.outputPerMTok) / 1e6;
  console.log(`  ${name}: $${each.toFixed(5)}; 12 boards $${(12 * each).toFixed(4)}`);
}

console.log('\nDefault budgets where planning OpenAI writes would change them (head vs head with writes planned):');
for (const x of rows) if (x.writesBudget !== x.headBudget) console.log(`  ${x.profile} [${x.keys}; ${flagStr(x.flags)}] ${x.config}: $${f(x.headBudget)} -> $${f(x.writesBudget)} (high ${f(x.head.highUsd)} -> ${f(x.writes.highUsd)})`);
