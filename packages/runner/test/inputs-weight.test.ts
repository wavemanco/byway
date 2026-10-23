/**
 * What the engine carries for a run with the largest brief the web accepts (P2), weighed as limits-batch.test.ts weighs
 * batches: as JSON, the payload Temporal carries. Before, the brief rode in the start input and in every activity input,
 * so a brief of a million characters (about 3 MB of Chinese) made a start input over Temporal's 2 MB limit on one value,
 * and a seeded fan-out over its 4 MB limit on one batch. Now the start input holds the recipe and short ids, and every
 * input the interpreter schedules holds the brief's id, never the brief, and stays under a fixed size. So with the
 * person's own inputs: a fixed copy deck, an author's draft and their own tell catalog travel as their files' ids.
 *
 * The start input is the one Runner.start sends (a stand-in Temporal client keeps it; the real store). The real
 * Interpreter then runs the catalog recipe on it with every activity answered at once by a stand-in, and every input
 * it hands an activity is kept; a question's input is the one `ask` would send (openCheckpoint's: the run, the call,
 * the checkpoint and what the activity computes the first text from).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@temporalio/client';
import { c1, c1h, c2, c3 } from '@byway/catalog';
import type { CheckpointOption, ProblemBrief, StartRunInput } from '@byway/contracts';
import { labelOf } from '@byway/prompts/pure';
import type { Recipe } from '@byway/recipe';
import { createRunnerClient } from '../src/client.ts';
import type { RunInput } from '../src/types.ts';
import { briefPieces, chinese, maximalBrief, piecesOf } from './helpers/briefs.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const seen = vi.hoisted(() => ({ inputs: [] as { name: string; input: unknown }[], n: 0 }));

const hex = (n: number) => n.toString(16).padStart(64, '0');
/** A web page's view at its largest: desktop and mobile at their 8 tiles each, and the first screen (limits-batch.test.ts). */
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
  type Input = { run?: { medium: string }; step?: { role: string }; kind?: string; ports?: { options?: string[] }; artifactIds?: string[]; pool?: boolean };
  const respond = (name: string, input: Input): unknown => {
    const id = `sha256:${hex(++seen.n)}`;
    switch (name) {
      case 'modelStep': {
        const role = input.step?.role;
        if (role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'score', value: 10 } };
        if (role === 'check') return { costUsd: 0, text: 'No defects.', clean: true };
        if (role === 'judge' || role === 'select') return { costUsd: 0, label: 'A' };
        if (role === 'dedupe') return { costUsd: 0, keepLabels: (input.ports?.options ?? []).map((_, i) => labelOf(i)) };
        if (role === 'tells-sweep') return { costUsd: 0, text: '- "synergy"', hits: [{ pattern: 'synergy', where: 'the first line', alternative: 'say what they do together' }] };
        if (role === 'overlap' || role === 'vision' || role === 'cut') return { costUsd: 0, text: '- a note' };
        if (role === 'tells-compare') return { costUsd: 0, keep: 'B' };
        // 01 SEED seed_shape: 48 base64url characters, as the runner makes them.
        return { costUsd: 0, artifactId: id, ...(role === 'seed' ? { seed: 'S'.repeat(48) } : {}) };
      }
      case 'renderView':
        // A web page is seen in screenshots, at their most; any other work as a text rendering.
        return { costUsd: 0, view: { pool: !!input.pool, items: (input.artifactIds ?? []).map((_, i) => (input.run?.medium === 'web-page' ? pageView(seen.n * 10 + i) : { textArtifactId: `sha256:${hex(seen.n * 10 + i)}`, imageArtifactIds: [] })) } };
      case 'finishHumanStep':
        return { costUsd: 0, text: '- Warmer, please.', ...(input.kind === 'write' ? { artifactId: id } : {}) };
      case 'assetStep':
      case 'relayLink':
        return { costUsd: 0 };
      case 'rerank':
        return { costUsd: 0, index: 0 };
      default:
        return undefined;
    }
  };
  const call = (name: string) => async (input: never) => {
    seen.inputs.push({ name, input });
    return respond(name, input);
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => call(name) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-weight-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));

/** What a person answers: yes to every question, the first options to a pick or a choice, every hit to swap. */
const answer = (spec: { kind: string; options?: CheckpointOption[]; k?: number }) => ({
  checkpointId: 'cp',
  approved: true,
  choice: (spec.options ?? []).slice(0, spec.kind === 'select' ? undefined : (spec.k ?? 1)).map((o) => o.id),
  text: spec.kind === 'directive' ? '- Remove the second call to action.' : 'Words of the person.',
});

/** Start `recipe` as Runner.start starts it, then run it on the start input; what the start and every activity were handed. */
async function carried(recipe: Recipe, over: Partial<StartRunInput>): Promise<{ start: RunInput; inputs: { name: string; input: unknown }[] }> {
  const starts: RunInput[] = [];
  const client = { workflow: { start: async (_type: string, o: { args: [RunInput] }) => void starts.push(o.args[0]) } } as unknown as Client;
  await createRunnerClient({ client, store }).start({ workspaceId, recipe, problem: { text: 'x' }, profileId: 'balanced', budgetUsd: 50, ...over });
  const start = starts[0]!;
  seen.inputs = [];
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(start, control as never);
  Object.assign(engine, {
    ask: async (call: unknown, spec: { kind: string; options?: CheckpointOption[]; k?: number }, extra: object = {}) => {
      seen.inputs.push({ name: 'openCheckpoint', input: { run: (engine as unknown as { run: unknown }).run, call, checkpoint: { id: 'cp', ...spec }, ...extra } });
      return answer(spec);
    },
  });
  const ports = await engine.runStages();
  // It ran to its end, with work: the draft it delivers, or (C1h, a study recipe) the drafts it ends with.
  expect(ports.artifact ?? ports.options?.[0]).toBeDefined();
  return { start, inputs: seen.inputs };
}

/**
 * The most a step's input may weigh in these runs: its run's facts and call, its step, and its ports by reference (the
 * work's id, up to twelve options with their views, the notes, and the person's short words). The heaviest measured
 * was about 6.5 KB (C1's final defect check, whose ports still hold the four drafts with their screenshots; measured
 * on 2026-10-22); before P2 each input weighed the brief's 3 MB and more.
 */
const STEP_INPUT_BYTES = 16 * 1024;

describe('a run with the largest brief the web accepts carries its id, never the brief, nor the person’s own inputs (P2)', () => {
  const brief: ProblemBrief = maximalBrief();
  /** The person's own inputs, each 100,000 characters of Chinese of its own. */
  const own = { voice: chinese(100_000, 11), draft: chinese(100_000, 13), tells: chinese(100_000, 17) };
  const pieces = [...briefPieces(brief), ...Object.values(own).flatMap(piecesOf)];
  /** Whether a value holds a piece of the brief or of one of the person's own inputs. */
  const carries = (v: unknown) => pieces.some((p) => JSON.stringify(v).includes(p));

  it.each([
    ['C1 on a web page', c1, {}],
    ['C1 with its own tell catalog', c1, { inputs: { tells: own.tells } }],
    ['C1h with a fixed copy deck and its own tell catalog', c1h, { inputs: { voice: own.voice, tells: own.tells } }],
    ['C2 on options', c2, {}],
    ['C3 from the author’s own draft', c3, { inputs: { draft: own.draft, tells: own.tells }, routes: { draft: 'own' } }],
  ] as [string, Recipe, Partial<StartRunInput>][])('%s: the start input is the recipe and short ids, and every step input stays small', async (_name, recipe, over) => {
    expect(bytes(brief)).toBeGreaterThan(3_000_000);
    const { start, inputs } = await carried(recipe, { problem: brief, ...over });
    expect(Object.keys(start.inputs).sort()).toEqual(Object.keys(over.inputs ?? {}).map((k) => `${k}Id`).sort());
    expect(carries(start)).toBe(false);
    expect(bytes(start) - bytes(recipe)).toBeLessThan(1024);
    expect(inputs.length).toBeGreaterThan(20);
    for (const { name, input } of inputs) {
      expect(carries(input), name).toBe(false);
      expect(bytes(input), name).toBeLessThan(STEP_INPUT_BYTES);
      const run = (input as { run?: { problemId?: string; voiceId?: string } }).run;
      if (run) expect(run.problemId, name).toBe(start.problemId);
      // The deck reaches the steps as the run's (held-voice.ts withDeck reads it).
      if (run) expect(run.voiceId, name).toBe(start.inputs.voiceId);
    }
    // The ids reach the steps that read them: the sweep's catalog, and the question that starts from the draft.
    const handed = (name: string, pick: (i: Record<string, any>) => unknown) => inputs.filter((i) => i.name === name).map((i) => pick(i.input as Record<string, any>));
    if (over.inputs?.tells) expect(handed('modelStep', (i) => i.tellsId)).toContain(start.inputs.tellsId);
    if (over.inputs?.draft) expect(handed('openCheckpoint', (i) => i.initial?.draftId)).toContain(start.inputs.draftId);
  });
});
