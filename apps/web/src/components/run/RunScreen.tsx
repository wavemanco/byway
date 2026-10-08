'use client';

import type { CheckpointResolution, EvidenceLabel as Label, RecipePresentation } from '@byway/contracts';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { answerable } from '../../view/drafts.ts';
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
import { createDraftStore } from './draftStore.ts';
import { RunStatusPanel } from './RunStatusPanel.tsx';
import { StepDetail } from './StepDetail.tsx';
import { Timeline } from './Timeline.tsx';
import { UnsentWords } from './UnsentWords.tsx';
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
 * only the latest-issued request may replace (useRefresher, F15), and the person's unsent answers, kept per question
 * above the working area's conditional render (the draft store, F06). It is mounted once per run (the page keys it by
 * the run's id).
 */
export function RunScreen({ initial, presentation, label, steps }: Props) {
  const technical = useTechnicalNames();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('ok');
  const [busy, setBusy] = useState(false);
  // An answer's error belongs to its question: a refusal of one is not shown above the next ('control': Pause etc.).
  const [error, setError] = useState<{ checkpointId: string; message: string } | null>(null);
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
  // R3: the turn is shown only while its question is open AND the run has not ended, read from the whole snapshot.
  const turn = active && answerable(active, run.status) ? active : undefined;
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

  // F06: the person's unsent answers, owned here, above the working area's conditional render. The store is made once
  // per mount without side effects; it loads after hydration (so the server HTML and the first client render agree)
  // and an unmount only flushes, never ends it, because StrictMode runs setup, cleanup and setup again.
  const [drafts] = useState(() => createDraftStore(runId));
  useSyncExternalStore(drafts.subscribe, drafts.getVersion, drafts.getVersion);
  const draftsReady = drafts.isReady();
  useEffect(() => {
    drafts.load();
    const detach = drafts.attach();
    return () => {
      drafts.flush();
      detach();
    };
  }, [drafts]);
  // Drafts are settled only by server state: after every applied snapshot, and once they are loaded.
  useEffect(() => {
    if (draftsReady) drafts.settle(checkpoints, run.status);
  }, [drafts, draftsReady, checkpoints, run.status]);
  const unsent = draftsReady ? drafts.unsent(checkpoints, run.status) : [];

  async function resolve(resolution: CheckpointResolution) {
    const { checkpointId, ...answer } = resolution;
    const cp = checkpoints.find((c) => c.id === checkpointId);
    setBusy(true);
    setError(null);
    try {
      await post(`/api/runs/${encodeURIComponent(runId)}/checkpoints/${encodeURIComponent(checkpointId)}`, answer);
    } catch (err) {
      // Not accepted: the draft is untouched, so the person can send it again.
      setError({ checkpointId, message: err instanceof Error ? err.message : 'That answer was not sent. Try again.' });
      setBusy(false);
      return;
    }
    // Accepted: the turn stays locked with the person's own answer until a snapshot shows the question closed.
    if (cp) drafts.markSent(cp);
    await refresher.now();
    setBusy(false);
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
      setError({ checkpointId: 'control', message: err instanceof Error ? err.message : 'That did not work. Try again.' });
    } finally {
      setPending(null);
    }
  }

  const shownError = error && (error.checkpointId === 'control' || error.checkpointId === turn?.id) ? error.message : null;
  const status = runStatusLabel(run.status);
  const announcement = paused ? 'Run paused.' : turn ? `Your turn: ${turn.prompt}` : ended ? `Run ${status.toLowerCase()}.` : '';

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
      {shownError ? (
        <p className="notice notice-danger" role="alert">
          {shownError}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="run-body">
        {/* The working area comes first in reading and Tab order; wide screens place the timeline to its left (UX-11). */}
        <div className="run-work">
          {unsent.length > 0 ? <UnsentWords items={unsent} onDiscard={(id) => drafts.discard(id)} /> : null}
          {/* Opening a step replaces the turn on screen; the turn's draft lives in the store, so nothing is lost. */}
          {selectedStep ? (
            <StepDetail step={selectedStep} artifacts={data.artifacts} onClose={() => setSelected(null)} closeLabel={turn ? 'Back to your turn' : 'Back'} />
          ) : turn ? (
            // Until the kept drafts are loaded (one tick after hydration) the slot stays empty, so the panel opens with
            // the person's draft rather than the starting text, and the status panel never flashes in between.
            draftsReady ? (
              <YourTurn
                key={turn.id}
                cp={turn}
                step={stages.flatMap((s) => s.steps).find((s) => s.checkpointIds.includes(turn.id))}
                artifacts={data.artifacts}
                busy={busy}
                paused={paused}
                onSubmit={resolve}
                draft={drafts.get(turn)}
                onDraft={(draft) => drafts.put(turn, draft)}
                sent={drafts.isSent(turn.id)}
              />
            ) : null
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
