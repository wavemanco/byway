import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { ChooserAnswer, ComposeResult, IntakeRecord, Recommendation } from '@byway/contracts';
import { StoreError } from '../src/index.ts';
import { openStore, seedRun, steppingClock } from './helpers.ts';

const answers: ChooserAnswer[] = [
  { questionId: 'decision', answer: false, confidence: 0.8, rationale: 'Nothing points this way.', setBy: 'intake' },
  { questionId: 'visual', answer: true, confidence: 1, rationale: 'You said it is a landing page.', setBy: 'user' },
];

/** The advisor's output is opaque to the store beyond its identifying fields; a realistic shape still round-trips. */
const recommendation = {
  recipeId: 'c1',
  recipeHash: `sha256:${'b'.repeat(64)}`,
  presentation: { recipeId: 'c1', code: 'C1', name: 'Landing Page Studio', promise: 'p', medium: 'web-page', bestFor: [], stages: [] },
  fit: 'strong',
  why: 'It is a landing page.',
  answers,
  label: { verdict: 'Untested', scope: 'Exact', summary: 'Not yet tested.', studies: [] },
  routing: 'untested',
  alternatives: [],
  estimate: { lowUsd: 1, highUsd: 3, modelCalls: { low: 10, high: 40 }, images: { low: 0, high: 9 }, humanMinutes: { low: 5, high: 20 } },
  composeSuggested: false,
  routes: { entry: 'seed' },
} satisfies Recommendation;

const composed = {
  recipe: { schema: 'byway.recipe/1', id: 'composed-1', title: 'Composed', kind: 'composed', family: 'C4', channel: 'workspace', inputs: [], stages: [], sitsOut: [], exceptions: [], bank: true },
  ok: true,
  violations: [],
  nearestRecipeId: 'c4',
  diff: ['Adds a recipient critique for long memos.'],
  label: { verdict: 'Untested', scope: 'Composed', summary: 'Composed — not tested.', studies: [] },
  presentation: { recipeId: 'composed-1', code: 'composed', name: 'Your recipe', promise: 'p', medium: 'prose', bestFor: [], stages: [] },
  estimate: { lowUsd: 0.5, highUsd: 1, modelCalls: { low: 5, high: 9 }, images: { low: 0, high: 0 }, humanMinutes: { low: 5, high: 10 } },
} as unknown as ComposeResult;

describe('intakes', () => {
  it('creates an intake with only a problem, and reads it back unchanged', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    const ws = await store.ensureDefaultWorkspace();
    const created = await store.createIntake({ id: 'in-1', workspaceId: ws.id, problem: { text: 'A landing page for a bakery' } });
    expect(created).toEqual({
      id: 'in-1',
      workspaceId: ws.id,
      problem: { text: 'A landing page for a bakery' },
      createdAt: '2026-10-07T12:00:00.000Z',
      updatedAt: '2026-10-07T12:00:00.000Z',
    });
    expect(await store.getIntake('in-1')).toEqual(created);
    expect(await store.getIntake('missing')).toBeUndefined();
  });

  it('round-trips every field: the full brief, answers, recommendation and composed recipe', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    const input: Omit<IntakeRecord, 'createdAt' | 'updatedAt'> = {
      id: 'in-2',
      workspaceId: ws.id,
      problem: {
        text: 'A memo asking for a two-week pilot',
        deliverable: 'A one-page memo',
        audience: 'Leadership',
        constraints: ['Under 300 words', 'No jargon'],
        attachments: [{ name: 'notes.md', text: '# Notes\n\nRework costs a day a week.' }],
      },
      answers,
      recommendation,
      composed,
    };
    const created = await store.createIntake(input);
    expect(created).toMatchObject(input);
    expect(await store.getIntake('in-2')).toEqual(created);
  });

  it('patches only the fields given, and bumps updatedAt', async () => {
    const store = openStore({ now: steppingClock() });
    const ws = await store.ensureDefaultWorkspace();
    const created = await store.createIntake({ id: 'in-3', workspaceId: ws.id, problem: { text: 'Names for a café' } });
    const withAnswers = await store.updateIntake('in-3', { answers });
    expect(withAnswers).toEqual({ ...created, answers, updatedAt: withAnswers.updatedAt });
    expect(withAnswers.updatedAt > created.updatedAt).toBe(true);
    const withRec = await store.updateIntake('in-3', { recommendation, problem: { text: 'Names for a café in Lisbon' } });
    expect(withRec).toMatchObject({ answers, recommendation, problem: { text: 'Names for a café in Lisbon' }, createdAt: created.createdAt });
    const unchanged = await store.updateIntake('in-3', { composed: undefined });
    expect(unchanged).toEqual({ ...withRec, updatedAt: unchanged.updatedAt });
    expect(await store.getIntake('in-3')).toEqual(unchanged);
  });

  it('refuses an unknown intake, workspace or duplicate id with the store errors', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    await expect(store.updateIntake('nope', { answers })).rejects.toMatchObject({ code: 'not-found', message: expect.stringMatching(/no intake "nope"/) });
    await expect(store.createIntake({ id: 'x', workspaceId: 'nope', problem: { text: 'p' } })).rejects.toMatchObject({ code: 'not-found' });
    await store.createIntake({ id: 'dup', workspaceId: ws.id, problem: { text: 'p' } });
    await expect(store.createIntake({ id: 'dup', workspaceId: ws.id, problem: { text: 'p' } })).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('validates what it writes: the problem, the answers and the advisor results', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    const make = (extra: object) => store.createIntake({ id: 'bad', workspaceId: ws.id, problem: { text: 'p' }, ...extra } as never);
    await expect(make({ problem: { text: '   ' } })).rejects.toThrow(/problem/);
    await expect(make({ problem: 'just a string' })).rejects.toThrow(/problem/);
    await expect(make({ problem: { text: 'p', constraints: 'one' } })).rejects.toThrow(/constraints/);
    await expect(make({ answers: [{ ...answers[0], confidence: 1.5 }] })).rejects.toThrow(/confidence/);
    await expect(make({ answers: [{ ...answers[0], setBy: 'robot' }] })).rejects.toThrow(/setBy/);
    await expect(make({ recommendation: { why: 'no recipe' } })).rejects.toThrow(/recommendation/);
    await expect(make({ composed: { recipe: 'not an object', ok: true } })).rejects.toThrow(/composed/);
    await expect(make({ id: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.updateIntake('bad', { workspaceId: 'other' } as never)).rejects.toMatchObject({ code: 'invalid' });
    expect(await store.getIntake('bad')).toBeUndefined();
  });

  it('checks the stored JSON on read, so a damaged row fails loudly instead of reaching the app', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    await store.createIntake({ id: 'in-4', workspaceId: ws.id, problem: { text: 'A memo' }, answers });
    const db = new DatabaseSync(store.dbPath);
    try {
      db.prepare(`UPDATE intakes SET answers = '[{"questionId":"q"}]' WHERE id = 'in-4'`).run();
    } finally {
      db.close();
    }
    const read = store.getIntake('in-4');
    await expect(read).rejects.toBeInstanceOf(StoreError);
    await expect(store.getIntake('in-4')).rejects.toMatchObject({ code: 'corrupt', message: expect.stringMatching(/intake "in-4"/) });
  });

  it('records the intake a run started from, in the same workspace only', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    await store.createIntake({ id: 'in-5', workspaceId: ws.id, problem: { text: 'A landing page' } });
    const run = await seedRun(store, 'from-intake', { intakeId: 'in-5' });
    expect(run.intakeId).toBe('in-5');
    expect(await store.getRun('from-intake')).toEqual(run);
    expect('intakeId' in (await seedRun(store, 'no-intake'))).toBe(false);
    await expect(seedRun(store, 'unknown-intake', { intakeId: 'nope' })).rejects.toMatchObject({ code: 'not-found', message: expect.stringMatching(/no intake "nope"/) });
    await expect(seedRun(store, 'blank-intake', { intakeId: '' })).rejects.toMatchObject({ code: 'invalid' });
    // An intake from another workspace would label the run with someone else's problem.
    const db = new DatabaseSync(store.dbPath);
    try {
      db.prepare(`INSERT INTO workspaces (id, name, budget_usd, created_at) VALUES ('other', 'Other', 5, '2026-10-07T00:00:00.000Z')`).run();
    } finally {
      db.close();
    }
    await store.createIntake({ id: 'in-other', workspaceId: 'other', problem: { text: 'Elsewhere' } });
    await expect(seedRun(store, 'cross', { intakeId: 'in-other' })).rejects.toThrow(/belongs to another workspace/);
    expect(await store.getRun('cross')).toBeUndefined();
  });
});
