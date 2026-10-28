'use client';

import type { ChooserAnswer, ChooserQuestion, CostEstimate, EvidenceLabel as Label, Recommendation, RecipePresentation } from '@byway/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ComposeResultView, ComposeView, RecommendResult } from '../server/api.ts';
import { formatCallRange, formatCostRange, formatMinutes, formatUsd, parseBudgetInput, suggestBudget } from '../view/format.ts';
import { composedRefusalGroups, composeNotice } from '../view/composed.ts';
import { ROUTING_NOTE, answerNote, decidingQuestion, fitText, showAnswerNote } from '../view/labels.ts';
import { awaitingFirst, composedAfterStart, composedReady, initialRecState, recovered, rerouted, retryFailed, screen, selected, type RecState, type Selection } from '../view/recommendation.ts';
import type { PricesChecked } from '../view/prices.ts';
import { recipeTitle } from '../view/vocabulary.ts';
import { ActionButton } from './ActionButton.tsx';
import { ApiError, post } from './api.ts';
import { EvidenceLabel } from './EvidenceLabel.tsx';
import { PricesStaleNotice } from './PricesChecked.tsx';
import { Route, RouteDetails, RouteLegend } from './Route.tsx';
import { Examples, exampleCount, storeExamples, type ExampleEntry } from './Examples.tsx';
import { examplesSlot, keepExamples } from './examplesDraft.ts';
import { clearStartDraft } from './startDraft.ts';
import { createStartIdentity } from './startIdentity.ts';
import { Switch } from './Switch.tsx';
import { useTechnicalNames } from './TechNames.tsx';
import { useAction } from './useAction.ts';

export interface RecipeOption {
  presentation: RecipePresentation;
  label: Label;
  estimate: CostEstimate;
  /** The recipe takes your examples (its `refs` input), so the "Examples you admire" field is offered. */
  takesRefs: boolean;
}

interface Props {
  intakeId: string;
  problem: string;
  attachments: string[];
  /** The intake's stored recommendation; null when none is stored yet (the screen asks for it), or for a library pick. */
  recommendation: Recommendation | null;
  chosenRecipeId: string | null;
  questions: ChooserQuestion[];
  options: Record<string, RecipeOption>;
  composed?: ComposeView | null;
  remainingUsd: number;
  demo: boolean;
  /** When byway's prices were last checked, in words, shown with the estimated cost (view/prices.ts; PRICE-CADENCE). */
  prices: PricesChecked;
}

/**
 * Recommendation (spec §5, screen 2). The screen owns its state (F14, ADR-0082): the recommendation, why it failed,
 * what is selected, the composed recipe and what is left in the workspace are seeded once from the server render and
 * then change only through the commands here (Try again, a flipped answer, Build my own), each applying its whole result
 * in one step (view/recommendation.ts). The screen never re-runs its server render, which reads only what is stored:
 * while no recommendation is stored, the screen asks for the first one itself once it is shown, through the same command
 * as Try again, so no render calls the model. The page keys this component by intake and library recipe; the other
 * props (the problem, its attachments, the questions, the recipes on offer, demo mode) cannot change while it is shown.
 */
export function RecommendationView(props: Props) {
  const { intakeId, chosenRecipeId, options, questions, demo, prices } = props;
  const router = useRouter();
  const technical = useTechnicalNames();
  const [state, setState] = useState<RecState>(() =>
    initialRecState({
      recommendation: props.recommendation,
      recommendProblem: null,
      chosenRecipeId,
      composed: props.composed ?? null,
      remainingUsd: props.remainingUsd,
    }),
  );
  const { rec, composed, selection } = state;
  const recipes = useMemo(() => new Set(Object.keys(options)), [options]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept here, not in the proposal, so your examples survive switching to another recipe that takes them; and kept for
  // this tab's session (examplesDraft.ts), so they survive a detour to Settings and back (ADR-0082, R1).
  const [examples, setExamples] = useState<ExampleEntry[]>([]);
  const examplesTouched = useRef(false);
  // Pasted text byway refused for holding one of its provider keys (ADR-0088): it stays on screen to be edited, but the
  // tab stops keeping it, and keeps the other examples. It is kept again once its text is edited.
  const [refusedExamples, setRefusedExamples] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const kept = examplesSlot(intakeId).load();
    if (kept && kept.length > 0) setExamples((current) => (current.length > 0 ? current : kept.map((e, i) => ({ ...e, key: i + 1 }))));
  }, [intakeId]);
  useEffect(() => {
    if (!examplesTouched.current && refusedExamples.size === 0) return;
    keepExamples(intakeId, examples.map(({ key: _key, ...e }) => e), refusedExamples);
  }, [intakeId, examples, refusedExamples]);
  const onExamples = (update: (entries: ExampleEntry[]) => ExampleEntry[]) => {
    examplesTouched.current = true;
    setExamples(update);
  };
  const onExampleRefused = (text: string) => setRefusedExamples((refused) => new Set(refused).add(text));
  // UX-2: an action that replaces what has focus (Build my own, switching recipe) moves focus to the new proposal's
  // title, so keyboard and screen-reader users land on what changed instead of the top of the page.
  const [focusProposal, setFocusProposal] = useState(0);
  useEffect(() => {
    if (focusProposal > 0) document.getElementById('proposal-title')?.focus();
  }, [focusProposal]);
  const select = (next: Selection) => {
    setState((s) => selected(s, next));
    setFocusProposal((n) => n + 1);
  };

  const current: RecipeOption | null =
    selection?.kind === 'composed'
      ? composed
        ? { presentation: composed.presentation, label: composed.label, estimate: composed.estimate, takesRefs: composed.takesRefs }
        : null
      : selection
        ? (options[selection.recipeId] ?? null)
        : null;
  const isRecommended = rec !== null && selection?.kind === 'recipe' && selection.recipeId === rec.recipeId;
  const shown = screen(state, chosenRecipeId, recipes);

  // Try again, a flipped answer and Build my own are each one action in flight (R5): a second press while one is on
  // its way does nothing, and the control keeps focus meanwhile.

  /**
   * The first recommendation, or "Try again": the stored recommendation, or a new one, applied with what is left in the
   * workspace. Try again replaces what has focus, so focus goes to the proposal; the first one fills the screen as it
   * opens, so focus stays where the person is.
   */
  const retrying = useAction(async (first: boolean) => {
    setError(null);
    try {
      const result = await post<RecommendResult>(`/api/intakes/${intakeId}/recommend`, { ensure: true });
      setState((s) => recovered(s, result));
      const title = recipeTitle(result.recommendation.presentation, technical);
      setNotice(first ? `byway recommends ${title}.` : `Now recommending ${title}.`);
      if (!first) setFocusProposal((n) => n + 1);
    } catch (err) {
      setState((s) => retryFailed(s, err instanceof Error ? err.message : 'byway could not recommend a recipe. Try again.'));
    }
  });
  const retry = () => void retrying.run(false);
  // The first recommendation is asked for here, once the screen is shown, never by its render (F03), so the page can be
  // rendered again without calling the model. Another first ask for the intake meanwhile (a second tab, a remount)
  // shares this one's call on the server (firstRecommendation, ADR-0091).
  const askedFirst = useRef(false);
  useEffect(() => {
    if (askedFirst.current || !awaitingFirst(state, chosenRecipeId)) return;
    askedFirst.current = true;
    void retrying.run(true);
    // Once, as the screen is shown: the state it reads is the server render's.
  }, []);

  const routing = useAction(async (questionId: string, answer: boolean) => {
    if (!rec) return;
    const answers = rec.answers.map((a): ChooserAnswer => (a.questionId === questionId ? { ...a, answer, confidence: 1, setBy: 'user' } : a));
    setState((s) => ({ ...s, rec: { ...rec, answers } }));
    setError(null);
    try {
      const result = await post<RecommendResult>(`/api/intakes/${intakeId}/recommend`, { answers });
      const next = result.recommendation;
      const changed = next.recipeId !== rec.recipeId;
      setState((s) => rerouted(s, result));
      setNotice(changed ? `Now recommending ${recipeTitle(next.presentation, technical)}.` : `Still ${recipeTitle(next.presentation, technical)}.`);
    } catch (err) {
      setState((s) => ({ ...s, rec }));
      setError(err instanceof Error ? err.message : 'Routing failed. Try again.');
    }
  });
  const flip = (questionId: string, answer: boolean) => void routing.run(questionId, answer);

  const composing = useAction(async () => {
    setError(null);
    try {
      const result = await post<ComposeResultView>(`/api/intakes/${intakeId}/compose`, {});
      setState((s) => composedReady(s, result));
      setFocusProposal((n) => n + 1);
      setNotice(composeNotice(result.composed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Composing failed. Try again.');
    }
  });
  const compose = () => void composing.run();

  // "Your choice" only for a recipe the person picked from the alternatives: never for a default nobody chose.
  const tag = selection?.kind !== 'recipe' ? null : isRecommended && rec ? fitText(rec.fit) : chosenRecipeId === selection.recipeId ? 'From the library' : 'Your choice';

  return (
    <div className="recommend">
      <p className="problem-echo">
        <span className="muted">For </span>
        <q>{props.problem}</q>
        {props.attachments.length > 0 ? <span className="muted"> with {props.attachments.join(', ')}</span> : null}{' '}
        <Link href="/">Change</Link>
      </p>

      <div className="recommend-grid">
        {shown === 'pending' ? (
          <div className="empty">
            <h1>Choosing a recipe</h1>
            <p>byway is reading what you wrote, to choose a recipe for it.</p>
          </div>
        ) : shown === 'failed' ? (
          <div className="empty" role="alert">
            <h1>byway could not recommend a recipe</h1>
            <p>{state.problem}</p>
            <div className="empty-actions">
              <ActionButton className="button button-primary" onClick={retry} busy={retrying.busy}>
                {retrying.busy ? 'Trying again…' : 'Try again'}
              </ActionButton>
              <Link className="button" href="/library">
                Choose from the Library
              </Link>
            </div>
          </div>
        ) : shown === 'proposal' && current && selection ? (
          <Proposal
            key={selection.kind === 'composed' ? 'composed' : selection.recipeId}
            intakeId={intakeId}
            option={current}
            tag={tag}
            heading={selection.kind === 'composed' ? 'Your recipe' : isRecommended ? 'Recommended' : chosenRecipeId === selection.recipeId ? 'Your recipe from the library' : 'Your choice'}
            recipeId={selection.kind === 'recipe' ? selection.recipeId : undefined}
            routes={isRecommended && rec ? rec.routes : undefined}
            composed={selection.kind === 'composed' ? composed : null}
            remainingUsd={state.remainingUsd}
            demo={demo}
            prices={prices}
            examples={examples}
            onExamples={onExamples}
            onExampleRefused={onExampleRefused}
            onStartRefused={(refusal) => setState((s) => composedAfterStart(s, refusal))}
            onStarted={(runId) => {
              // The problem, its attachments and these examples went into the run: nothing is left to keep.
              clearStartDraft();
              examplesSlot(intakeId).clear();
              router.push(`/runs/${runId}`);
            }}
          />
        ) : (
          <div className="empty">
            <p>That recipe is not available.</p>
          </div>
        )}

        <div className="recommend-aside">
          <p className="sr-only" role="status" aria-live="polite">
            {notice}
          </p>
          {error ? (
            <p className="notice notice-danger" role="alert">
              {error}
            </p>
          ) : null}

          {/* While your own recipe is shown in place of the failure panel, trying again is still on offer here. */}
          {!rec && state.problem !== null && shown !== 'failed' ? (
            <section className="aside-section" aria-labelledby="retry-title">
              <h2 id="retry-title">byway could not recommend a recipe</h2>
              <p className="muted">{state.problem}</p>
              <ActionButton className="button" onClick={retry} busy={retrying.busy}>
                {retrying.busy ? 'Trying again…' : 'Try again'}
              </ActionButton>
            </section>
          ) : null}

          {rec ? (
            <>
              <section className="aside-section" aria-labelledby="why-title">
                <h2 id="why-title">Why this recipe</h2>
                <p>{rec.why}</p>
              </section>

              <Chooser questions={questions} answers={rec.answers} busy={routing.busy} onFlip={flip} />

              <section className="aside-section" aria-labelledby="alt-title">
                  <h2 id="alt-title">Other recipes</h2>
                  <ul className="plain-list alternatives">
                    {!isRecommended ? (
                      <li>
                        <button type="button" className="link-button" onClick={() => select({ kind: 'recipe', recipeId: rec.recipeId })}>
                          Back to the recommendation
                        </button>
                        <span className="muted"> {recipeTitle(rec.presentation, technical)}</span>
                      </li>
                    ) : null}
                    {rec.alternatives
                      .filter((alt) => !(selection?.kind === 'recipe' && selection.recipeId === alt.recipeId))
                      .map((alt) => (
                        <li key={alt.recipeId}>
                          <button type="button" className="link-button" onClick={() => select({ kind: 'recipe', recipeId: alt.recipeId })}>
                            Use {options[alt.recipeId] ? recipeTitle(options[alt.recipeId]!.presentation, technical) : alt.name}
                          </button>
                          <span className="muted"> {alt.why}</span>
                        </li>
                      ))}
                  </ul>
                  <p className="small">
                    <Link href="/library">See all eight recipes</Link>
                  </p>
                </section>
            </>
          ) : chosenRecipeId ? (
            <section className="aside-section">
              <h2>You chose this recipe</h2>
              <p className="muted">byway did not run its chooser. Go back to Start without a recipe to get a recommendation.</p>
            </section>
          ) : null}

          <section className="aside-section" aria-labelledby="compose-title">
            <h2 id="compose-title">Build my own</h2>
            {rec?.composeSuggested ? <p>None of the eight recipes clearly fits this problem, so building your own may suit it better.</p> : null}
            <p className="muted">
              byway can compose a recipe for this problem from the protocol’s blocks, starting from the closest one. A composed recipe is checked against
              the protocol’s rules, but it has not been tested.
            </p>
            <div className="compose-actions">
              {composed && selection?.kind !== 'composed' ? (
                <button type="button" className="button" onClick={() => select({ kind: 'composed' })}>
                  Show your recipe
                </button>
              ) : null}
              {/* UX-3: composing is not deterministic, so a recipe that failed the checks can be built again. */}
              {!composed || !composed.ok ? (
                <ActionButton className="button" onClick={compose} busy={composing.busy}>
                  {composing.busy ? 'Composing…' : composed ? 'Try building again' : 'Build my own'}
                </ActionButton>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Chooser({ questions, answers, busy, onFlip }: { questions: ChooserQuestion[]; answers: ChooserAnswer[]; busy: boolean; onFlip: (id: string, answer: boolean) => void }) {
  const deciding = decidingQuestion(answers);
  const base = useId();
  return (
    <section className="aside-section" aria-labelledby={`${base}-title`} aria-busy={busy}>
      <h2 id={`${base}-title`}>How byway decided</h2>
      <p className="section-note">Seven questions in order; the first yes decides. Flip an answer to choose again.</p>
      <ol className="chooser">
        {questions.map((q) => {
          const answer = answers.find((a) => a.questionId === q.id);
          if (!answer) return null;
          const id = `${base}-${q.id}`;
          return (
            <li key={q.id} className="chooser-q" data-deciding={deciding === q.id ? 'true' : undefined}>
              <div className="chooser-text">
                <p id={id} className="chooser-question">
                  {q.text}
                </p>
                {showAnswerNote(answer) ? (
                  <p id={`${id}-note`} className="chooser-note">
                    {deciding === q.id ? <strong>Decides. </strong> : null}
                    {answerNote(answer)}
                  </p>
                ) : null}
              </div>
              <div className="chooser-answer">
                <span aria-hidden="true">{answer.answer ? 'Yes' : 'No'}</span>
                <Switch
                  checked={answer.answer}
                  onChange={(next) => onFlip(q.id, next)}
                  labelledBy={id}
                  {...(showAnswerNote(answer) ? { describedBy: `${id}-note` } : {})}
                  busy={busy}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface ProposalProps {
  intakeId: string;
  option: RecipeOption;
  heading: string;
  tag: string | null;
  recipeId: string | undefined;
  routes: Record<string, string> | undefined;
  composed: ComposeView | null;
  remainingUsd: number;
  demo: boolean;
  prices: PricesChecked;
  examples: ExampleEntry[];
  onExamples: (update: (entries: ExampleEntry[]) => ExampleEntry[]) => void;
  /** byway refused this pasted example for holding one of its provider keys (ADR-0088). */
  onExampleRefused: (text: string) => void;
  onStarted: (runId: string) => void;
  /** Start was refused: the screen applies what the refusal carries (a composed recipe admitted again, ADR-0092). */
  onStartRefused: (refusal: ApiError) => void;
}

function Proposal({ intakeId, option, heading, tag, recipeId, routes, composed, remainingUsd, demo, prices, examples, onExamples, onExampleRefused, onStarted, onStartRefused }: ProposalProps) {
  const technical = useTechnicalNames();
  const budgetId = useId();
  const { presentation, label, estimate } = option;
  const [budgetText, setBudgetText] = useState(() => suggestBudget(estimate).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const budget = parseBudgetInput(budgetText);
  const blocked = composed !== null && !composed.ok;

  useEffect(() => setError(null), [budgetText]);

  // Starting a run is one action in flight (R5): a second start while one is on its way does nothing, and on success it
  // holds until the Run screen replaces this one. A recipe that failed its checks cannot start, so nothing (not even an
  // example) is sent for it. The start names its run (F03 P3, startIdentity.ts): a Start whose answer never came back,
  // pressed again with the same inputs, sends the same id and gets the run it may have started instead of a second one;
  // after byway refused it, or with other inputs, it is a new Start.
  const [startIdentity] = useState(createStartIdentity);
  const starting = useAction(async () => {
    if (blocked) return;
    if (budget === null) {
      setError('Enter a budget in dollars, more than $0 and at most $1,000.');
      return;
    }
    setError(null);
    try {
      // Examples go only to a recipe that takes them; they stay on this screen if you switch to one that does not.
      const refs = option.takesRefs && exampleCount(examples) > 0 ? await storeExamples(examples, onExampleRefused) : [];
      const body = {
        intakeId,
        budgetUsd: budget,
        ...(recipeId ? { recipeId } : {}),
        ...(routes && Object.keys(routes).length > 0 ? { routes } : {}),
        ...(refs.length > 0 ? { refs } : {}),
      };
      const { runId } = await startIdentity.send({ body, composed }, (id) => post<{ runId: string }>('/api/runs', { ...body, runId: id }));
      onStarted(runId);
      return 'hold';
    } catch (err) {
      // Start admits a composed recipe again (ADR-0092): when it now fails or reads differently, the refusal carries what
      // the screen should show instead, and the message says why the run did not start.
      if (err instanceof ApiError) onStartRefused(err);
      setError(err instanceof Error ? err.message : 'The run did not start. Try again.');
    }
  });
  const busy = starting.busy;

  return (
    <section className="proposal" aria-labelledby="proposal-title">
      <p className="proposal-kicker">
        {heading}
        {tag ? <span className="tag">{tag}</span> : null}
      </p>
      <h1 id="proposal-title" tabIndex={-1}>
        {recipeTitle(presentation, technical)}
      </h1>
      <p className="proposal-promise">{presentation.promise}</p>

      <div className="proposal-route">
        <Route stages={presentation.stages} technical={technical} label="Steps, and who does each" />
        <RouteLegend />
      </div>

      <dl className="facts">
        <div>
          <dt>Your time</dt>
          <dd>{formatMinutes(estimate.humanMinutes)}</dd>
        </div>
        <div>
          <dt>Estimated cost</dt>
          <dd>
            {formatCostRange(estimate.lowUsd, estimate.highUsd)}
            <span className="facts-sub">{formatCallRange(estimate.modelCalls)}</span>
            <span className="facts-sub">{prices.text}</span>
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            <EvidenceLabel label={label} withSummary />
          </dd>
        </div>
      </dl>
      <PricesStaleNotice prices={prices} />

      {composed ? (
        <div className="composed">
          <h2>How it differs</h2>
          <ul>
            {composed.diff.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {composed.violations.length > 0 ? (
            <div className="notice notice-danger">
              {composedRefusalGroups(composed.violations).map((group) => (
                <div key={group.lead}>
                  <p>{group.lead}</p>
                  <ul>
                    {group.items.map((v) => (
                      <li key={`${v.ruleId}-${v.message}`}>
                        {v.message}
                        {technical ? <span className="muted"> ({v.ruleId})</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="routing-note">{ROUTING_NOTE}</p>
      <RouteDetails stages={presentation.stages} technical={technical} />

      {option.takesRefs ? <Examples entries={examples} onChange={onExamples} disabled={busy} /> : null}

      <form
        className="start-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void starting.run();
        }}
      >
        <div className="field">
          <label htmlFor={budgetId}>Budget for this run</label>
          <span className="money">
            <span aria-hidden="true">$</span>
            <input
              id={budgetId}
              inputMode="decimal"
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value)}
              aria-invalid={budget === null ? true : undefined}
              aria-describedby={`${budgetId}-help`}
            />
          </span>
        </div>
        <p id={`${budgetId}-help`} className="start-bar-help">
          The run asks before starting a call whose estimated cost would take it over this budget. Estimates can be low, so a call can cost more than its estimate, and a run can end over this budget. {formatUsd(remainingUsd)} left in your workspace.
          {demo ? ' Demo mode: costs are sample figures and nothing is charged.' : null}
        </p>
        {/* Busy or blocked, it keeps focus and a press (Enter in the budget field included) submits nothing (R5). */}
        <ActionButton type="submit" className="button button-primary button-large" busy={busy} unavailable={blocked}>
          {busy ? 'Starting…' : budget === null ? 'Start' : `Start with ${formatUsd(budget)}`}
        </ActionButton>
        <p className="error-text start-bar-error" role="alert">
          {error}
        </p>
      </form>
    </section>
  );
}
