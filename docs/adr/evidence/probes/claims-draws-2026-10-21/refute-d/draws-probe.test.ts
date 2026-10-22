import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
const h = vi.hoisted(() => ({ respond: undefined as undefined | ((name: string, input: unknown) => Promise<unknown>) }));
vi.mock('../../packages/runner/src/workflow/acts.ts', () => {
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: unknown) => h.respond!(name, input) });
  return { quick: group(), model: group(), media: group() };
});
const { judgeVariants, respond, drawLog, repLog } = await import('./claims-oracle/oracle.ts');
const { generateVariants } = await import('./claims-oracle/variants.ts');
h.respond = respond;
const TRIES = Number(process.env.P_TRIES ?? 3000);
const SEEDS = Number(process.env.P_SEEDS ?? 1);
const seedOf = (k: number) => 9100003 + k * 130363;
it('counts draws', async () => {
  const seen = new Set<string>(); const corpus: any[] = [];
  for (let k = 1; k <= SEEDS; k++) for (const v of generateVariants(TRIES, seedOf(k)).variants) { const key = `${v.nearest}|${JSON.stringify(v.recipe)}`; if (!seen.has(key)) { seen.add(key); corpus.push(v); } }
  const rep = await judgeVariants(corpus, { runs: 12, seedNote: 'prompt', rendered: true });
  const blocking = Object.keys(rep.problems).filter((k) => !k.endsWith('(info)'));
  writeFileSync(process.env.P_OUT!, JSON.stringify({ n: corpus.length, draws: drawLog, reps: repLog, blocking, problems: Object.fromEntries(Object.entries(rep.problems).map(([k, p]) => [k, { count: p.count, variants: p.variants.slice(0, 20) }])) }));
}, 3_600_000);
