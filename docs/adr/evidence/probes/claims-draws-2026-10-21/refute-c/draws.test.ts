import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
const h = vi.hoisted(() => ({ respond: undefined as undefined | ((name: string, input: unknown) => Promise<unknown>) }));
vi.mock('../../packages/runner/src/workflow/acts.ts', () => {
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: unknown) => h.respond!(name, input) });
  return { quick: group(), model: group(), media: group() };
});
const { judgeVariants, respond, drawLog } = await import('./claims-oracle/oracle.ts');
const { generateVariants } = await import('./claims-oracle/variants.ts');
h.respond = respond;
const TRIES = Number(process.env.CLAIMS_ORACLE_TRIES ?? 3000);
const SEEDS = Number(process.env.CLAIMS_ORACLE_SEEDS ?? 1);
const RUNS = Number(process.env.CLAIMS_ORACLE_RUNS ?? 12);
const seedOf = (k: number) => 9100003 + k * 130363;
it('draws', async () => {
  const seen = new Set<string>();
  const corpus: any[] = [];
  for (let k = 1; k <= SEEDS; k++)
    for (const v of generateVariants(TRIES, seedOf(k)).variants) {
      const key = `${v.nearest}|${JSON.stringify(v.recipe)}`;
      if (!seen.has(key)) { seen.add(key); corpus.push(v); }
    }
  const report = await judgeVariants(corpus, { runs: RUNS, seedNote: 'prompt', rendered: true });
  writeFileSync(process.env.DRAWS_OUT!, JSON.stringify({ variants: corpus.length, nearest: corpus.map((v) => v.nearest), drawLog, problems: Object.fromEntries(Object.entries(report.problems).map(([k, p]) => [k, { count: p.count, variants: p.variants }])) }));
}, 3_600_000);
