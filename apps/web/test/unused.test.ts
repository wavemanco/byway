/**
 * F01 (a): the Run and Result screens' note for an answer of yours that a finished run left unused (view/unused.ts),
 * worked out from the run's events, and said with the step that asked it (buildTimeline) and in every later poll
 * (mergeRunData).
 */
import { describe, expect, it } from 'vitest';
import { c4 } from '@byway/catalog';
import type { CheckpointRecord, RunEvent, RunRecord, RunStatus } from '@byway/contracts';
import { mergeRunData, type RunData } from '../src/view/rundata.ts';
import { buildTimeline } from '../src/view/timeline.ts';
import { unusedAnswerNote, unusedAnswerNotes } from '../src/view/unused.ts';

const QUESTION = 'What should go? List what to remove, one item per line.';

function runView(status: RunStatus, fixed: boolean, text = '- The second paragraph.') {
  const events: RunEvent[] = [];
  const at = '2026-10-29T10:00:00.000Z';
  const add = (type: RunEvent['type'], stepId: string | undefined, data: Record<string, unknown>) => events.push({ runId: 'r', seq: events.length + 1, at, type, ...(stepId ? { stepId } : {}), data });
  add('run-started', undefined, { recipeId: 'c4', profileId: 'demo', budgetUsd: 2 });
  add('step-started', 'draft', { label: 'Draft', stage: 'D2', role: 'build', actor: 'model' });
  add('step-finished', 'draft', { costUsd: 0 });
  add('step-started', 'cut', { label: 'Cut', stage: 'D3', role: 'cut', actor: 'human' });
  add('checkpoint-opened', 'cut', { checkpointId: 'cp1', kind: 'directive' });
  add('checkpoint-resolved', 'cut', { checkpointId: 'cp1' });
  add('step-finished', 'cut', { costUsd: 0 });
  if (fixed) {
    add('step-started', 'apply-cut', { label: 'Apply cut', stage: 'D3', role: 'fix', actor: 'model' });
    add('step-finished', 'apply-cut', { costUsd: 0 });
  }
  const checkpoints: CheckpointRecord[] = [
    { id: 'cp1', runId: 'r', stepId: 'cut', kind: 'directive', prompt: QUESTION, status: 'resolved', openedAt: at, resolvedAt: at, resolution: { checkpointId: 'cp1', text } },
  ];
  const run = { id: 'r', status, medium: 'prose' } as RunRecord;
  return { run, events, checkpoints };
}

describe('an answer of yours the run left unused', () => {
  it('is named, with its question, once the run has finished and no step after it took it in', () => {
    expect(unusedAnswerNotes(c4, runView('done', false))).toEqual([{ checkpointId: 'cp1', question: QUESTION, note: unusedAnswerNote(QUESTION) }]);
    expect(unusedAnswerNote(QUESTION)).toBe(`Your answer to “${QUESTION}” went unused: no step that ran after it took it into the work, so the result does not reflect it.`);
  });

  it('is not named when the fix took it in, when it was empty, or before the run has finished', () => {
    expect(unusedAnswerNotes(c4, runView('done', true))).toEqual([]);
    expect(unusedAnswerNotes(c4, runView('done', false, '  '))).toEqual([]);
    expect(unusedAnswerNotes(c4, runView('running', false))).toEqual([]);
    expect(unusedAnswerNotes(c4, runView('cancelled', false))).toEqual([]);
  });

  it('is not named when the fix only passed: a step with nothing to do took nothing in', () => {
    const view = runView('done', true);
    const passed = view.events.find((e) => e.type === 'step-finished' && e.stepId === 'apply-cut')!;
    passed.data = { costUsd: 0, passed: true, note: 'Nothing to remove' };
    expect(unusedAnswerNotes(c4, view).map((u) => u.checkpointId)).toEqual(['cp1']);
  });

  it('is said with the step that asked it, and carried through later polls', () => {
    const view = runView('done', false);
    const unused = unusedAnswerNotes(c4, view);
    const rows = buildTimeline(view.events, view.checkpoints, 'done', null, unused).flatMap((s) => s.steps);
    expect(rows.find((r) => r.stepId === 'cut')?.note).toBe(unusedAnswerNote(QUESTION));
    expect(rows.find((r) => r.stepId === 'draft')?.note).toBeUndefined();
    expect(buildTimeline(view.events, view.checkpoints, 'done', null).flatMap((s) => s.steps).find((r) => r.stepId === 'cut')?.note).toBeUndefined();

    const first: RunData = { view, artifacts: {}, unused };
    const later: RunData = { view: { ...view, events: [] }, artifacts: {} };
    expect(mergeRunData(first, later).unused).toEqual(unused);
  });
});
