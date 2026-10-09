'use client';

import { formatUsd } from '../../view/format.ts';
import type { ArtifactInfo } from '../../view/rundata.ts';
import type { StepStatus, TimelineStage, TimelineStep } from '../../view/timeline.ts';
import { codeForLabel, stageCode, stepTitle, whoLabel } from '../../view/vocabulary.ts';
import { useTechnicalNames } from '../TechNames.tsx';
import { StepThumbs } from './StepThumbs.tsx';

const STATUS_WORDS: Record<StepStatus, string> = {
  running: 'In progress',
  waiting: 'Your turn',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
  stopped: 'Stopped',
};

/**
 * A small status glyph; its meaning is also given in words for screen readers, unless the row already says it in
 * visible words (a skipped step's "Skipped", a partly skipped one's "Part skipped").
 */
export function StatusIcon({ status, announce = true, partial = false }: { status: StepStatus; announce?: boolean; partial?: boolean }) {
  const done = status === 'done' && !partial;
  return (
    <span className="status-icon" data-status={status} data-partial={partial ? 'true' : undefined}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {done ? <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {status === 'done' && partial ? <path d="M3.5 8.5l2 2L9 7M10 8h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {status === 'running' ? <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="20 12" /> : null}
        {status === 'waiting' ? <circle cx="8" cy="8" r="4.5" fill="currentColor" /> : null}
        {status === 'failed' ? <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
        {status === 'skipped' ? <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
        {status === 'stopped' ? <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      </svg>
      {announce ? <span className="sr-only">{STATUS_WORDS[status]}: </span> : null}
    </span>
  );
}

/** A done row some of whose steps were skipped (UX-7): not a plain check, and it says so. */
export const partlySkipped = (step: TimelineStep): boolean => step.status === 'done' && step.skippedParts.length > 0;

function meta(step: TimelineStep): string[] {
  // ADR-0069: a step that could not run says so in words, with its note below.
  if (step.status === 'skipped') return [STATUS_WORDS.skipped];
  const parts = [whoLabel(step.who)];
  if (partlySkipped(step)) parts.push('Part skipped');
  if (step.round > 1) parts.push(`round ${step.round}`);
  if (step.iterations > 1) parts.push(`${step.iterations} passes`);
  if (step.judged) parts.push(step.judged);
  if (step.candidates > 1) parts.push(`${step.candidates} drafts`);
  return parts;
}

interface TimelineProps {
  stages: TimelineStage[];
  artifacts: Record<string, ArtifactInfo>;
  selected: string | null;
  onSelect: (key: string) => void;
}

/** The run's steps grouped by Explore / Refine / Finish, each a quiet row with status, cost and outputs. */
export function Timeline({ stages, artifacts, selected, onSelect }: TimelineProps) {
  const technical = useTechnicalNames();
  if (stages.length === 0) {
    return <p className="muted tl-empty">Getting ready…</p>;
  }
  return (
    <div className="timeline">
      {stages.map((stage, i) => (
        <section key={`${stage.stage}-${i}`} className="tl-stage" aria-label={stage.stage}>
          <h2 className="tl-stage-name">{technical ? `${stage.stage} (${stageCode(stage.stage)})` : stage.stage}</h2>
          <ol className="tl-steps">
            {stage.steps.map((step) => {
              const title = stepTitle(step.label, codeForLabel(step.label) ?? step.block, technical);
              return (
                <li key={step.key} className="tl-step" data-status={step.status} data-who={step.who} data-selected={selected === step.key ? 'true' : undefined}>
                  <StatusIcon status={step.status} announce={step.status !== 'skipped' && !partlySkipped(step)} partial={partlySkipped(step)} />
                  <div className="tl-main">
                    <div className="tl-line">
                      {/* data-step-key: the Run screen returns focus to the row that opened a step when it closes. */}
                      <button type="button" className="tl-title" aria-pressed={selected === step.key} data-step-key={step.key} onClick={() => onSelect(step.key)}>
                        {title}
                      </button>
                      {step.costUsd > 0 ? <span className="tl-cost">{formatUsd(step.costUsd)}</span> : null}
                    </div>
                    <p className="tl-meta">{step.status === 'waiting' ? <span className="tl-turn">Your turn</span> : meta(step).join(', ')}</p>
                    {step.error ? <p className="tl-error">{step.error}</p> : step.note ? <p className="tl-note">{step.note}</p> : null}
                    {step.artifacts.length > 0 ? <StepThumbs step={step} artifacts={artifacts} /> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
