/**
 * The route strip: a recipe's steps as stops on a line through Explore, Refine and Finish. A filled stop is
 * a step you do, a ring is a step the AI does, a square is a tool. It is the one picture byway uses to answer
 * "who does what, in what order" before anything is spent.
 */
import type { RecipePresentation } from '@byway/contracts';
import { codeForLabel, stageCode, stepTitle, whoLabel, type StageName } from '../view/vocabulary.ts';

interface RouteProps {
  stages: RecipePresentation['stages'];
  technical: boolean;
  variant?: 'full' | 'compact';
  /** Run progress: stages before this one read as done. */
  current?: StageName;
  label?: string;
}

const ORDER: StageName[] = ['Explore', 'Refine', 'Finish'];

export function Route({ stages, technical, variant = 'full', current, label = 'Steps' }: RouteProps) {
  const currentIndex = current ? ORDER.indexOf(current) : -1;
  return (
    <ol className={`route route-${variant}`} aria-label={label}>
      {stages.map((stage) => {
        const index = ORDER.indexOf(stage.stage);
        const state = currentIndex < 0 ? undefined : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'later';
        return (
          <li key={stage.stage} className="route-stage" data-state={state} style={{ flexGrow: stage.steps.length }}>
            <span className="route-stage-name">
              {technical ? `${stage.stage} (${stageCode(stage.stage)})` : stage.stage}
              {state === 'current' ? <span className="sr-only">, in progress</span> : null}
              {state === 'done' ? <span className="sr-only">, done</span> : null}
            </span>
            <ol className="route-stops">
              {stage.steps.map((step, i) => {
                const name = stepTitle(step.label, codeForLabel(step.label), technical);
                return (
                  <li key={`${step.label}-${i}`} className="route-stop" data-who={step.who} title={`${name}: ${step.explainer}`}>
                    <span className="route-dot" aria-hidden="true" />
                    <span className={variant === 'compact' ? 'sr-only' : 'route-label'}>{name}</span>
                    <span className="sr-only">, {whoLabel(step.who)}</span>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

export function RouteLegend() {
  return (
    <p className="route-legend">
      <span data-who="you">
        <span className="route-dot" aria-hidden="true" /> You
      </span>
      <span data-who="ai">
        <span className="route-dot" aria-hidden="true" /> AI
      </span>
      <span data-who="tool">
        <span className="route-dot" aria-hidden="true" /> Tool
      </span>
    </p>
  );
}

/** The explainer for every stop, for people who want to read before starting. */
export function RouteDetails({ stages, technical }: { stages: RecipePresentation['stages']; technical: boolean }) {
  return (
    <details className="route-details">
      <summary>What each step does</summary>
      {stages.map((stage) => (
        <div key={stage.stage} className="route-details-stage">
          <h3>{stage.stage}</h3>
          <dl>
            {stage.steps.map((step, i) => (
              <div key={`${step.label}-${i}`}>
                <dt>
                  {stepTitle(step.label, codeForLabel(step.label), technical)} <span className="muted">({whoLabel(step.who)})</span>
                </dt>
                <dd>{step.explainer}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </details>
  );
}
