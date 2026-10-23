/**
 * The batch-bytes bound (F02, ADR-0092 stage 2) agrees with the interpreter. The real Interpreter runs small fan-outs
 * with every activity held until the test lets it finish, so what it schedules together is seen as Temporal would see
 * it in one workflow task: here every activity in flight finishes in the same task, the worst case. Each batch is
 * weighed as JSON (the payload Temporal carries), and @byway/recipe's workBound must be at least the heaviest, and not
 * far above it: that pins ACTIVITY_BYTES to what the interpreter really sends.
 *
 * The shapes are the ones the verification measured: seeds then a fan-out over them (every seed rides in every later
 * input), a fan-out after options (every branch carries the option list), seeds finishing inside the same fan-out
 * before its later steps are scheduled (replicate(n, seq(seed, X)): the siblings' seeds count too), and B-BoN's nest.
 */
import { describe, expect, it, vi } from 'vitest';
import { each, pick, replicate, seq, step, workBound, type Node, type Recipe, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

const held = vi.hoisted(() => ({ pending: [] as { name: string; input: unknown; release: () => void }[], n: 0 }));

const hex = (n: number) => n.toString(16).padStart(64, '0');
/** A web page's view at its largest: desktop and mobile at their 8 tiles each, and the first screen. */
const pageView = (n: number) => {
  const ids = (surface: string, k: number) => Array.from({ length: k }, (_, i) => `sha256:${hex(n * 100 + i)}${surface.length}`.slice(0, 71));
  const surfaces = [
    { surface: 'desktop', imageArtifactIds: ids('desktop', 8) },
    { surface: 'mobile', imageArtifactIds: ids('mobile', 8) },
    { surface: 'fold', imageArtifactIds: ids('fold', 1) },
  ];
  return { imageArtifactIds: surfaces.flatMap((s) => s.imageArtifactIds), surfaces };
};

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { step?: { role: string }; artifactIds?: string[]; pool?: boolean }): unknown => {
    const n = ++held.n;
    switch (name) {
      case 'modelStep': {
        const role = input.step?.role;
        if (role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'score', value: 10 } };
        if (role === 'judge' || role === 'select') return { costUsd: 0, label: 'A' };
        // 01 SEED seed_shape: 48 base64url characters, as the runner makes them.
        return { costUsd: 0, artifactId: `sha256:${hex(n)}`, ...(role === 'seed' ? { seed: 'S'.repeat(48) } : {}) };
      }
      case 'renderView':
        return { costUsd: 0, view: { pool: !!input.pool, items: (input.artifactIds ?? []).map((_, i) => pageView(n * 10 + i)) } };
      default:
        return undefined;
    }
  };
  // Every activity is held until the test releases its batch.
  const call = (name: string) => (input: never) =>
    new Promise((resolve) => {
      held.pending.push({ name, input, release: () => resolve(respond(name, input)) });
    });
  const group = () => new Proxy({}, { get: (_t, name: string) => call(name) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

const settle = () => new Promise<void>((r) => setImmediate(r));

/** Run a recipe to its end, batch by batch; the bytes of each batch's activity inputs, as JSON. */
async function batches(body: Node): Promise<{ count: number; bytes: number }[]> {
  held.pending = [];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'batches', title: 'Batches', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'web-page', inputs: ['intent'], stages: [{ stage: 'D1', body }], sitsOut: [], exceptions: [], bank: false };
  // A real run id is a UUID; the brief travels as its file's id (P2), whatever the person wrote.
  const input: RunInput = { runId: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b', workspaceId: 'default', recipe, problemId: UNREAD_BRIEF, profileId: 'balanced', budgetUsd: 5, medium: 'web-page', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, { ask: async () => ({ checkpointId: 'cp', approved: true, choice: ['A'] }) });
  let done = false;
  const run = engine.runStages().finally(() => {
    done = true;
  });
  const out: { count: number; bytes: number }[] = [];
  for (;;) {
    await settle();
    if (!held.pending.length) {
      if (done) break;
      continue;
    }
    const batch = held.pending.splice(0);
    out.push({ count: batch.length, bytes: batch.reduce((s, a) => s + Buffer.byteLength(JSON.stringify(a.input)), 0) });
    for (const a of batch) a.release();
  }
  await run;
  return out;
}

const seedStep = (id: string): Step => step({ id, role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt: 'p.seed', consumes: ['intent', 'seed'], produces: ['artifact'], writes: true });
const build = (id: string): Step => step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
const judge = step({ id: 'judge', role: 'judge', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.judge', consumes: ['view'], produces: [] });

const recipeOf = (body: Node): Recipe => ({ schema: 'byway.recipe/1', id: 'batches', title: 'Batches', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'web-page', inputs: ['intent'], stages: [{ stage: 'D1', body }], sitsOut: [], exceptions: [], bank: false });

describe('workBound bounds every batch the interpreter schedules, and not by much', () => {
  it.each([
    ['seeds, then each over them (every seed rides in every later input)', seq(replicate('seeds', 24, seq(seedStep('seed'), render('seed-render'))), each('each', seq(render('r'), critic('c'))))],
    ['a fan-out after options (every branch carries the option list and its views)', seq(replicate('first', 24, seq(build('b1'), render('r1'))), replicate('second', 12, build('b2')))],
    ["seeds finishing inside the same fan-out (replicate(n, seq(seed, X)): the siblings' seeds count)", replicate('x', 24, seq(seedStep('seed'), build('after')))],
    ["B-BoN's nest: a judge over each slot's pool", replicate('slots', 4, seq(replicate('pool', 12, seq(build('b'), render('r'))), pick('choose', 'C', 1, 'model', judge)))],
  ] as [string, Node][])('%s', async (_name, body) => {
    const seen = await batches(body);
    const heaviest = Math.max(...seen.map((b) => b.bytes));
    const bound = workBound(recipeOf(body)).batchBytes;
    expect(bound).toBeGreaterThanOrEqual(heaviest);
    expect(bound, `bound ${bound} vs heaviest batch ${heaviest}`).toBeLessThanOrEqual(2 * heaviest);
  });
});
