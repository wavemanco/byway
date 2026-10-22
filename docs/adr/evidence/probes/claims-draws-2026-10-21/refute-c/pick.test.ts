import { appendFileSync } from 'node:fs';
import { it, vi } from 'vitest';
const h = vi.hoisted(() => ({ respond: undefined as undefined | ((name: string, input: unknown) => Promise<unknown>) }));
vi.mock('../../packages/runner/src/workflow/acts.ts', () => {
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: unknown) => h.respond!(name, input) });
  return { quick: group(), model: group(), media: group() };
});
const { judgeVariants, respond } = await import('./claims-oracle/oracle.ts');
const { generateVariants } = await import('./claims-oracle/variants.ts');
h.respond = respond;
const seedOf = (k: number) => 9100003 + k * 130363;
it('pick', async () => {
  const seen = new Set<string>(); const corpus: any[] = [];
  for (let k = 1; k <= 5; k++) for (const v of generateVariants(40000, seedOf(k)).variants) { const key = `${v.nearest}|${JSON.stringify(v.recipe)}`; if (!seen.has(key)) { seen.add(key); corpus.push(v); } }
  for (const pick of [2502, 2677]) {
    const v = corpus[pick];
    const reps = Array.from({ length: 2700 }, () => v);
    // idx = pick reproduces the measurement's seed for this variant; the other 59 indices give 59 other seeds
    const rep = await judgeVariants(reps.slice(0, Math.max(pick + 1, 0)).length > 2600 ? reps : reps, { runs: 12, seedNote: 'prompt', rendered: true });
    const vs = rep.problems['E-REACT-CLAIM-BUT-NEVER-SHOWN']?.variants ?? [];
    appendFileSync(process.env.PICK_OUT!, JSON.stringify([process.env.OLD_LCG === '1' ? 'old' : 'new', pick, v.nearest, 'seeds judged', reps.length, 'never-shown at', vs.length, 'seeds; at the measurement seed?', vs.includes(pick), 'sometimes', rep.problems['E-REACT-SOMETIMES-NOT-SHOWN(info)']?.variants.length ?? 0, 'claims', rep.stats.claimed.reactedTo]) + String.fromCharCode(10));
  }
}, 3_600_000);
