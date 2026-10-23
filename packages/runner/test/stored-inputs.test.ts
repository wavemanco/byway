/**
 * The run's inputs stored once (P2). Runner.start writes the brief (its text, fields and attachments) as one JSON file in
 * the content-addressed store before it starts the run's workflow, and the workflow, and so every step, carries only
 * the file's id: a brief of a million characters no longer rides in the start input and in every activity input, where
 * Temporal refuses one value over 2 MB. A start sent twice stores the same bytes under the same id and still starts
 * one run. A step that fills the problem slot reads the brief once, by its id (ArtifactReader); a brief whose file is
 * gone (a partial restore) fails the step with a plain message, at once.
 *
 * The person's own inputs go the same way: the fixed copy deck, the author's draft and their own tell catalog are each
 * stored as a text file, and the start input holds their ids beside the references (already ids). The question that
 * starts from the draft reads it by its id. (The deck's readers, the voice slot and the keepsVoice check, are driven in
 * held-voice-writers.test.ts; the tells' sweep in e2e/text-media.ts.)
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
import { openCheckpoint } from '../src/activities/human.ts';
import { ArtifactReader, buildPrompt } from '../src/activities/prompting.ts';
import { createRunnerClient } from '../src/client.ts';
import { BRIEF_MEDIA_TYPE, briefFile, INPUT_MEDIA_TYPE, readBrief, unreadableInput } from '../src/stored-inputs.ts';
import { FAILURE, type RunInput, type RunRef, type StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
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

describe('Runner.start stores the copy deck, the draft and the tell catalog once, and the steps read them by id (P2)', () => {
  const DECK = 'Headline: Bread before seven\nTagline: Your rye, still warm';
  const DRAFT = '# What the river kept\n\nMara counted the boats each morning.\n';
  const TELLS = '- "synergy" → say what the teams do together';

  it('stores each as a text file; the start input holds their ids beside the references, and none of the texts', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    const refs = [(await store.artifacts.putText('# An example\n', 'text/markdown')).id];
    const runId = '2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d';
    const own = { inputs: { refs, voice: DECK, draft: DRAFT, tells: TELLS }, runId };
    await runner.start(input(own));
    const { inputs } = t.attempts[0]!;
    expect(Object.keys(inputs).sort()).toEqual(['draftId', 'refs', 'tellsId', 'voiceId']);
    expect(inputs.refs).toEqual(refs);
    for (const [id, text] of [[inputs.voiceId, DECK], [inputs.draftId, DRAFT], [inputs.tellsId, TELLS]] as const) {
      const file = await store.artifacts.get(id!);
      expect(file.record.mediaType).toBe(INPUT_MEDIA_TYPE);
      expect(new TextDecoder().decode(file.bytes)).toBe(text);
    }
    const sent = JSON.stringify(t.attempts[0]);
    for (const piece of ['Bread before seven', 'Mara counted', 'synergy']) expect(sent).not.toContain(piece);
    // Sent twice: the same files, under the same ids.
    await runner.start(input(own));
    expect(t.attempts[1]!.inputs).toEqual(inputs);
  });

  it('an empty text is no input, as when the texts travelled', async () => {
    const t = temporal();
    await createRunnerClient({ client: t.client, store }).start(input({ inputs: { voice: '', draft: '', tells: '' } }));
    expect(t.attempts[0]!.inputs).toEqual({});
  });

  it('a start whose own input cannot be stored leaves no run behind and starts nothing', async () => {
    const t = temporal();
    // Half of a surrogate pair: UTF-8 cannot hold it, so the store refuses the file.
    const broken = await createRunnerClient({ client: t.client, store }).start(input({ inputs: { draft: `${DRAFT}\uD800` } })).catch((e: unknown) => e);
    expect(broken).toMatchObject({ code: 'invalid' });
    expect(await store.listRuns(workspaceId)).toEqual([]);
    expect(t.attempts).toEqual([]);
  });

  it('the question that starts from the author’s draft reads it by its id; a draft whose file is gone fails the step plainly', async () => {
    const run = await store.createRun({ id: 'run-own-draft', workspaceId, recipeId: 'c3', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
    const ref: RunRef = { runId: run.id, workspaceId, recipeId: 'c3', profileId: 'demo', medium: 'prose', problemId: await storeBrief(store.artifacts, BRIEF), seeds: [] };
    const deps = { store, prompts: fakePrompts(), gateway: {} as never };
    const ask = (n: number, draftId: string) =>
      openCheckpoint(deps, { run: ref, call: { key: `${run.id}/own-draft/-/${n}`, stepId: 'own-draft', stage: 'D2' }, checkpoint: { id: `${run.id}/cp${n}-own-draft`, kind: 'write', prompt: 'Write your draft.' }, initial: { from: 'draft', draftId } });
    const draftId = (await store.artifacts.putText(DRAFT, INPUT_MEDIA_TYPE)).id;
    expect((await ask(1, draftId)).initialText).toBe(DRAFT);
    const never = `sha256:${'0'.repeat(64)}`;
    const failed = await ask(2, never).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(StepError);
    expect((failed as Error).message).toBe(unreadableInput('draft', never));
    expect((failed as Error).message).toMatch(/^The draft this run started with cannot be read: its file \(sha256:0{64}\) is missing or damaged/);
  });
});
