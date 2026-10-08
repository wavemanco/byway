'use client';

import type { CheckpointResolution, EvidenceLabel as Label, RecipePresentation } from '@byway/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runStatusLabel } from '../../view/labels.ts';
import { budgetMeter } from '../../view/meter.ts';
import { activeCheckpoint, isEnded, pollDelay } from '../../view/run.ts';
import { lastSeq, mergeRunData, type RunData } from '../../view/rundata.ts';
import { buildTimeline, currentStep } from '../../view/timeline.ts';
import { recipeTitle } from '../../view/vocabulary.ts';
import { get, post } from '../api.ts';
import { EvidenceLabel } from '../EvidenceLabel.tsx';
import { Route } from '../Route.tsx';
import { useTechnicalNames } from '../TechNames.tsx';
import { RunStatusPanel } from './RunStatusPanel.tsx';
import { StepDetail } from './StepDetail.tsx';
import { Timeline } from './Timeline.tsx';
import { YourTurn } from './YourTurn.tsx';

interface Props {
  initial: RunData;
  presentation: RecipePresentation | null;
  label: Label | null;
}

export function RunScreen({ initial, presentation, label }: Props) {
  const technical = useTechnicalNames();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [connection, setConnection] = useState<'ok' | 'lost'>('ok');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const latest = useRef(data);
  latest.current = data;

  const { run, events, checkpoints } = data.view;
  const runId = run.id;
  const stages = useMemo(() => buildTimeline(events, checkpoints, run.status), [events, checkpoints, run.status]);
  const active = activeCheckpoint(checkpoints);
  const step = currentStep(stages);
  const ended = isEnded(run.status);
  const meter = budgetMeter(run.costUsd, data.budgetUsd);
  const selectedStep = selected ? stages.flatMap((s) => s.steps).find((s) => s.key === selected) : undefined;

  const refresh = useCallback(async () => {
    try {
      const next = await get<RunData>(`/api/runs/${encodeURIComponent(runId)}?after=${lastSeq(latest.current)}`);
      setData((prev) => mergeRunData(prev, next));
      setConnection('ok');
    } catch {
      setConnection('lost');
    }
  }, [runId]);

  // Poll while the run can still change: briskly while the AI works, lazily while it waits for you.
  const delay = pollDelay(run.status, data.paused);
  useEffect(() => {
    if (delay === null) return;
    let timer = 0;
    const tick = () => {
      // A hidden tab skips its polls; the run carries on and the screen catches up when you come back.
      if (document.visibilityState === 'visible') void refresh();
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [delay, refresh]);

  async function resolve(resolution: CheckpointResolution) {
    setBusy(true);
    setError(null);
    try {
      const { checkpointId, ...answer } = resolution;
      await post(`/api/runs/${encodeURIComponent(runId)}/checkpoints/${encodeURIComponent(checkpointId)}`, answer);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That answer was not sent. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function control(action: 'pause' | 'resume' | 'cancel') {
    setError(null);
    try {
      await post(`/api/runs/${encodeURIComponent(runId)}/control`, { action });
      setConfirmCancel(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    }
  }

  const status = data.paused && !ended ? 'Paused' : runStatusLabel(run.status);
  const announcement = active && !data.paused ? `Your turn: ${active.prompt}` : ended ? `Run ${status.toLowerCase()}.` : '';

  return (
    <div className="run">
      <header className="run-head">
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
          <span className="run-status" data-status={data.paused && !ended ? 'paused' : run.status}>
            {status}
          </span>
          {ended ? null : confirmCancel ? (
            <div className="confirm-inline" role="group" aria-label="Cancel this run?">
              <span>Cancel this run? What it made so far is kept.</span>
              <button type="button" className="button button-danger" onClick={() => void control('cancel')}>
                Cancel run
              </button>
              <button type="button" className="button button-quiet" onClick={() => setConfirmCancel(false)} autoFocus>
                Keep going
              </button>
            </div>
          ) : (
            <div className="run-controls">
              {data.canPause ? (
                data.paused ? (
                  <button type="button" className="button" onClick={() => void control('resume')}>
                    Resume
                  </button>
                ) : (
                  <button type="button" className="button" onClick={() => void control('pause')}>
                    Pause
                  </button>
                )
              ) : null}
              <button type="button" className="button" onClick={() => setConfirmCancel(true)}>
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
        <aside className="run-timeline" aria-label="Steps">
          <Timeline stages={stages} artifacts={data.artifacts} selected={selected} onSelect={(key) => setSelected((cur) => (cur === key ? null : key))} />
        </aside>
        <div className="run-work">
          {selectedStep ? (
            <StepDetail step={selectedStep} artifacts={data.artifacts} onClose={() => setSelected(null)} closeLabel={active ? 'Back to your turn' : 'Back'} />
          ) : active && !ended ? (
            <YourTurn key={active.id} cp={active} step={stages.flatMap((s) => s.steps).find((s) => s.checkpointIds.includes(active.id))} artifacts={data.artifacts} busy={busy} paused={data.paused} onSubmit={resolve} />
          ) : (
            <RunStatusPanel run={run} paused={data.paused} step={step} stages={stages} artifacts={data.artifacts} />
          )}
        </div>
      </div>
    </div>
  );
}
