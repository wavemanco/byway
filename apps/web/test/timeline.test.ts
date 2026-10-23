import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckpointRecord, RecipePresentation, RunEvent } from '@byway/contracts';
import { loop, optional, seq, step, type Recipe } from '@byway/recipe';
import { Timeline } from '../src/components/run/Timeline.tsx';
import { shownStep, stepIndex } from '../src/view/steps.ts';
import { howItWasMade } from '../src/view/run.ts';
import { buildTimeline, currentStep, judgement, outputArtifacts, STOPPED_BY_FAILURE_NOTE } from '../src/view/timeline.ts';

let seq_ = 0;
const ev = (type: RunEvent['type'], stepId: string | undefined, data: Record<string, unknown> = {}, candidate?: number): RunEvent => ({
  runId: 'r1',
  seq: ++seq_,
  at: `2026-10-07T10:00:${String(seq_).padStart(2, '0')}.000Z`,
  type,
  ...(stepId ? { stepId } : {}),
  ...(candidate !== undefined ? { candidate } : {}),
  data,
});

const started = (stepId: string, label: string, stage: string, actor = 'model', extra: Record<string, unknown> = {}, candidate?: number) =>
  ev('step-started', stepId, { label, stage, role: 'build', actor, ...extra }, candidate);
const done = (stepId: string, costUsd = 0, extra: Record<string, unknown> = {}, candidate?: number) => ev('step-finished', stepId, { costUsd, ...extra }, candidate);

const checkpoint = (id: string, stepId: string, status: 'open' | 'resolved'): CheckpointRecord => ({
  id,
  runId: 'r1',
  stepId,
  kind: 'pick',
  prompt: 'Pick one',
  status,
  openedAt: '2026-10-07T10:01:00.000Z',
});

/** A C1-shaped presentation: several recipe steps behind each shown step. */
const PRESENTATION: RecipePresentation = {
  recipeId: 'c1',
  code: 'C1',
  name: 'Landing Page Studio',
  promise: '',
  medium: 'web-page',
  bestFor: [],
  stages: [
    { stage: 'Explore', steps: [{ label: 'Random spark', explainer: '', who: 'ai', stepIds: ['seed-build'] }] },
    {
      stage: 'Refine',
      steps: [
        { label: 'Outside critique', explainer: '', who: 'ai', stepIds: ['render', 'critic', 'critic-fix'] },
        { label: 'Custom imagery', explainer: '', who: 'ai', stepIds: ['asset', 'asset-verify'] },
        { label: 'Pick one', explainer: '', who: 'you', stepIds: ['pick-one'] },
      ],
    },
    {
      stage: 'Finish',
      steps: [
        { label: 'Trim', explainer: '', who: 'you', stepIds: ['cut', 'apply-cut'] },
        { label: 'Trim', explainer: '', who: 'ai', stepIds: ['bloat-cut'] },
      ],
    },
  ],
};

const s = (id: string, actor: 'model' | 'human' | 'tool' = 'model') => step({ id, role: 'build', actor, consumes: [], produces: [] });

const RECIPE: Recipe = {
  schema: 'byway.recipe/1',
  id: 'c1',
  title: 'C1',
  kind: 'protocol-config',
  family: 'C1',
  channel: 'protocol',
  inputs: ['intent'],
  stages: [
    { stage: 'D1', body: seq(s('seed-build')) },
    {
      stage: 'D2',
      body: seq(
        loop('critic-loop', seq(s('render', 'tool'), s('critic'), s('critic-fix')), {
          metric: 'critic-score',
          threshold: 9,
          hidden: true,
          holder: 'worker',
          probe: 2,
          max: 5,
          onCap: 'human',
          onNoConverge: 'recalibrate-human',
        }),
        optional('asset-if-plain', 'a human calls the design plain', seq(s('asset'), s('asset-verify', 'tool'))),
        { op: 'pick', id: 'pick-one', mode: 'H', k: 1, actor: 'human' },
      ),
    },
    { stage: 'D3', body: seq(s('cut', 'human'), s('apply-cut'), s('bloat-cut')) },
  ],
  sitsOut: [],
  exceptions: [],
  bank: true,
};

describe('step index', () => {
  it('maps every covered step and pick to its shown step, and operators to the shown step of their first step', () => {
    const index = stepIndex(PRESENTATION, RECIPE);
    expect(shownStep(index, 'critic-fix')).toEqual({ index: 1, label: 'Outside critique', who: 'ai', stage: 'Refine' });
    expect(shownStep(index, 'pick-one')?.label).toBe('Pick one');
    expect(shownStep(index, 'critic-loop')?.label).toBe('Outside critique');
    expect(shownStep(index, 'asset-if-plain')?.label).toBe('Custom imagery');
    // Two shown steps with the same label stay apart.
    expect(shownStep(index, 'cut')?.index).not.toBe(shownStep(index, 'bloat-cut')?.index);
    expect(shownStep(index, 'nope')).toBeUndefined();
    expect(shownStep(index, 'constructor')).toBeUndefined();
    expect(shownStep(stepIndex(PRESENTATION), 'critic-loop')).toBeUndefined();
  });
});

describe('run timeline, labelled by the presentation', () => {
  function c1Events(): RunEvent[] {
    seq_ = 0;
    return [
      ev('run-started', undefined, { recipeId: 'c1', profileId: 'balanced', budgetUsd: 2 }),
      started('seed-build', 'Seed build', 'D1', 'model', { block: 'SEED' }, 0),
      started('seed-build', 'Seed build', 'D1', 'model', { block: 'SEED' }, 1),
      ev('artifact', 'seed-build', { artifactId: 'sha256:a', mediaType: 'text/html', label: 'Draft A' }, 0),
      ev('artifact', 'seed-build', { artifactId: 'sha256:b', mediaType: 'text/html', label: 'Draft B' }, 1),
      done('seed-build', 0.06, {}, 0),
      done('seed-build', 0.06, {}, 1),
      started('render', 'Render', 'D2', 'tool', {}, 0),
      started('render', 'Render', 'D2', 'tool', {}, 1),
      done('render', 0, {}, 0),
      started('critic', 'Critic', 'D2', 'model', { block: 'CRITIC' }, 0),
      done('render', 0, {}, 1),
      done('critic', 0.1, {}, 0),
      ev('loop-iteration', 'critic-loop', { iteration: 1, max: 5, score: 7 }, 0),
      started('critic-fix', 'Fix', 'D2', 'model', {}, 0),
      done('critic-fix', 0.05, {}, 0),
      ev('loop-iteration', 'critic-loop', { iteration: 2, max: 5, score: 9 }, 0),
      ev('checkpoint-opened', 'asset-if-plain', { checkpointId: 'cp-plain', kind: 'confirm' }),
      ev('checkpoint-resolved', 'asset-if-plain', { checkpointId: 'cp-plain' }),
      started('asset', 'Asset', 'D2', 'model', { block: 'ASSET' }),
      done('asset', 0, { skipped: true, note: 'You did not find the drafts plain.' }),
      ev('cost', undefined, { totalUsd: 0.27, budgetUsd: 3 }),
      ev('checkpoint-opened', 'pick-one', { checkpointId: 'cp-pick', kind: 'pick' }),
    ];
  }

  it('folds every recipe step behind a shown step into one row, with the plain label, stage and who', () => {
    const index = stepIndex(PRESENTATION, RECIPE);
    const timeline = buildTimeline(c1Events(), [checkpoint('cp-pick', 'pick-one', 'open')], 'waiting', index);
    expect(timeline.map((st) => st.stage)).toEqual(['Explore', 'Refine']);
    const [explore, refine] = timeline;
    expect(explore?.steps).toHaveLength(1);
    expect(explore?.steps[0]).toMatchObject({ label: 'Random spark', who: 'ai', status: 'done', costUsd: 0.12, candidates: 2, block: 'SEED' });
    expect(explore?.steps[0]?.artifacts.map((a) => a.artifactId)).toEqual(['sha256:a', 'sha256:b']);
    expect(refine?.steps.map((st) => st.label)).toEqual(['Outside critique', 'Custom imagery', 'Pick one']);
    expect(refine?.steps[0]).toMatchObject({ status: 'done', iterations: 2, costUsd: 0.15, stepIds: ['render', 'critic', 'critic-loop', 'critic-fix'] });
    // The latest round's judgement is shown to you (never to a critic, port rule 2).
    expect(refine?.steps[0]?.judged).toBe('scored 9/10');
    expect(refine?.steps[1]).toMatchObject({ status: 'skipped', note: 'You did not find the drafts plain.', checkpointIds: ['cp-plain'] });
    expect(refine?.steps[2]).toMatchObject({ who: 'you', status: 'waiting', checkpointIds: ['cp-pick'] });
  });

  it('starts another round when a shown step comes back after other steps ran', () => {
    seq_ = 0;
    const presentation: RecipePresentation = {
      ...PRESENTATION,
      stages: [
        {
          stage: 'Refine',
          steps: [
            { label: 'Your draft', explainer: '', who: 'you', stepIds: ['write', 'render'] },
            { label: 'Trim marks', explainer: '', who: 'ai', stepIds: ['cut-marks'] },
            { label: 'Cliché sweep', explainer: '', who: 'ai', stepIds: ['tells-flags'] },
          ],
        },
      ],
    };
    const list = [
      started('write', 'Write', 'D2', 'human'),
      done('write'),
      started('render', 'Render', 'D2', 'tool'),
      done('render'),
      // The audit's lenses run side by side: interleaved events must not make extra rounds.
      started('cut-marks', 'Cut marks', 'D2'),
      started('tells-flags', 'Tells flags', 'D2'),
      done('cut-marks', 0.01),
      done('tells-flags', 0.01),
      started('write', 'Write', 'D2', 'human'),
    ];
    const [refine] = buildTimeline(list, [], 'running', stepIndex(presentation));
    expect(refine?.steps.map((st) => `${st.label}:${st.round}:${st.status}`)).toEqual([
      'Your draft:1:done',
      'Trim marks:1:done',
      'Cliché sweep:1:done',
      'Your draft:2:running',
    ]);
  });

  it('shows an optional step you declined as Skipped with its note, from the events the runner emits (C1)', () => {
    seq_ = 0;
    // A declined optional: its question, your answer, then step-finished on the optional's own id. No step-started.
    const list = [
      started('critic', 'Critic', 'D2', 'model', { block: 'CRITIC' }),
      done('critic', 0.1),
      ev('checkpoint-opened', 'asset-if-plain', { checkpointId: 'cp-plain', kind: 'confirm' }),
      ev('checkpoint-resolved', 'asset-if-plain', { checkpointId: 'cp-plain' }),
      ev('step-finished', 'asset-if-plain', { costUsd: 0, skipped: true, note: 'You chose not to run this step.' }),
      ev('checkpoint-opened', 'pick-one', { checkpointId: 'cp-pick', kind: 'pick' }),
    ];
    const cps = [{ ...checkpoint('cp-plain', 'asset-if-plain', 'resolved'), kind: 'confirm' as const }, checkpoint('cp-pick', 'pick-one', 'open')];
    const running = buildTimeline(list, cps, 'waiting', stepIndex(PRESENTATION, RECIPE));
    const imagery = running.flatMap((st) => st.steps).find((st) => st.label === 'Custom imagery');
    expect(imagery).toMatchObject({ status: 'skipped', note: 'You chose not to run this step.', checkpointIds: ['cp-plain'] });
    // Once the run is done it is still Skipped (not Stopped), and the Result lists it under Skipped.
    const ended = buildTimeline([...list, ev('run-finished', undefined, { outputArtifactId: 'sha256:a', costUsd: 0.1 })], cps, 'done', stepIndex(PRESENTATION, RECIPE));
    expect(ended.flatMap((st) => st.steps).find((st) => st.label === 'Custom imagery')?.status).toBe('skipped');
    expect(howItWasMade(ended).skipped).toEqual([expect.objectContaining({ label: 'Custom imagery', note: 'You chose not to run this step.' })]);
  });

  it('marks a row part skipped when some of its steps were skipped, and the Result names what was not done (UX-7)', () => {
    seq_ = 0;
    // C5's Composite: the product is placed in each scene (runs), the clean cut-out (matte) has no executor.
    const presentation: RecipePresentation = {
      ...PRESENTATION,
      stages: [{ stage: 'Refine', steps: [{ label: 'Composite', explainer: '', who: 'ai', stepIds: ['render-in-scene', 'matte'] }] }],
    };
    const list = [
      started('render-in-scene', 'Render in scene', 'D2'),
      done('render-in-scene', 0.2),
      started('matte', 'Matte', 'D2', 'tool'),
      done('matte', 0, { skipped: true, note: 'Compositing is not available in byway yet.' }),
    ];
    const timeline = buildTimeline(list, [], 'done', stepIndex(presentation));
    const row = timeline[0]?.steps[0];
    expect(row).toMatchObject({ label: 'Composite', status: 'done', skippedParts: [{ stepId: 'matte', note: 'Compositing is not available in byway yet.' }] });
    const made = howItWasMade(timeline);
    expect(made.rows.map((r) => r.label)).toEqual(['Composite']);
    expect(made.skipped).toEqual([expect.objectContaining({ label: 'Composite', part: true, note: 'Compositing is not available in byway yet.' })]);
  });

  it('reads a step skipped for want of an executor as skipped, with its note', () => {
    seq_ = 0;
    const list = [started('matte', 'Matte', 'D2', 'tool'), done('matte', 0, { skipped: true, note: 'Compositing is not available in byway yet.' })];
    const [refine] = buildTimeline(list, [], 'running');
    expect(refine?.steps[0]).toMatchObject({ status: 'skipped', note: 'Compositing is not available in byway yet.' });
  });

  it('stops rows still open when the run ends, and does not offer a cancelled run’s open question', () => {
    const list = c1Events();
    list.push(started('cut', 'Cut', 'D3', 'human'), ev('run-cancelled', undefined, {}));
    const timeline = buildTimeline(list, [checkpoint('cp-pick', 'pick-one', 'open')], 'cancelled', stepIndex(PRESENTATION, RECIPE));
    const refine = timeline.find((st) => st.stage === 'Refine');
    expect(refine?.steps.at(-1)).toMatchObject({ label: 'Pick one', status: 'stopped' });
    expect(timeline.at(-1)?.steps[0]).toMatchObject({ label: 'Trim', status: 'stopped' });
  });

  it('says why a step was stopped when another step’s failure ended the run (FANOUT-FAILURE): its calls were cut off, and it got no event of its own', () => {
    // Two drafts side by side, each built then reviewed: the first draft's review is refused at the budget, which the
    // person does not raise, while the second draft is still being built. The run fails, and the second build is cut off.
    seq_ = 0;
    const list = [
      started('page', 'Draft', 'D2', 'model', {}, 0),
      started('page', 'Draft', 'D2', 'model', {}, 1),
      done('page', 0.01, {}, 0),
      started('review', 'Review', 'D2', 'model', {}, 0),
      ev('step-failed', 'review', { error: 'The run stopped at its budget of $2.00, and the budget was not raised.', retryable: false }, 0),
      ev('run-failed', undefined, { error: 'The run stopped at its budget of $2.00, and the budget was not raised.' }),
    ];
    const [refine] = buildTimeline(list, [], 'failed');
    expect(refine?.steps.map((s) => [s.label, s.status, s.note])).toEqual([
      ['Draft', 'stopped', STOPPED_BY_FAILURE_NOTE],
      ['Review', 'failed', undefined],
    ]);
    // Cancelled, the person ended it: no such note. Still going, nothing was stopped.
    expect(buildTimeline(list.slice(0, 4), [], 'cancelled')[0]?.steps.map((s) => s.note)).toEqual([undefined, undefined]);
    expect(buildTimeline(list.slice(0, 4), [], 'running')[0]?.steps.map((s) => [s.status, s.note])).toEqual([
      ['running', undefined],
      ['running', undefined],
    ]);
    // A note the step left before it was stopped stays, with why it was stopped after it.
    const noted = [...list.slice(0, 1), ev('renderer-sandbox-off', 'page', { note: 'Drawn with the sandbox off.' }, 0), ...list.slice(1)];
    expect(buildTimeline(noted, [], 'failed')[0]?.steps[0]?.note).toBe(`Drawn with the sandbox off. ${STOPPED_BY_FAILURE_NOTE}`);
  });

  it('finds the step in progress and every output', () => {
    const timeline = buildTimeline(c1Events(), [checkpoint('cp-pick', 'pick-one', 'open')], 'waiting', stepIndex(PRESENTATION, RECIPE));
    expect(currentStep(timeline)?.label).toBe('Pick one');
    expect(outputArtifacts(timeline).map((a) => a.artifactId)).toEqual(['sha256:a', 'sha256:b']);
  });
});

describe('run timeline without a presentation', () => {
  it('labels rows from the events themselves (a composed run after a restart)', () => {
    seq_ = 0;
    const list = [started('draft', 'Draft', 'D2', 'model', { block: 'VOICE' }), done('draft', 0.02), started('voice', 'Your words', 'D3', 'human')];
    const [refine, finish] = buildTimeline(list, [], 'running');
    expect(refine?.steps[0]).toMatchObject({ label: 'Draft', who: 'ai', status: 'done', costUsd: 0.02 });
    expect(finish?.steps[0]).toMatchObject({ label: 'Your words', who: 'you', status: 'running' });
  });

  it('keeps repeated rounds of the same step as separate rows', () => {
    seq_ = 0;
    const list = [
      started('draft', 'Your draft', 'Refine', 'human'),
      done('draft'),
      started('audit', 'Trim marks', 'Refine'),
      done('audit', 0.01),
      started('draft', 'Your draft', 'Refine', 'human'),
    ];
    const [refine] = buildTimeline(list, [], 'running');
    expect(refine?.steps.map((st) => `${st.stepId}:${st.round}:${st.status}`)).toEqual(['draft:1:done', 'audit:1:done', 'draft:2:running']);
  });

  it('shows a decline that byway’s second ask answered in the row’s note; a decline that ended the step is told by its failure (ADR-0102)', () => {
    seq_ = 0;
    const answered = 'Anthropic’s model claude-sonnet-5-5 declined this request (reason given: cyber). byway asked it once more, and it answered. Both attempts were billed: $0.1800 in all.';
    const again = 'Anthropic’s model claude-sonnet-5-5 declined this request (reason given: cyber). byway asked it once more, and it declined again. Both attempts were billed: $0.0800 in all.';
    const list = [
      started('draft', 'Draft', 'D2'),
      ev('model-declined', 'draft', { retry: 'answered', note: answered }),
      done('draft', 0.18, { note: 'Drafted.' }),
      started('fix', 'Fix', 'D2'),
      ev('model-declined', 'fix', { retry: 'declined', note: again }),
      ev('step-failed', 'fix', { error: `${again} Rephrase the request, or choose another model profile in Settings, then try again.`, retryable: false }),
    ];
    const [refine] = buildTimeline(list, [], 'failed');
    expect(refine?.steps[0]).toMatchObject({ label: 'Draft', status: 'done', note: `${answered} Drafted.` });
    expect(refine?.steps[1]).toMatchObject({ label: 'Fix', status: 'failed', error: `${again} Rephrase the request, or choose another model profile in Settings, then try again.` });
    expect(refine?.steps[1]?.note).toBeUndefined();
  });

  it("shows the note on a step whose pages were drawn with the page renderer's OS sandbox off, once, on the Run and Result screens (ADR-0105)", () => {
    const off = "Pages in this step were drawn with the page renderer's OS sandbox off (it was switched off in Settings).";
    const list = [
      started('render', 'Render', 'D2', 'tool'),
      ev('renderer-sandbox-off', 'render', { note: off }),
      ev('renderer-sandbox-off', 'render', { note: off }, 1),
      done('render', 0, { note: 'Rendered.' }),
      started('critic', 'Critique', 'D2'),
      done('critic', 0.02),
    ];
    const stages = buildTimeline(list, [], 'done');
    expect(stages[0]?.steps[0]).toMatchObject({ label: 'Render', status: 'done', note: `${off} Rendered.` });
    expect(stages[0]?.steps[1]?.note).toBeUndefined();
    expect(howItWasMade(stages).rows[0]).toMatchObject({ label: 'Render', note: `${off} Rendered.` });
    // An event with no note says nothing.
    expect(buildTimeline([started('render', 'Render', 'D2', 'tool'), ev('renderer-sandbox-off', 'render', {}), done('render')], [], 'done')[0]?.steps[0]?.note).toBeUndefined();
  });

  it("keeps the sandbox-off note on a step that then failed: the Run screen's timeline shows its failure and the note (ADR-0105)", () => {
    const off = "Pages in this step were drawn with the page renderer's OS sandbox off (it was switched off in Settings).";
    const failure = 'The model provider did not answer.';
    const list = [started('critic', 'Critique', 'D2'), ev('renderer-sandbox-off', 'critic', { note: off }), ev('step-failed', 'critic', { error: failure })];
    const stages = buildTimeline(list, [], 'failed');
    expect(stages[0]?.steps[0]).toMatchObject({ status: 'failed', error: failure, note: off });
    // As the row shows it: the failure, and the note under it.
    const html = renderToStaticMarkup(createElement(Timeline, { stages, artifacts: {}, selected: null, onSelect: () => undefined }));
    expect(html).toContain(`<p class="tl-error">${failure}</p>`);
    expect(html).toContain(`<p class="tl-note">${off.replace(/'/g, '&#x27;')}</p>`);
    expect(html.indexOf('tl-error')).toBeLessThan(html.indexOf('tl-note'));
  });

  it('tolerates events with missing or malformed data', () => {
    seq_ = 0;
    const list = [ev('step-started', 'x', { label: 42, stage: 'D9' }), ev('artifact', 'x', { artifactId: 7 })];
    const [stage] = buildTimeline(list, [], 'running');
    expect(stage?.stage).toBe('Refine');
    expect(stage?.steps[0]).toMatchObject({ label: 'x', who: 'ai', artifacts: [] });
  });
});

describe('loop judgements', () => {
  it('reads a score in OK mode and our place in the blind lineup in GREAT mode (ADR-0072)', () => {
    expect(judgement({ score: 8 })).toBe('scored 8/10');
    expect(judgement({ rank: 2, of: 5 })).toBe('ranked 2 of 5');
    expect(judgement({ rank: 1.5, of: 10, score: 3 })).toBe('ranked 1.5 of 10');
    expect(judgement({})).toBeUndefined();
  });
});
