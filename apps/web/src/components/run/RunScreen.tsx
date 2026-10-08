'use client';

import type { CheckpointResolution, EvidenceLabel as Label, RecipePresentation } from '@byway/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { controlPendingLabel, runStatusLabel, type ControlAction } from '../../view/labels.ts';
import { runMeter } from '../../view/meter.ts';
import type { Connection } from '../../view/refresh.ts';
import { activeCheckpoint, isEnded, pollDelay } from '../../view/run.ts';
import { lastSeq, mergeRunData, type RunData } from '../../view/rundata.ts';
import type { StepIndex } from '../../view/steps.ts';
import { buildTimeline, currentStep } from '../../view/timeline.ts';
import { recipeTitle } from '../../view/vocabulary.ts';
import { get, post } from '../api.ts';
import { EvidenceLabel } from '../EvidenceLabel.tsx';
import { Route } from '../Route.tsx';
import { useTechnicalNames } from '../TechNames.tsx';
import { usePolling, useRefresher } from '../useRefresher.ts';
import { RunStatusPanel } from './RunStatusPanel.tsx';
import { StepDetail } from './StepDetail.tsx';
import { Timeline } from './Timeline.tsx';
import { YourTurn } from './YourTurn.tsx';

/** How long to wait before retrying while byway is not answering, whatever the run's status. */
const LOST_RETRY_MS = 3000;

interface Props {
  initial: RunData;
  presentation: RecipePresentation | null;
  label: Label | null;
  /** Run events → plain step labels, from the presentation's stepIds (null when the recipe is unknown). */
  steps: StepIndex | null;
}

/**
 * Run (spec §5, screen 3). This component owns the screen's state (ADR-0082): the latest applied server snapshot, which
 * only the latest-issued request may replace (useRefresher, F15). It is mounted once per run (the page keys it by the
 * run's id).
 */
export function RunScreen({ initial, presentation, label, steps }: Props) {
  const technical = useTechnicalNames();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('ok');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // UX-10: Pause, Resume and Cancel take a moment to reach the engine; the button says so at once.
  const [pending, setPending] = useState<ControlAction | null>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const latest = useRef(data);
  latest.current = data;

  // The header (meter, status, Pause, Cancel) stays in view while the page scrolls; the timeline sits below it.
  useEffect(() => {
    const head = headRef.current;
    const root = rootRef.current;
    if (!head || !root) return;
    const update = () => root.style.setProperty('--run-head-h', `${head.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  const { run, events, checkpoints } = data.view;
  const runId = run.id;
  const stages = useMemo(() => buildTimeline(events, checkpoints, run.status, steps), [events, checkpoints, run.status, steps]);
  const active = activeCheckpoint(checkpoints);
  const step = currentStep(stages);
  const ended = isEnded(run.status);
  const paused = run.status === 'paused';
  const meter = runMeter(run, events);
  const selectedStep = selected ? stages.flatMap((s) => s.steps).find((s) => s.key === selected) : undefined;

  // F15: one owner of the request sequence. Only the latest-issued request applies a snapshot or sets the connection.
  const refresher = useRefresher(
    runId,
    (signal) => get<RunData>(`/api/runs/${encodeURIComponent(runId)}?after=${lastSeq(latest.current)}`, signal),
    (next) => setData((prev) => mergeRunData(prev, next)),
    setConnection,
  );
  // Poll while the run can still change: briskly while the AI works, lazily while it waits for you. While byway is not
  // answering, keep retrying whatever the last status said, so the banner clears on an ended run too.
  usePolling(refresher, connection === 'lost' ? LOST_RETRY_MS : pollDelay(run.status));

  async function resolve(resolution: CheckpointResolution) {
    setBusy(true);
    setError(null);
    try {
      const { checkpointId, ...answer } = resolution;
      await post(`/api/runs/${encodeURIComponent(runId)}/checkpoints/${encodeURIComponent(checkpointId)}`, answer);
      await refresher.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That answer was not sent. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function control(action: ControlAction) {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      await post(`/api/runs/${encodeURIComponent(runId)}/control`, { action });
      setConfirmCancel(false);
      // The Cancel dialog that had focus is gone: focus goes to the run's status, which now says what happened (UX-2).
      if (action === 'cancel') statusRef.current?.focus();
      await refresher.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setPending(null);
    }
  }

  const status = runStatusLabel(run.status);
  const announcement = paused ? 'Run paused.' : active && !ended ? `Your turn: ${active.prompt}` : ended ? `Run ${status.toLowerCase()}.` : '';

  return (
    <div className="run" ref={rootRef}>
      <header className="run-head" ref={headRef}>
        <div className="run-title">
          <p className="run-recipe">
            {presentation ? recipeTitle(presentation, technical) : 'Recipe'}
            {label ? <EvidenceLabel label={label} /> : null}
          </p>
          <h1>{run.title}</h1>
        </div>
        <div className="run-side">
          <div className="meter" data-tone={meter.tone}>
            <p className="meter-text">
              <span className="meter-spent">{meter.spent}</span>
              {meter.budget ? <span className="muted"> of {meter.budget}</span> : <span className="muted"> spent</span>}
            </p>
            {meter.fraction !== null ? (
              <div
                className="meter-bar"
                role="meter"
                aria-label="Spent of this run’s budget"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(meter.fraction * 100)}
                aria-valuetext={`${meter.spent} of ${meter.budget}`}
              >
                <span style={{ transform: `scaleX(${meter.fraction})` }} />
              </div>
            ) : null}
          </div>
          <span className="run-status" data-status={run.status} ref={statusRef} tabIndex={-1}>
            {status}
          </span>
          {ended ? null : confirmCancel ? (
            <div className="confirm-inline" role="group" aria-label="Cancel this run?">
              <span>Cancel this run? What it made so far is kept.</span>
              <button type="button" className="button button-danger" onClick={() => void control('cancel')} aria-disabled={pending !== null} aria-busy={pending === 'cancel'}>
                {pending === 'cancel' ? controlPendingLabel('cancel') : 'Cancel run'}
              </button>
              <button type="button" className="button button-quiet" onClick={() => setConfirmCancel(false)} autoFocus>
                Keep going
              </button>
            </div>
          ) : (
            <div className="run-controls">
              {paused ? (
                <button type="button" className="button" onClick={() => void control('resume')} aria-disabled={pending !== null} aria-busy={pending === 'resume'}>
                  {pending === 'resume' ? controlPendingLabel('resume') : 'Resume'}
                </button>
              ) : (
                <button type="button" className="button" onClick={() => void control('pause')} aria-disabled={pending !== null} aria-busy={pending === 'pause'}>
                  {pending === 'pause' ? controlPendingLabel('pause') : 'Pause'}
                </button>
              )}
              <button type="button" className="button" onClick={() => setConfirmCancel(true)} aria-disabled={pending !== null}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </header>

      {presentation ? (
        <div className="run-route">
          <Route stages={presentation.stages} technical={technical} variant="compact" current={ended ? undefined : step?.stage} label="Progress through the recipe" />
        </div>
      ) : null}

      {connection === 'lost' ? (
        <p className="notice notice-caution" role="status">
          byway is not answering. Retrying; check that it is still running.
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="run-body">
        {/* The working area comes first in reading and Tab order; wide screens place the timeline to its left (UX-11). */}
        <div className="run-work">
          {selectedStep ? (
            <StepDetail step={selectedStep} artifacts={data.artifacts} onClose={() => setSelected(null)} closeLabel={active ? 'Back to your turn' : 'Back'} />
          ) : active && !ended ? (
            <YourTurn key={active.id} cp={active} step={stages.flatMap((s) => s.steps).find((s) => s.checkpointIds.includes(active.id))} artifacts={data.artifacts} busy={busy} paused={paused} onSubmit={resolve} />
          ) : (
            <RunStatusPanel run={run} step={step} stages={stages} artifacts={data.artifacts} />
          )}
        </div>
        <aside className="run-timeline" aria-label="Steps">
          <Timeline stages={stages} artifacts={data.artifacts} selected={selected} onSelect={(key) => setSelected((cur) => (cur === key ? null : key))} />
        </aside>
      </div>
    </div>
  );
}
