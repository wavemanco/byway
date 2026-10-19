/**
 * The claims oracle (F01; ADR-0092, ADR-0097, ADR-0098): composed variants of the protocol configurations that the
 * advisor admits are run through the real Interpreter with stubbed activities and random answers, and every claim the
 * advisor's explainers (and the run's VOICE wording) make is checked against what ran. The verifiers of the F01
 * semantics work ran it by hand under %TEMP%; this is its port (claims-oracle/oracle.ts and variants.ts say what changed).
 *
 * It is a repo-level check because it spans two layers: the advisor makes the claims and the runner runs the recipe,
 * and neither package may import the other (apps/web/test/guard-boundaries.test.ts). scripts/serve.ts imports the
 * packages the same way.
 *
 * Here it runs the first 3,000 tries of the measured corpus's first seed (118 admitted variants, 6 runs each).
 * The measurement's full size (ADR-0097), 26 seeds of 40,000 tries with 12 runs each: 20,695 admitted variants, the
 * measurement's own count, in about 40 minutes on the owner's machine:
 *
 *   CLAIMS_ORACLE_TRIES=40000 CLAIMS_ORACLE_SEEDS=26 CLAIMS_ORACLE_RUNS=12 pnpm exec vitest run scripts/test/claims-oracle.test.ts
 *
 * Problem kinds marked (info) are what the verifiers recorded as not a false claim (a claim that holds on some runs
 * and not others because the person's random answers differ, say); kinds marked (control) come only from the controls.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { OracleReport } from './claims-oracle/oracle.ts';
import type { Variant } from './claims-oracle/variants.ts';

const h = vi.hoisted(() => ({ respond: undefined as undefined | ((name: string, input: unknown) => Promise<unknown>) }));

/** The Interpreter's activities, stubbed by the oracle. */
vi.mock('../../packages/runner/src/workflow/acts.ts', () => {
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: unknown) => h.respond!(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { judgeVariants, respond } = await import('./claims-oracle/oracle.ts');
const { generateVariants } = await import('./claims-oracle/variants.ts');
const { presentComposed } = await import('../../packages/advisor/src/index.ts');
const { createPromptRenderer } = await import('../../packages/prompts/src/index.ts');
h.respond = respond;

const TRIES = Number(process.env.CLAIMS_ORACLE_TRIES ?? 3000);
const SEEDS = Number(process.env.CLAIMS_ORACLE_SEEDS ?? 1);
const RUNS = Number(process.env.CLAIMS_ORACLE_RUNS ?? 6);
/** The measured corpus's seeds (scratch/ports-rendered/run-gen.sh and run-gen2.sh): 9100003 + k × 130363, k = 1 to 26. */
const seedOf = (k: number) => 9100003 + k * 130363;
const SLOW = { timeout: 3_600_000 };

/** The claims the corpus must exercise, so that a pass means the checks ran. */
const EXERCISED = ['applies', 'tellsApplies', 'tellsAppliesAll', 'swapAsk', 'run-used-prompt', 'run-locked-prompt', 'voiceScriptLocked', 'reactedTo', 'notesOnly', 'personCritique', 'seedFanOut', 'aiWroteRest', 'relayChain', 'relayOne'];

const blocking = (r: OracleReport) => Object.fromEntries(Object.entries(r.problems).filter(([k]) => !k.endsWith('(info)')).map(([k, p]) => [k, p.examples.slice(0, 2)]));
const count = (r: OracleReport, kind: string) => r.problems[kind]?.count ?? 0;

let corpus: Variant[] = [];
let report: OracleReport;

beforeAll(async () => {
  // A variant two seeds both make is judged once, as the measurement merged its seeds' files (merge-pr.cjs).
  const seen = new Set<string>();
  for (let k = 1; k <= SEEDS; k++)
    for (const v of generateVariants(TRIES, seedOf(k)).variants) {
      const key = `${v.nearest}|${JSON.stringify(v.recipe)}`;
      if (!seen.has(key)) {
        seen.add(key);
        corpus.push(v);
      }
    }
  report = await judgeVariants(corpus, { runs: RUNS, seedNote: 'prompt', rendered: true });
}, SLOW.timeout);

describe('the claims oracle (F01)', SLOW, () => {
  it('runs every admitted variant to an end the runner allows, and exercises every kind of claim', () => {
    expect(corpus.length).toBeGreaterThan(50);
    expect(report.stats.variants).toBe(corpus.length);
    expect(Object.keys(report.stats.outcomes).filter((o) => !['done', 'RunFailure', 'RunStopped'].includes(o))).toEqual([]);
    for (const claim of EXERCISED) expect(report.stats.claimed[claim] ?? 0, claim).toBeGreaterThan(0);
  });

  it('finds every claim true on every run (only (info) kinds are reported)', () => {
    expect(blocking(report)).toEqual({});
  });
});

describe('the oracle’s controls: each check fires when its claim is taken as made where it does not hold', SLOW, () => {
  it('FORCE: notes only, the AI wrote the rest, and a locked script', async () => {
    const forced = await judgeVariants(corpus, { runs: RUNS, seedNote: 'prompt', rendered: true, force: true });
    for (const kind of ['D-NOTES-ONLY-BUT-APPLIED', 'C-AI-WROTE-REST-BUT-PERSON-WROTE', 'RUN-LOCK-NOT-IN-LOCKEDSCRIPTS', 'RUN-LOCK-BUT-EXPLAINER-NOT', 'L1-LOCKED-BUT-LATER-PERSON-WRITE']) expect(count(forced, kind), kind).toBeGreaterThan(0);
  });

  it('FORCE_REACT: directions shown to your next VISION', async () => {
    const forced = await judgeVariants(corpus, { runs: RUNS, seedNote: 'prompt', rendered: true, forceReact: true });
    expect(count(forced, 'E-STRICT-FORCED(control)')).toBeGreaterThan(0);
  });

  it('FORCE_J: a person’s list or critique an AI writer takes in', async () => {
    const forced = await judgeVariants(corpus, { runs: RUNS, seedNote: 'prompt', rendered: true, forceJ: true });
    expect(count(forced, 'J-FORCED(control)')).toBeGreaterThan(0);
  });

  it('RENDERED: an applier whose prompt never shows the critique, under the claims made for the recipe before its prompt changed', async () => {
    const prompts = createPromptRenderer();
    const shows = (prompt: string, medium: string) => {
      try {
        return prompts.info(prompt, medium).slots.includes('critique');
      } catch {
        return true;
      }
    };
    /** The first prompt of the library whose template for the medium has no critique slot. */
    const blindPrompt = (medium: string) =>
      prompts.ids().find((id) => {
        try {
          return !prompts.info(id, medium).slots.includes('critique');
        } catch {
          return false;
        }
      });
    // Every AI fix whose prompt shows the critique is given that prompt instead.
    const blind = (recipe: Variant['recipe']) => {
      const changed = structuredClone(recipe);
      let n = 0;
      const visit = (x: Record<string, any>): void => {
        if (x.op === 'step' && x.actor === 'model' && x.role === 'fix' && x.prompt && shows(x.prompt, recipe.medium)) {
          const other = blindPrompt(recipe.medium);
          if (other) {
            x.prompt = other;
            n++;
          }
        }
        for (const c of [...(x.steps ?? []), ...(x.body ? [x.body] : []), ...(x.judge ? [x.judge] : []), ...(x.branches ?? []).map((b: Record<string, any>) => b.body), ...(x.lenses ?? []).map((l: Record<string, any>) => l.body)]) visit(c);
      };
      for (const s of changed.stages) visit(s.body);
      return { changed, n };
    };
    const pairs = corpus.map((v) => ({ v, ...blind(v.recipe) })).filter((p) => p.n > 0);
    expect(pairs.length).toBeGreaterThan(0);
    const claimsBefore = new Map(pairs.map((p) => [p.changed, presentComposed(p.v.recipe as never, { name: 'x', promise: 'x', bestFor: [], code: 'x' })]));
    const forced = await judgeVariants(
      pairs.map((p) => ({ ...p.v, recipe: p.changed })),
      { runs: RUNS, seedNote: 'prompt', rendered: true, present: (r) => claimsBefore.get(r) as never },
    );
    expect(count(forced, 'I-APPLIES-BUT-PROMPT-NEVER-SHOWS')).toBeGreaterThan(0);
  });
});
