/**
 * The agreement test (spec §3.3: the prompts, the runner's parsers and the mock provider must agree exactly). Each of
 * the eight protocol configurations runs end to end on the local Temporal test server with the REAL templates of
 * @byway/prompts and the real gateway in demo mode (its mock provider: no keys, no network), every checkpoint answered
 * automatically. Each run must show that:
 * - every prompt rendered: no template asked for a slot the runner did not fill;
 * - every answer parsed the first time: no parse retries (the demo answers are built to the contracts);
 * - every completion's ledger entry names its template (id, version, hash, fidelity), in an intact hash chain;
 * - the run reached 'done' with an output artifact;
 * - every event maps to a step of the recipe's presentation (presentedStepFor), as the app's timeline needs.
 * The configurations whose critics run in GREAT mode run twice: with references (GREAT, ranked blind) and without
 * (the OK fallback of ADR-0071), so both branches of their templates are rendered.
 */
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { c4, PROTOCOL_CONFIGS } from '@byway/catalog';
import type { CompletionRequest, Medium } from '@byway/contracts';
import { createPromptRenderer } from '@byway/prompts';
import type { Node, Recipe } from '@byway/recipe';
import { buildWorkflows, DEFAULT_WORKFLOWS_BUNDLE } from '../src/build.ts';
import { createRunnerClient } from '../src/client.ts';
import { createWorker } from '../src/worker.ts';
import { checkEvents, ofType } from './helpers/events.ts';
import { png } from './helpers/fake-pages.ts';
import { createHarness, type Harness } from './helpers/harness.ts';

const library = createPromptRenderer();
let h: Harness;

beforeAll(async () => {
  h = await createHarness({ prompts: library });
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const PROBLEMS: Record<string, string> = {
  c1: 'A landing page for a neighborhood bakery that delivers sourdough before 7am',
  c2: 'Positioning options for a bike repair subscription',
  c3: 'A newsletter piece on teaching fractions with recipes',
  c4: 'A status memo for leadership on the billing migration, 3 weeks in',
  c5: 'A 15-second video ad for a reusable coffee cup',
  c6: 'A personal statement for a design residency application',
  c6a: 'A short story about a lighthouse keeper who counts boats',
  c7: 'Trim this agent-written refactor of the invoice formatter',
};

/** Whether any step of the recipe is a GREAT-mode critic (it takes references). */
function hasGreatCritic(n: Node): boolean {
  switch (n.op) {
    case 'step':
      return n.role === 'critic' && n.knobs?.mode === 'GREAT';
    case 'seq':
      return n.steps.some(hasGreatCritic);
    case 'replicate':
    case 'each':
    case 'loop':
    case 'optional':
    case 'gate':
    case 'relay':
      return hasGreatCritic(n.body);
    case 'route':
      return n.branches.some((b) => hasGreatCritic(b.body));
    case 'audit':
      return n.lenses.some((l) => hasGreatCritic(l.body));
    case 'pick':
      return n.judge ? hasGreatCritic(n.judge) : false;
  }
}

/** Four references in the medium, the way a person would bring them. */
async function references(medium: Medium): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= 4; i++) {
    switch (medium) {
      case 'prose':
        ids.push((await h.store.artifacts.putText(`# Exemplar ${i}\n\nThe decision comes first, in one line. Then the two facts that support it, number ${i}.\n`, 'text/markdown')).id);
        break;
      case 'options': {
        const doc = { options: [{ title: `Prior art ${i}`, pitch: `A known bet, number ${i}.`, rationale: 'It has worked elsewhere.' }] };
        ids.push((await h.store.artifacts.putText(`${JSON.stringify(doc, null, 2)}\n`, 'application/json')).id);
        break;
      }
      case 'media':
        ids.push((await h.store.artifacts.put(png(16, 9, [20 * i, 40, 200 - 20 * i]), 'image/png')).id);
        break;
      case 'code-diff':
        ids.push((await h.store.artifacts.putText(`--- a/src/total${i}.ts\n+++ b/src/total${i}.ts\n@@ -1,3 +1,2 @@\n-const sum = (xs) => xs.reduce((a, b) => a + b, 0);\n-export const total = (xs) => sum(xs);\n+export const total = (xs) => xs.reduce((a, b) => a + b, 0);\n\nWhy: the helper was used once.\n`, 'text/x-diff')).id);
        break;
      case 'web-page':
        ids.push((await h.store.artifacts.putText(`<!doctype html>\n<html><head><title>Exemplar ${i}</title></head><body><h1>Exemplar ${i}</h1></body></html>\n`, 'text/html')).id);
        break;
    }
  }
  return ids;
}

const runs = PROTOCOL_CONFIGS.flatMap((recipe) => (hasGreatCritic(recipe.stages[0]!.body) || recipe.stages.some((s) => hasGreatCritic(s.body)) ? [{ recipe, refs: true }, { recipe, refs: false }] : [{ recipe, refs: false }]));

describe('the real templates, the runner and the demo gateway agree (spec §3.3)', () => {
  it('covers all eight protocol configurations', () => {
    expect(PROTOCOL_CONFIGS.map((r) => r.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c6a', 'c7']);
    expect(new Set(runs.map((r) => r.recipe.id)).size).toBe(8);
  });

  for (const { recipe, refs } of runs) {
    it(`${recipe.id} on ${recipe.medium}${refs ? ', with references (GREAT critics)' : ''}: renders, parses, records provenance and finishes`, async () => {
      await agree(recipe, refs);
    }, 180_000);
  }

  it('a worker given no renderer renders these same templates (the product wiring)', async () => {
    const taskQueue = 'runner-default-prompts';
    // Next to the default bundle, where Temporal's bundler resolves @temporalio/* from the runner's node_modules.
    const outfile = DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows\.js$/, `default-prompts-${process.pid}.js`);
    const worker = await createWorker({ connection: h.env.nativeConnection, taskQueue, gateway: h.gateway, store: h.store, pages: h.pages, workflowsPath: await buildWorkflows({ outfile }) });
    const running = worker.run();
    try {
      const runner = createRunnerClient({ client: h.env.client, store: h.store, taskQueue });
      const run = await runner.start({ workspaceId: h.workspaceId, recipe: c4, problem: { text: PROBLEMS.c4! }, profileId: 'demo', budgetUsd: 50 });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      const prompts = h.ledger(run.id).flatMap((e) => (e.prompt ? [e.prompt] : []));
      expect(prompts.length).toBeGreaterThan(0);
      for (const p of prompts) expect(p.hash).toBe(library.info(p.id, 'prose').hash);
    } finally {
      await worker.shutdown();
      await running.catch(() => undefined);
      rmSync(outfile, { force: true });
    }
  }, 180_000);
});

async function agree(recipe: Recipe, withRefs: boolean): Promise<void> {
  const medium = recipe.medium!;
  const from = { calls: h.prompts.calls.length, failures: h.prompts.failures.length };
  const refs = withRefs ? await references(medium) : [];
  const run = await h.start(recipe, { problem: { text: PROBLEMS[recipe.id]! }, ...(refs.length ? { inputs: { refs } } : {}) });
  const view = await h.drive(run.id, undefined, 150_000);

  // The run finished with something to deliver, and every event belongs to a step the app can show.
  expect(view.run.error, `${recipe.id} failed`).toBeUndefined();
  expect(view.run.status).toBe('done');
  expect(view.run.outputArtifactId).toMatch(/^sha256:[0-9a-f]{64}$/);
  checkEvents(view, recipe.id);

  // Every prompt rendered: no missing slot, no unknown template, nothing left unfilled.
  expect(h.prompts.failures.slice(from.failures)).toEqual([]);
  const renders = h.prompts.calls.slice(from.calls);
  expect(renders.length).toBeGreaterThan(0);
  // (Slot values may hold braces of their own, a page's CSS for one; a template tag looks like {{slot}} or {{#if slot}}.)
  for (const r of renders) expect(r.user, r.id).not.toMatch(/\{\{\s*(?:#if\s+[a-z]+|\/if|else|[a-z]+)\s*\}\}/);

  // Every answer parsed the first time: a retry would carry the failed answer and the problem as extra messages.
  const completions = h.succeeded(run.id).filter((c) => c.kind === 'complete');
  expect(completions.length).toBeGreaterThan(0);
  const retried = completions.filter((c) => (c.request as CompletionRequest).messages.length > 1);
  expect(
    retried.map((c) => {
      const last = (c.request as CompletionRequest).messages.at(-1)!.content[0];
      return `${c.stepId} (${c.purpose}): ${last?.type === 'text' ? last.text : ''}`;
    }),
  ).toEqual([]);

  // Every completion's ledger entry names the template it was rendered from, inside an intact hash chain.
  const entries = h.ledger(run.id).filter((e) => e.kind === 'completion');
  expect(entries).toHaveLength(completions.length);
  for (const e of entries) {
    expect(e.prompt, `${e.stepId} ${e.purpose}`).toBeDefined();
    const info = library.info(e.prompt!.id, medium);
    expect(e.prompt).toEqual({ id: info.id, version: info.version, hash: info.hash, fidelity: info.fidelity });
    expect(e.prompt!.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  }
  for (const c of completions) expect((c.request as CompletionRequest).prompt?.id).toBeDefined();
  expect(await h.gateway.verifyLedger()).toBeNull();

  // Critics: GREAT with references (blind lineup, ranked whole; loops report our rank), OK without.
  const critics = renders.filter((r) => library.info(r.id, medium).output === 'critique');
  for (const c of critics) {
    if (c.slots.refs?.trim()) {
      expect(c.user).toMatch(/\bGREAT\b/);
      expect(c.user).toContain(`There are ${c.slots.refs} references and 1 of ours (${c.slots.labels}).`);
      expect(c.slots.labels).toMatch(/^\d+ items, labelled A–[A-Z]$/);
    } else {
      expect(c.user).not.toMatch(/\bGREAT\b/);
    }
  }
  if (withRefs) expect(critics.some((c) => c.slots.refs?.trim())).toBe(true);
  for (const e of ofType(view, 'loop-iteration')) {
    if (e.data.rank !== undefined) expect(withRefs).toBe(true);
  }

  // Every model step that ran rendered its own template (no helper stood in for it).
  const ran = new Set(ofType(view, 'step-started').map((e) => e.stepId));
  const rendered = new Set(renders.map((r) => r.id));
  for (const s of modelSteps(recipe)) {
    if (ran.has(s.id) && s.prompt && outputOf(s, medium) !== 'none') expect(rendered.has(s.prompt), `${recipe.id} step ${s.id} rendered ${s.prompt}`).toBe(true);
  }
}

/** The recipe's model steps, wherever they sit. */
function modelSteps(recipe: Recipe): Extract<Node, { op: 'step' }>[] {
  const out: Extract<Node, { op: 'step' }>[] = [];
  const walk = (n: Node): void => {
    switch (n.op) {
      case 'step':
        if (n.actor === 'model') out.push(n);
        return;
      case 'seq':
        return n.steps.forEach(walk);
      case 'route':
        return n.branches.forEach((b) => walk(b.body));
      case 'audit':
        return n.lenses.forEach((l) => walk(l.body));
      case 'pick':
        if (n.judge) walk(n.judge);
        return;
      default:
        return walk(n.body);
    }
  };
  recipe.stages.forEach((s) => walk(s.body));
  return out;
}

const outputOf = (s: { prompt?: string }, medium: Medium): string => (s.prompt && library.has(s.prompt) ? library.info(s.prompt, medium).output : 'none');
