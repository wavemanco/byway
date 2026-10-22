'use client';

import type { CheckpointResolution, EvidenceLabel as Label, RecipePresentation } from '@byway/contracts';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { answerable } from '../../view/drafts.ts';
import { CANCEL_QUESTION, controlPendingLabel, runStatusLabel, type ControlAction } from '../../view/labels.ts';
import { runMeter } from '../../view/meter.ts';
import type { Connection } from '../../view/refresh.ts';
import { HELD_KEY_REFUSAL } from '../../view/refusals.ts';
import { activeCheckpoint, isEnded, pollDelay } from '../../view/run.ts';
import { lastSeq, mergeRunData, type RunData } from '../../view/rundata.ts';
import type { QuestionCosts } from '../../view/questions.ts';
import type { StepIndex } from '../../view/steps.ts';
import { questionCost } from '../../view/questions.ts';
import { buildTimeline, currentStep } from '../../view/timeline.ts';
import { recipeTitle } from '../../view/vocabulary.ts';
import { ActionButton } from '../ActionButton.tsx';
import { ApiError, get, post } from '../api.ts';
import { EvidenceLabel } from '../EvidenceLabel.tsx';
import { Route } from '../Route.tsx';
import { useTechnicalNames } from '../TechNames.tsx';
import { useAction } from '../useAction.ts';
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
  /** What an answer to each optional's and each person's loop's question would cost (null when the recipe is unknown). */
  questions: QuestionCosts | null;
}

/**
 * Run (spec §5, screen 3). This component owns the screen's state (ADR-0082): the latest applied server snapshot, which
 * only the latest-issued request may replace (useRefresher, F15), and the person's unsent answers, kept per question
 * above the working area's conditional render and settled only by snapshots the refresher applied (the draft store,
 * F06). It is mounted once per run (the page keys it by the run's id).
 */
export function RunScreen({ initial, presentation, label, steps, questions }: Props) {
  const technical = useTechnicalNames();
  const [data, setData] = useState(initial);
  // Whether `data` includes a snapshot byway served to this screen's refresher. Until then it is only `initial`: the
  // server render, or on Back the Next.js router cache's copy of it, which can be older than the person's own drafts.
  const [served, setServed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('ok');
  // An answer's error belongs to its question: a refusal of one is not shown above the next ('control': Pause etc.).
  const [error, setError] = useState<{ checkpointId: string; message: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelQuestionId = useId();
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
    (next) => {
      setData((prev) => mergeRunData(prev, next));
      setServed(true);
    },
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
  // Drafts are settled only by server state byway has just served: after every snapshot the refresher applied, once
  // they are loaded. Never by `initial`: on Back it is the cached page, which can show an answered question still open
  // (unlocking a sent answer) or predate a question altogether.
  useEffect(() => {
    if (draftsReady && served) drafts.settle(checkpoints, run.status);
  }, [drafts, draftsReady, served, checkpoints, run.status]);
  const unsent = draftsReady ? drafts.unsent(checkpoints, run.status) : [];

  // Sending an answer is one action in flight (R5): a second send while one is on its way (a double press, Enter on a
  // focused Send, a shortcut) is refused at once, before the panel re-renders as busy.
  const resolving = useAction(async (resolution: CheckpointResolution) => {
    const { checkpointId, ...answer } = resolution;
    const cp = checkpoints.find((c) => c.id === checkpointId);
    setError(null);
    try {
      await post(`/api/runs/${encodeURIComponent(runId)}/checkpoints/${encodeURIComponent(checkpointId)}`, answer);
    } catch (err) {
      // Not accepted: the draft is untouched, so the person can send it again. If it was refused for holding one of
      // byway's provider keys (ADR-0088), the panel keeps it to be edited, but the tab stops keeping it until it is.
      if (err instanceof ApiError && err.code === HELD_KEY_REFUSAL && cp) drafts.withhold(cp, resolution);
      setError({ checkpointId, message: err instanceof Error ? err.message : 'That answer was not sent. Try again.' });
      return;
    }
    // Accepted: the turn stays locked with the person's own answer until a snapshot shows the question closed.
    if (cp) drafts.markSent(cp);
    await refresher.now();
  });
  const busy = resolving.busy;

  // Pause, Resume and Cancel: one at a time, each refused while another is on its way (R5).
  const controlling = useAction(async (action: ControlAction) => {
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
  });
  const control = (action: ControlAction) => void controlling.run(action);

  /**
   * Closes the step opened from the timeline. With no question open, focus goes back to the timeline row that opened it
   * (or the run's status, if that row is gone), not to the page; with one open, the Your turn panel takes focus as it
   * opens again, as it always has (R5).
   */
  function closeStep() {
    const key = selected;
    setSelected(null);
    if (key !== null && !turn) setRefocus({ key });
  }
  const [refocus, setRefocus] = useState<{ key: string } | null>(null);
  useEffect(() => {
    if (!refocus) return;
    const row = [...(rootRef.current?.querySelectorAll<HTMLElement>('.tl-title') ?? [])].find((el) => el.dataset.stepKey === refocus.key);
    (row ?? statusRef.current)?.focus();
    setRefocus(null);
  }, [refocus]);

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
            // The whole question describes the group, so a screen reader reads all of it (as ConfirmPanel's does).
            <div className="confirm-inline" role="group" aria-label="Cancel this run?" aria-describedby={cancelQuestionId}>
              <span id={cancelQuestionId}>{CANCEL_QUESTION}</span>
              <ActionButton className="button button-danger" onClick={() => control('cancel')} busy={pending === 'cancel'} unavailable={controlling.busy}>
                {pending === 'cancel' ? controlPendingLabel('cancel') : 'Cancel run'}
              </ActionButton>
              <button type="button" className="button button-quiet" onClick={() => setConfirmCancel(false)} autoFocus>
                Keep going
              </button>
            </div>
          ) : (
            <div className="run-controls">
              {paused ? (
                <ActionButton className="button" onClick={() => control('resume')} busy={pending === 'resume'} unavailable={controlling.busy}>
                  {pending === 'resume' ? controlPendingLabel('resume') : 'Resume'}
                </ActionButton>
              ) : (
                <ActionButton className="button" onClick={() => control('pause')} busy={pending === 'pause'} unavailable={controlling.busy}>
                  {pending === 'pause' ? controlPendingLabel('pause') : 'Pause'}
                </ActionButton>
              )}
              <ActionButton className="button" onClick={() => setConfirmCancel(true)} unavailable={controlling.busy}>
                Cancel
              </ActionButton>
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
            <StepDetail step={selectedStep} artifacts={data.artifacts} onClose={closeStep} closeLabel={turn ? 'Back to your turn' : 'Back'} />
          ) : turn ? (
            // Until the kept drafts are loaded (one tick after hydration) the slot stays empty, so the panel opens with
            // the person's draft rather than the starting text, and the status panel never flashes in between.
            draftsReady ? (
              <YourTurn
                key={turn.id}
                cp={turn}
                step={stages.flatMap((s) => s.steps).find((s) => s.checkpointIds.includes(turn.id))}
                cost={questionCost(turn, questions)}
                artifacts={data.artifacts}
                busy={busy}
                paused={paused}
                onSubmit={(resolution) => void resolving.run(resolution)}
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
          {/* A row opens its step, and pressed again closes it. */}
          <Timeline stages={stages} artifacts={data.artifacts} selected={selected} onSelect={(key) => (selected === key ? closeStep() : setSelected(key))} />
        </aside>
      </div>
    </div>
  );
}
