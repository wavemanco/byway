/**
 * The run's inputs stored once (P2). Runner.start writes the brief (its text, fields and attachments) as one JSON file in
 * the content-addressed store before it starts the run's workflow, and the workflow, and so every step, carries only
 * the file's id: a brief of a million characters no longer rides in the start input and in every activity input, where
 * Temporal refuses one value over 2 MB. A start sent twice stores the same bytes under the same id and still starts
 * one run. A step that fills the problem slot reads the brief once, by its id (ArtifactReader); a brief whose file is
 * gone (a partial restore) fails the step with a plain message, at once.
 *
 * The real store; a stand-in Temporal client that keeps what it is asked to start, as Temporal does (a second start of
 * a running id fails with WorkflowExecutionAlreadyStartedError).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowExecutionAlreadyStartedError, type Client } from '@temporalio/client';
import type { ProblemBrief, StartRunInput } from '@byway/contracts';
import { problemSlot } from '@byway/prompts/pure';
import { artifactPath } from '@byway/store';
import { StepError, toFailure } from '../src/activities/failures.ts';
import { ArtifactReader, buildPrompt } from '../src/activities/prompting.ts';
import { createRunnerClient } from '../src/client.ts';
import { BRIEF_MEDIA_TYPE, briefFile, readBrief } from '../src/stored-inputs.ts';
import { FAILURE, type RunInput, type StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';
import { tiny } from './helpers/recipes.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-inputs-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Temporal's side, as far as starting goes: what each start asked for, and one execution per workflow id. */
function temporal() {
  const attempts: RunInput[] = [];
  const started = new Set<string>();
  const client = {
    workflow: {
      async start(workflowType: string, o: { workflowId: string; args: [RunInput] }) {
        attempts.push(o.args[0]);
        if (started.has(o.workflowId)) throw new WorkflowExecutionAlreadyStartedError('Workflow execution already started', o.workflowId, workflowType);
        started.add(o.workflowId);
        return { workflowId: o.workflowId };
      },
    },
  } as unknown as Client;
  return { client, attempts, started };
}

/** A brief with every field a brief has, in German, with an attachment. */
const BRIEF: ProblemBrief = {
  text: 'Ein Faltblatt für die Bäckerei an der Ecke',
  deliverable: 'A flyer',
  audience: 'Neighbours who walk past before seven',
  constraints: ['One page', 'No prices'],
  attachments: [{ name: 'notes.md', text: '# Notes\n\nWe open at six; the rye sells out first.\n' }],
};

const input = (over: Partial<StartRunInput> = {}): StartRunInput => ({ workspaceId, recipe: tiny, problem: BRIEF, profileId: 'demo', budgetUsd: 2, ...over });

describe('Runner.start stores the brief once and starts the workflow with its id (P2)', () => {
  it('writes the brief, its fields and its attachments as one JSON file; the start input holds the file’s id, never the brief', async () => {
    const t = temporal();
    await createRunnerClient({ client: t.client, store }).start(input());
    const [args] = t.attempts;
    expect(args).not.toHaveProperty('problem');
    const file = await store.artifacts.get(args!.problemId);
    expect(file.record.mediaType).toBe(BRIEF_MEDIA_TYPE);
    expect(readBrief(new TextDecoder().decode(file.bytes))).toEqual(BRIEF);
    const sent = JSON.stringify(args);
    for (const piece of [BRIEF.text, BRIEF.audience!, 'the rye sells out first']) expect(sent).not.toContain(piece);
  });

  it('a start sent twice stores the same bytes under the same id, and starts one run', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    const runId = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
    const first = await runner.start(input({ runId }));
    expect(await runner.start(input({ runId }))).toEqual(first);
    expect(t.attempts).toHaveLength(2);
    expect(t.attempts[0]!.problemId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(t.attempts[1]!.problemId).toBe(t.attempts[0]!.problemId);
    expect(t.started.size).toBe(1);
    expect(await store.listRuns(workspaceId)).toHaveLength(1);
  });

  it('the same brief written with its fields in another order is the same file', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    const reordered = { attachments: BRIEF.attachments!.map((a) => ({ text: a.text, name: a.name })), constraints: BRIEF.constraints, audience: BRIEF.audience, deliverable: BRIEF.deliverable, text: BRIEF.text } as ProblemBrief;
    await runner.start(input());
    await runner.start(input({ problem: reordered }));
    expect(briefFile(reordered)).toBe(briefFile(BRIEF));
    expect(t.attempts[0]!.problemId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(t.attempts[1]!.problemId).toBe(t.attempts[0]!.problemId);
  });
});

describe('a step reads the brief by its id (P2)', () => {
  const draft: StepSpec = { id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true };
  const critic: StepSpec = { id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] };

  it('a step that fills the problem slot reads the brief once, however many prompts it builds; a step that does not never reads it', async () => {
    const problemId = await storeBrief(store.artifacts, BRIEF);
    const getText = vi.spyOn(store.artifacts, 'getText');
    const reads = () => getText.mock.calls.filter(([id]) => id === problemId).length;
    // A critic's shuffles build one prompt each, on one reader (model-step.ts).
    const reader = new ArtifactReader({ store });
    for (let i = 0; i < 3; i++) expect((await buildPrompt(reader, { medium: 'prose', problemId, step: draft, ports: {} })).slots.problem).toBe(problemSlot(BRIEF));
    expect(reads()).toBe(1);
    expect((await buildPrompt(new ArtifactReader({ store }), { medium: 'prose', problemId, step: critic, ports: {} })).slots.problem).toBeUndefined();
    expect(reads()).toBe(1);
  });

  it('a brief whose file is gone (a partial restore) fails the step plainly and for good, whether its record is there or not', async () => {
    const lost = await storeBrief(store.artifacts, BRIEF);
    rmSync(artifactPath(dir, lost));
    const never = `sha256:${'0'.repeat(64)}`;
    for (const problemId of [lost, never]) {
      const failed = await buildPrompt(new ArtifactReader({ store }), { medium: 'prose', problemId, step: draft, ports: {} }).catch((e: unknown) => e);
      expect(failed).toBeInstanceOf(StepError);
      expect((failed as Error).message).toBe(
        `The brief this run started with cannot be read: its file (${problemId}) is missing or damaged in byway's data folder, perhaps from a partial restore (see "Back up and restore" in the README). Start the run again.`,
      );
      // A StepError is not retried (failures.ts): reading again finds the same nothing.
      expect(toFailure(failed)).toMatchObject({ type: FAILURE.step, nonRetryable: true });
    }
  });
});
