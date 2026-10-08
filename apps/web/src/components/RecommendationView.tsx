'use client';

import type { ChooserAnswer, ChooserQuestion, CostEstimate, EvidenceLabel as Label, Recommendation, RecipePresentation } from '@byway/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import type { ComposeView } from '../server/api.ts';
import { formatCallRange, formatCostRange, formatMinutes, formatUsd, parseBudgetInput, suggestBudget } from '../view/format.ts';
import { ROUTING_NOTE, answerNote, decidingQuestion, fitText } from '../view/labels.ts';
import { recipeTitle } from '../view/vocabulary.ts';
import { post } from './api.ts';
import { EvidenceLabel } from './EvidenceLabel.tsx';
import { Route, RouteDetails, RouteLegend } from './Route.tsx';
import { clearStartDraft } from './startDraft.ts';
import { Switch } from './Switch.tsx';
import { useTechnicalNames } from './TechNames.tsx';

export interface RecipeOption {
  presentation: RecipePresentation;
  label: Label;
  estimate: CostEstimate;
}

type Selection = { kind: 'recipe'; recipeId: string } | { kind: 'composed' };

interface Props {
  intakeId: string;
  problem: string;
  attachments: string[];
  /** Null when the person picked a recipe from the library. */
  recommendation: Recommendation | null;
  chosenRecipeId: string | null;
  questions: ChooserQuestion[];
  options: Record<string, RecipeOption>;
  composed?: ComposeView | null;
  remainingUsd: number;
  demo: boolean;
}

export function RecommendationView(props: Props) {
  const { intakeId, recommendation: initial, chosenRecipeId, options, questions, demo } = props;
  const router = useRouter();
  const technical = useTechnicalNames();
  const [rec, setRec] = useState(initial);
  const [composed, setComposed] = useState<ComposeView | null>(props.composed ?? null);
  const [selection, setSelection] = useState<Selection>({ kind: 'recipe', recipeId: chosenRecipeId ?? initial?.recipeId ?? 'c4' });
  const [routing, setRouting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current: RecipeOption | null =
    selection.kind === 'composed' ? (composed ? { presentation: composed.presentation, label: composed.label, estimate: composed.estimate } : null) : (options[selection.recipeId] ?? null);
  const isRecommended = rec !== null && selection.kind === 'recipe' && selection.recipeId === rec.recipeId;

  async function flip(questionId: string, answer: boolean) {
    if (!rec) return;
    const answers = rec.answers.map((a): ChooserAnswer => (a.questionId === questionId ? { ...a, answer, confidence: 1, setBy: 'user' } : a));
    setRec({ ...rec, answers });
    setRouting(true);
    setError(null);
    try {
      const next = await post<Recommendation>(`/api/intakes/${intakeId}/recommend`, { answers });
      const changed = next.recipeId !== rec.recipeId;
      setRec(next);
      setSelection({ kind: 'recipe', recipeId: next.recipeId });
      setNotice(changed ? `Now recommending ${recipeTitle(next.presentation, technical)}.` : `Still ${recipeTitle(next.presentation, technical)}.`);
    } catch (err) {
      setRec(rec);
      setError(err instanceof Error ? err.message : 'Routing failed. Try again.');
    } finally {
      setRouting(false);
    }
  }

  async function compose() {
    setComposing(true);
    setError(null);
    try {
      const result = await post<ComposeView>(`/api/intakes/${intakeId}/compose`, {});
      setComposed(result);
      setSelection({ kind: 'composed' });
      setNotice('Your recipe is ready. It is shown above.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Composing failed. Try again.');
    } finally {
      setComposing(false);
    }
  }

  const tag = selection.kind === 'composed' ? null : isRecommended && rec ? fitText(rec.fit) : chosenRecipeId === selection.recipeId ? 'From the library' : 'Your choice';

  return (
    <div className="recommend">
      <p className="problem-echo">
        <span className="muted">For </span>
        <q>{props.problem}</q>
        {props.attachments.length > 0 ? <span className="muted"> with {props.attachments.join(', ')}</span> : null}{' '}
        <Link href="/">Change</Link>
      </p>

      <div className="recommend-grid">
        {current ? (
          <Proposal
            key={selection.kind === 'composed' ? 'composed' : selection.recipeId}
            intakeId={intakeId}
            option={current}
            tag={tag}
            heading={selection.kind === 'composed' ? 'Your recipe' : isRecommended ? 'Recommended' : chosenRecipeId === selection.recipeId ? 'Your recipe from the library' : 'Your choice'}
            recipeId={selection.kind === 'recipe' ? selection.recipeId : undefined}
            routes={isRecommended && rec ? rec.routes : undefined}
            composed={selection.kind === 'composed' ? composed : null}
            remainingUsd={props.remainingUsd}
            demo={demo}
            onStarted={(runId) => {
              clearStartDraft();
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

          {rec ? (
            <>
              <section className="aside-section" aria-labelledby="why-title">
                <h2 id="why-title">Why this recipe</h2>
                <p>{rec.why}</p>
                {rec.composeSuggested ? <p className="muted">None of the recipes clearly fits. Building your own may suit this better.</p> : null}
              </section>

              <Chooser questions={questions} answers={rec.answers} busy={routing} onFlip={flip} />

              <section className="aside-section" aria-labelledby="alt-title">
                  <h2 id="alt-title">Other recipes</h2>
                  <ul className="plain-list alternatives">
                    {!isRecommended ? (
                      <li>
                        <button type="button" className="link-button" onClick={() => setSelection({ kind: 'recipe', recipeId: rec.recipeId })}>
                          Back to {recipeTitle(rec.presentation, technical)}
                        </button>
                        <span className="muted"> the recommendation</span>
                      </li>
                    ) : null}
                    {rec.alternatives
                      .filter((alt) => !(selection.kind === 'recipe' && selection.recipeId === alt.recipeId))
                      .map((alt) => (
                        <li key={alt.recipeId}>
                          <button type="button" className="link-button" onClick={() => setSelection({ kind: 'recipe', recipeId: alt.recipeId })}>
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
          ) : (
            <section className="aside-section">
              <h2>You chose this recipe</h2>
              <p className="muted">byway did not run its chooser. Go back to Start without a recipe to get a recommendation.</p>
            </section>
          )}

          <section className="aside-section" aria-labelledby="compose-title">
            <h2 id="compose-title">Build my own</h2>
            <p className="muted">
              byway can compose a recipe for this problem from the protocol’s blocks, starting from the closest one. A composed recipe is checked against
              the protocol’s rules, but it has not been tested.
            </p>
            {selection.kind === 'composed' ? null : composed ? (
              <button type="button" className="button" onClick={() => setSelection({ kind: 'composed' })}>
                Show your recipe
              </button>
            ) : (
              <button type="button" className="button" onClick={compose} disabled={composing}>
                {composing ? 'Composing…' : 'Build my own'}
              </button>
            )}
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
                <p id={`${id}-note`} className="chooser-note">
                  {deciding === q.id ? <strong>Decides. </strong> : null}
                  {answerNote(answer)}
                </p>
              </div>
              <div className="chooser-answer">
                <span aria-hidden="true">{answer.answer ? 'Yes' : 'No'}</span>
                <Switch checked={answer.answer} onChange={(next) => onFlip(q.id, next)} labelledBy={id} describedBy={`${id}-note`} disabled={busy} />
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
  onStarted: (runId: string) => void;
}

function Proposal({ intakeId, option, heading, tag, recipeId, routes, composed, remainingUsd, demo, onStarted }: ProposalProps) {
  const technical = useTechnicalNames();
  const budgetId = useId();
  const { presentation, label, estimate } = option;
  const [budgetText, setBudgetText] = useState(() => suggestBudget(estimate).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const budget = parseBudgetInput(budgetText);
  const blocked = composed !== null && !composed.ok;

  useEffect(() => setError(null), [budgetText]);

  async function start() {
    if (budget === null) {
      setError('Enter a budget in dollars, more than $0 and at most $1,000.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { runId } = await post<{ runId: string }>('/api/runs', {
        intakeId,
        budgetUsd: budget,
        ...(recipeId ? { recipeId } : {}),
        ...(routes && Object.keys(routes).length > 0 ? { routes } : {}),
      });
      onStarted(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The run did not start. Try again.');
      setBusy(false);
    }
  }

  return (
    <section className="proposal" aria-labelledby="proposal-title">
      <p className="proposal-kicker">
        {heading}
        {tag ? <span className="tag">{tag}</span> : null}
      </p>
      <h1 id="proposal-title">{recipeTitle(presentation, technical)}</h1>
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
          <dt>Cost</dt>
          <dd>
            {formatCostRange(estimate.lowUsd, estimate.highUsd)}
            <span className="facts-sub">{formatCallRange(estimate.modelCalls)}</span>
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            <EvidenceLabel label={label} withSummary />
          </dd>
        </div>
      </dl>

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
              <p>It did not pass the protocol checks, so it cannot run:</p>
              <ul>
                {composed.violations.map((v) => (
                  <li key={`${v.ruleId}-${v.message}`}>
                    {v.message}
                    {technical ? <span className="muted"> ({v.ruleId})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="routing-note">{ROUTING_NOTE}</p>
      <RouteDetails stages={presentation.stages} technical={technical} />

      <form
        className="start-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
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
          The run stops and asks before it would spend more. {formatUsd(remainingUsd)} left in your workspace.
          {demo ? ' Demo mode: costs are sample figures and nothing is charged.' : null}
        </p>
        <button type="submit" className="button button-primary button-large" disabled={busy || blocked}>
          {busy ? 'Starting…' : budget === null ? 'Start' : `Start with ${formatUsd(budget)}`}
        </button>
        <p className="error-text start-bar-error" role="alert">
          {error}
        </p>
      </form>
    </section>
  );
}
