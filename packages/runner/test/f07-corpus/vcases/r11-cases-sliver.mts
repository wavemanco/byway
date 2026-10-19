const find = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const k = o.findIndex((l) => re.test(l)); return k < 0 ? undefined : o.map((l, j) => (j === k ? f(l) : l)); };
const card = (h: number) => `<div style="display:grid;grid-template-columns:repeat(3,280px);gap:24px;font:16px/24px system-ui,sans-serif">
<div style="border:1px solid #ddd;border-radius:12px;padding:20px"><h3 style="margin:0 0 8px">Country loaf</h3><p style="margin:0;height:${h}px;overflow:hidden">Our everyday bread with a crackling crust and an open, tangy crumb, baked before dawn.</p></div>
<div style="border:1px solid #ddd;border-radius:12px;padding:20px"><h3 style="margin:0 0 8px">Seeded rye</h3><p style="margin:0;height:${h}px;overflow:hidden">Dense, dark and full of sunflower, flax and pumpkin seeds.</p></div>
</div>`;
const add = ' Slice it thin, toast it, and finish with salted butter.';
const TW = `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11/dist/index.global.js"></script><section class="max-w-5xl mx-auto py-16 px-6"><div class="grid grid-cols-3 gap-6">
<article class="bg-white rounded-2xl p-6 shadow"><h3 class="text-xl font-semibold mb-2">Country loaf</h3><p class="h-20 overflow-hidden text-base">Our everyday bread: a crackling crust and an open, tangy crumb.</p><a href="/order" class="mt-4 inline-block text-amber-700 font-medium">Order</a></article>
<article class="bg-white rounded-2xl p-6 shadow"><h3 class="text-xl font-semibold mb-2">Seeded rye</h3><p class="h-20 overflow-hidden text-base">Dense, dark and full of sunflower, flax and pumpkin seeds.</p><a href="/order" class="mt-4 inline-block text-amber-700 font-medium">Order</a></article>
</div></section>`;
export const CASES = [
  { name: 'r9 repro 20px box', html: '<div style="height:20px;overflow:hidden;width:220px">Fresh bread baked every single morning by hand in the oven</div>', edit: find(/^Fresh/, (l) => l) },
  { name: 'card 80 lengthen', html: card(80), edit: find(/^Our everyday/, (l) => l + add) },
  { name: 'card 76 lengthen', html: card(76), edit: find(/^Our everyday/, (l) => l + add) },
  { name: 'card 72 lengthen', html: card(72), edit: find(/^Our everyday/, (l) => l + add) },
  { name: 'card 80 short edit', html: card(80), edit: find(/^Dense/, (l) => l.replace('Dense', 'Heavy')) },
  { name: 'tw h-20 one sentence longer', html: TW, edit: find(/^Our everyday/, (l) => `${l} Baked before dawn, every day.`) },
  { name: 'tw h-20 two sentences longer', html: TW, edit: find(/^Dense, dark/, (l) => `${l} Slice it thin and toast it. Best with salted butter and honey.`) },
  { name: 'tw h-20 small edit', html: TW, edit: find(/^Dense, dark/, (l) => l.replace('Dense', 'Heavy')) },
];
