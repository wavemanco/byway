import { describe, expect, it } from 'vitest';
import type { CheckpointRecord, RunEvent } from '@byway/contracts';
import { budgetFromEvents, buildTimeline, currentStep, outputArtifacts } from '../src/view/timeline.ts';

let seq = 0;
const ev = (type: RunEvent['type'], stepId: string | undefined, data: Record<string, unknown> = {}, candidate?: number): RunEvent => ({
  runId: 'r1',
  seq: ++seq,
  at: `2026-10-07T10:00:${String(seq).padStart(2, '0')}.000Z`,
  type,
  ...(stepId ? { stepId } : {}),
  ...(candidate !== undefined ? { candidate } : {}),
  data,
});

const checkpoint = (status: 'open' | 'resolved'): CheckpointRecord => ({
  id: 'cp-pick',
  runId: 'r1',
  stepId: 'pick-one',
  kind: 'pick',
  prompt: 'Pick one',
  status,
  openedAt: '2026-10-07T10:01:00.000Z',
});

function events(): RunEvent[] {
  seq = 0;
  return [
    ev('run-started', undefined, { budgetUsd: 2 }),
    ev('step-started', 'seed-build', { label: 'Random spark', stage: 'D1', block: 'SEED', actor: 'model' }),
    ev('artifact', 'seed-build', { artifactId: 'sha256:a', mediaType: 'text/html' }, 0),
    ev('artifact', 'seed-build', { artifactId: 'sha256:b', mediaType: 'text/html' }, 1),
    ev('step-finished', 'seed-build', { costUsd: 0.12 }),
    ev('step-started', 'critic-loop', { label: 'Outside critique', stage: 'Refine', block: 'CRITIC', who: 'ai' }),
    ev('loop-iteration', 'critic-loop', { iteration: 1 }),
    ev('loop-iteration', 'critic-loop', { iteration: 2 }),
    ev('step-finished', 'critic-loop', { costUsd: 0.3 }),
    ev('step-started', 'asset-if-plain', { label: 'Custom imagery', stage: 'Refine', block: 'ASSET', actor: 'model' }),
    ev('step-finished', 'asset-if-plain', { skipped: true }),
    ev('cost', undefined, { totalUsd: 0.42, budgetUsd: 3 }),
    ev('step-started', 'pick-one', { label: 'Your pick', stage: 'Refine', actor: 'human' }),
    ev('checkpoint-opened', 'pick-one', { checkpointId: 'cp-pick', kind: 'pick' }),
  ];
}

describe('run timeline', () => {
  it('groups steps under Explore, Refine and Finish in the order they ran', () => {
    const timeline = buildTimeline(events(), [checkpoint('open')], 'waiting');
    expect(timeline.map((s) => s.stage)).toEqual(['Explore', 'Refine']);
    expect(timeline[1]?.steps.map((s) => s.stepId)).toEqual(['critic-loop', 'asset-if-plain', 'pick-one']);
  });

  it('derives each step row: who, status, cost, outputs and rounds', () => {
    const [explore, refine] = buildTimeline(events(), [checkpoint('open')], 'waiting');
    expect(explore?.steps[0]).toMatchObject({
      label: 'Random spark',
      block: 'SEED',
      who: 'ai',
      status: 'done',
      costUsd: 0.12,
      candidates: 2,
    });
    expect(explore?.steps[0]?.artifacts.map((a) => a.artifactId)).toEqual(['sha256:a', 'sha256:b']);
    expect(refine?.steps[0]).toMatchObject({ status: 'done', iterations: 2, costUsd: 0.3 });
    expect(refine?.steps[1]).toMatchObject({ status: 'skipped' });
    expect(refine?.steps[2]).toMatchObject({ who: 'you', status: 'waiting', checkpointIds: ['cp-pick'] });
  });

  it('marks a step that was still running when the run stopped', () => {
    const list = events();
    list.push(ev('step-started', 'trim', { label: 'Trim', stage: 'D3', actor: 'model' }), ev('run-cancelled', undefined, {}));
    const finish = buildTimeline(list, [checkpoint('resolved')], 'cancelled').at(-1);
    expect(finish?.stage).toBe('Finish');
    expect(finish?.steps[0]?.status).toBe('stopped');
  });

  it('keeps repeated rounds of the same step as separate rows', () => {
    seq = 0;
    const list = [
      ev('step-started', 'draft', { label: 'Your draft', stage: 'Refine', actor: 'human' }),
      ev('step-finished', 'draft', {}),
      ev('step-started', 'audit', { label: 'Trim marks', stage: 'Refine', actor: 'model' }),
      ev('step-finished', 'audit', { costUsd: 0.01 }),
      ev('step-started', 'draft', { label: 'Your draft', stage: 'Refine', actor: 'human' }),
    ];
    const [refine] = buildTimeline(list, [], 'running');
    expect(refine?.steps.map((s) => `${s.stepId}:${s.round}:${s.status}`)).toEqual(['draft:1:done', 'audit:1:done', 'draft:2:running']);
  });

  it('finds the step in progress, the latest budget and every output', () => {
    const list = events();
    const timeline = buildTimeline(list, [checkpoint('open')], 'waiting');
    expect(currentStep(timeline)?.stepId).toBe('pick-one');
    expect(budgetFromEvents(list)).toBe(3);
    expect(budgetFromEvents(list.slice(0, 2))).toBe(2);
    expect(budgetFromEvents([])).toBeUndefined();
    expect(outputArtifacts(timeline).map((a) => a.artifactId)).toEqual(['sha256:a', 'sha256:b']);
  });

  it('tolerates events with missing or malformed data', () => {
    seq = 0;
    const list = [ev('step-started', 'x', { label: 42, stage: 'D9' }), ev('artifact', 'x', { artifactId: 7 })];
    const [stage] = buildTimeline(list, [], 'running');
    expect(stage?.stage).toBe('Refine');
    expect(stage?.steps[0]).toMatchObject({ label: 'x', who: 'ai', artifacts: [] });
  });
});
