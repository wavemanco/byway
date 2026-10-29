import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunScreen } from '../src/components/run/RunScreen.tsx';
import { RunStatusPanel } from '../src/components/run/RunStatusPanel.tsx';
import { focusAfterRemoval } from '../src/view/focus.ts';
import { CANCEL_QUESTION, CUT_OFF_NOTE, controlPendingLabel, underWayNote } from '../src/view/labels.ts';
import type { CheckpointRecord, RunRecord } from '@byway/contracts';
import { activeCheckpoint, howItWasMade, isEnded, outputKind, pollDelay, runPollDelay, sideImages, waitingRunCount } from '../src/view/run.ts';
import type { RunData } from '../src/view/rundata.ts';
import type { TimelineStage, TimelineStep } from '../src/view/timeline.ts';

const cp = (id: string, runId: string, openedAt: string, status: CheckpointRecord['status'] = 'open'): CheckpointRecord => ({
  id,
  runId,
  stepId: 's',
  kind: 'confirm',
  prompt: 'Yes?',
  status,
  openedAt,
});

const step = (over: Partial<TimelineStep> & Pick<TimelineStep, 'label' | 'who'>): TimelineStep => ({
  key: `${over.label}#1`,
  stepId: over.label,
  stepIds: [over.label],
  round: 1,
  stage: 'Explore',
  status: 'done',
  costUsd: 0,
  artifacts: [],
  iterations: 0,
  candidates: 0,
  checkpointIds: [],
  skippedParts: [],
  startedAt: '2026-10-07T10:00:00.000Z',
  ...over,
});

describe('the Run screen', () => {
  it('shows the oldest open question as "Your turn"', () => {
    const list = [cp('b', 'r', '2026-10-07T10:00:02Z'), cp('a', 'r', '2026-10-07T10:00:01Z'), cp('z', 'r', '2026-10-07T10:00:00Z', 'resolved')];
    expect(activeCheckpoint(list)?.id).toBe('a');
    expect(activeCheckpoint([cp('z', 'r', '2026-10-07T10:00:00Z', 'resolved')])).toBeUndefined();
  });

  it('polls quickly while the AI works, slowly while it waits for you or is paused, and not at all once the run ended', () => {
    expect(pollDelay('running', undefined)).toBe(1000);
    expect(pollDelay('queued', undefined)).toBe(1000);
    expect(pollDelay('waiting', undefined)).toBeGreaterThan(1000);
    expect(pollDelay('paused', undefined)).toBeGreaterThan(1000);
    for (const status of ['done', 'failed', 'cancelled'] as const) {
      expect(isEnded(status)).toBe(true);
      expect(pollDelay(status, undefined)).toBeNull();
      expect(pollDelay(status, 0)).toBeNull();
    }
    expect(isEnded('waiting')).toBe(false);
    expect(isEnded('paused')).toBe(false);
  });

  // RS-5: the run shows Cancelled or Failed at once, while a call byway does not cut off is still under way; its cost is
  // added to the run when it settles, so the screen keeps polling, lazily, until none of the run's calls is under way.
  it('keeps polling an ended run, lazily, while some of its calls are still under way', () => {
    for (const status of ['done', 'failed', 'cancelled'] as const) expect(pollDelay(status, 2)).toBe(3000);
    // A run still going polls as it always has, whatever is under way.
    expect(pollDelay('running', 2)).toBe(1000);
    expect(pollDelay('waiting', 2)).toBe(3000);
  });

  it('shows pages as thumbnails, text as excerpts, and diffs, images and clips as themselves', () => {
    expect(outputKind('text/html')).toBe('page');
    expect(outputKind('text/html; charset=utf-8')).toBe('page');
    expect(outputKind('image/svg+xml')).toBe('image');
    expect(outputKind('image/png')).toBe('image');
    expect(outputKind('video/mp4')).toBe('video');
    expect(outputKind('text/x-diff')).toBe('diff');
    expect(outputKind('application/json')).toBe('data');
    expect(outputKind('text/markdown')).toBe('text');
    expect(outputKind('text/plain')).toBe('text');
    expect(outputKind(undefined)).toBe('other');
  });

  it('counts runs, not questions, in the "waiting for you" badge, and only runs that can still move', () => {
    const runs = [
      { id: 'r1', status: 'waiting' as const },
      { id: 'r2', status: 'paused' as const },
      { id: 'r3', status: 'waiting' as const },
      { id: 'r4', status: 'cancelled' as const },
    ];
    const open = [cp('a', 'r1', 'x'), cp('b', 'r1', 'y'), cp('c', 'r2', 'z'), cp('d', 'r3', 'w', 'resolved'), cp('e', 'r4', 'v')];
    expect(waitingRunCount(open, runs)).toBe(2);
    expect(waitingRunCount([], runs)).toBe(0);
  });
});

describe('"How this was made"', () => {
  it('lists who did each step and what it cost, and totals the AI spend and your turns', () => {
    const stages: TimelineStage[] = [
      { stage: 'Explore', steps: [step({ label: 'Random spark', who: 'ai', costUsd: 0.24 }), step({ label: 'Your pick', who: 'you' })] },
      {
        stage: 'Finish',
        steps: [
          step({ label: 'Remove near-duplicates', who: 'tool', stage: 'Finish' }),
          step({ label: 'Motion', who: 'ai', stage: 'Finish', status: 'skipped', note: 'No video key.' }),
          step({ label: 'Your words', who: 'you', stage: 'Finish', round: 2, key: 'Your words#2' }),
          step({ label: 'Final check', who: 'ai', stage: 'Finish', costUsd: 0.02 }),
        ],
      },
    ];
    const made = howItWasMade(stages);
    expect(made.totalUsd).toBeCloseTo(0.26);
    expect(made.byWho).toEqual({ you: 2, ai: 2, tool: 1 });
    expect(made.skipped).toEqual([{ key: 'Motion#1', label: 'Motion', note: 'No video key.' }]);
    expect(made.rows.map((r) => r.label)).toEqual(['Random spark', 'Your pick', 'Remove near-duplicates', 'Your words', 'Final check']);
    expect(made.rows[3]?.round).toBe(2);
  });
});

describe('focus after removing an item (UX-2)', () => {
  it('goes to the item that took its place, else the one before, else the Add button', () => {
    expect(focusAfterRemoval([1, 2, 3], 2)).toBe(3);
    expect(focusAfterRemoval([1, 2, 3], 3)).toBe(2);
    expect(focusAfterRemoval([1], 1)).toBeNull();
    expect(focusAfterRemoval([1, 2], 9)).toBeNull();
  });
});

describe('run controls (UX-10)', () => {
  it('say at once what is happening while the request is on its way', () => {
    expect(controlPendingLabel('pause')).toBe('Pausing…');
    expect(controlPendingLabel('resume')).toBe('Resuming…');
    expect(controlPendingLabel('cancel')).toBe('Cancelling…');
  });
});

describe('images beside an options result (UX-8)', () => {
  it('collects the images Custom imagery made, for a deliverable that cannot hold them', () => {
    const stages: TimelineStage[] = [
      {
        stage: 'Finish',
        steps: [
          step({ label: 'Your words', who: 'you' }),
          step({
            label: 'Custom imagery',
            who: 'ai',
            block: 'ASSET',
            artifacts: [
              { artifactId: 'sha256:m1', mediaType: 'image/png', label: 'Mood board for option A' },
              { artifactId: 'sha256:brief', mediaType: 'text/markdown', label: 'Briefs' },
            ],
          }),
          step({ label: 'Option map', who: 'ai', artifacts: [{ artifactId: 'sha256:map', mediaType: 'image/png' }] }),
        ],
      },
    ];
    expect(sideImages(stages)).toEqual([{ artifactId: 'sha256:m1', label: 'Mood board for option A', step: 'Custom imagery' }]);
    expect(sideImages([])).toEqual([]);
  });
});

const ended = (status: 'failed' | 'cancelled'): RunRecord => ({
  id: 'r1',
  workspaceId: 'w',
  recipeId: 'c4',
  recipeHash: 'h',
  profileId: 'balanced',
  title: 'Memo',
  problem: 'A memo',
  medium: 'prose',
  status,
  costUsd: 0.4,
  budgetUsd: 2,
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
  ...(status === 'failed' ? { error: 'The run stopped at its budget of $2.00, and the budget was not raised.' } : {}),
});

/** The status panel of an ended run, as the server renders it. */
const panel = (status: 'failed' | 'cancelled', callsUnderWay = 0) => renderToStaticMarkup(createElement(RunStatusPanel, { run: ended(status), step: undefined, stages: [], artifacts: {}, callsUnderWay }));

describe('the Cancel question and the cancelled run (ADR-0111)', () => {
  it('says what Cancel cuts off and what finishes, in one sentence true for every profile', () => {
    expect(CANCEL_QUESTION).toBe(
      'Cancel this run? What it made so far is kept. An AI call already under way may still be paid for: byway cuts off text and video calls, except Google’s text calls, and other calls finish after the run stops.',
    );
  });

  // RS-6: only a cut-off call that may have been billed is listed, and it counts against the workspace, not the run.
  it('says which cut-off calls are listed, and where they are counted', () => {
    expect(CUT_OFF_NOTE).toBe(
      'If byway cut off an AI call that may have been billed, Settings lists it under Spending records; it counts against the workspace budget, not this run’s, at the amount listed there (its estimate, and an earlier attempt’s too when byway had sent the call before), until you clear it.',
    );
  });

  // RS-4: a failure ends the run and cuts off its other calls as Cancel does, so the Failed panel says it too.
  it('is said under a cancelled run and under a failed one', () => {
    for (const status of ['cancelled', 'failed'] as const) expect(panel(status), status).toContain(`<p class="muted">${CUT_OFF_NOTE}</p>`);
  });

  it('says how many of an ended run’s calls are still under way, and only while some are', () => {
    expect(underWayNote(0)).toBeNull();
    expect(underWayNote(1)).toBe('1 AI call this run started is still under way; the cost shown is brought up to date as it ends.');
    expect(underWayNote(3)).toBe('3 AI calls this run started are still under way; the cost shown is brought up to date as they end.');
    for (const status of ['cancelled', 'failed'] as const) {
      expect(panel(status, 3), status).toContain(underWayNote(3));
      expect(panel(status, 0), status).not.toContain('still under way');
    }
  });
});

/**
 * The whole Run screen, as the server renders it (Next renders this client component on the server too), for a run and
 * what the spend book said of it once it ended (RunData.ended).
 */
const runScreen = (run: RunRecord, spend?: RunData['ended']) =>
  renderToStaticMarkup(
    createElement(RunScreen, {
      initial: { view: { run, events: [], checkpoints: [] }, artifacts: {}, ...(spend ? { ended: spend } : {}) },
      presentation: null,
      label: null,
      steps: null,
    }),
  );

// F3R-1 (the re-check of block 1's fix round): RS-5's pieces are tested one by one, and RunScreen joins them. A dropped
// argument fails the typecheck (pollDelay's and runMeter's last parameters have no default). A wrong cost, a wrong count
// on the panel or a wrong test of the run's end fails here. The poll's delay cannot be seen in a server render
// (B1R2-CODE-5), so RunScreen takes it whole from runPollDelay, tested below with what the screen is served (B-039).
describe('the Run screen joins what the spend book says of an ended run (RS-5)', () => {
  it('shows an ended run’s calls under way and its settled cost, and says nothing of them once none is under way', () => {
    for (const status of ['cancelled', 'failed'] as const) {
      const html = runScreen(ended(status), { callsUnderWay: 2, settledUsd: 0.8 });
      expect(html, status).toContain(underWayNote(2));
      expect(html, status).toContain('<span class="meter-spent">$0.80</span>');
      const settled = runScreen(ended(status), { callsUnderWay: 0, settledUsd: 0.4 });
      expect(settled, status).not.toContain('still under way');
      expect(settled, status).toContain('<span class="meter-spent">$0.40</span>');
    }
  });

  it('shows the run record’s cost when the spend book could not be read, and reads its figures only for an ended run', () => {
    expect(runScreen(ended('cancelled'))).toContain('<span class="meter-spent">$0.40</span>');
    expect(runScreen(ended('cancelled'))).not.toContain('still under way');
    // The server sends them only for an ended run; were a running run's poll to carry them, they are not its meter.
    expect(runScreen({ ...ended('cancelled'), status: 'running' }, { callsUnderWay: 2, settledUsd: 0.8 })).toContain('<span class="meter-spent">$0.40</span>');
  });

  // B-039: what RunScreen polls with, from what it was served. A cancelled run whose uncut calls still bill keeps polling
  // until none is under way; it stops once none is, and never polls on its settled cost.
  it('polls a cancelled run while its calls are under way, by their count, not its cost', () => {
    const data = (run: RunRecord, spend?: RunData['ended']) => ({ view: { run, events: [], checkpoints: [] }, ...(spend ? { ended: spend } : {}) });
    for (const status of ['cancelled', 'failed'] as const) {
      expect(runPollDelay(data(ended(status), { callsUnderWay: 2, settledUsd: 0 }), 'ok'), status).toBe(3000);
      expect(runPollDelay(data(ended(status), { callsUnderWay: 0, settledUsd: 0.8 }), 'ok'), status).toBeNull();
      expect(runPollDelay(data(ended(status)), 'ok'), status).toBeNull();
      // While byway is not answering, it retries whatever the run's status.
      expect(runPollDelay(data(ended(status)), 'lost'), status).toBe(3000);
    }
    // A run still going polls briskly; figures sent for it are not its own.
    expect(runPollDelay(data({ ...ended('cancelled'), status: 'running' }, { callsUnderWay: 0, settledUsd: 0 }), 'ok')).toBe(1000);
  });
});
