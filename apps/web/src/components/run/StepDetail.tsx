'use client';

import { useEffect, useRef } from 'react';
import { formatUsd } from '../../view/format.ts';
import type { ArtifactInfo } from '../../view/rundata.ts';
import type { TimelineStep } from '../../view/timeline.ts';
import { codeForLabel, stepTitle, whoLabel } from '../../view/vocabulary.ts';
import { artifactUrl } from '../api.ts';
import { ArtifactPreview } from '../ArtifactPreview.tsx';
import { useTechnicalNames } from '../TechNames.tsx';
import { useShortcuts } from '../useShortcuts.ts';

/** One step opened from the timeline: what it made, at a readable size. */
export function StepDetail({ step, artifacts, onClose, closeLabel }: { step: TimelineStep; artifacts: Record<string, ArtifactInfo>; onClose: () => void; closeLabel: string }) {
  const technical = useTechnicalNames();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step.key]);
  useShortcuts({ Escape: onClose });

  return (
    <section className="detail" aria-labelledby="detail-title">
      <div className="detail-head">
        <div>
          <h2 id="detail-title" ref={heading} tabIndex={-1}>
            {stepTitle(step.label, codeForLabel(step.label) ?? step.block, technical)}
          </h2>
          <p className="muted">
            {whoLabel(step.who)}
            {step.costUsd > 0 ? `, ${formatUsd(step.costUsd)}` : ''}
            {step.round > 1 ? `, round ${step.round}` : ''}
          </p>
        </div>
        <button type="button" className="button" onClick={onClose}>
          {closeLabel} <kbd aria-hidden="true">Esc</kbd>
        </button>
      </div>
      {step.error ? <p className="notice notice-danger">{step.error}</p> : null}
      {step.note ? <p className="detail-note">{step.note}</p> : null}
      {step.artifacts.length === 0 ? (
        <p className="muted">{step.who === 'you' ? 'Your answer went into the next steps.' : 'This step made nothing to show.'}</p>
      ) : (
        <ul className={step.artifacts.length > 1 ? 'detail-grid' : 'detail-one'}>
          {step.artifacts.map((a, i) => {
            const title = a.label ?? `Output ${i + 1}`;
            return (
              <li key={`${a.artifactId}-${i}`} className="detail-item">
                <div className="detail-item-head">
                  <h3>{title}</h3>
                  <a href={artifactUrl(a.artifactId)} target="_blank" rel="noopener noreferrer">
                    Open<span className="sr-only"> {title} in a new tab</span>
                  </a>
                </div>
                <ArtifactPreview id={a.artifactId} info={artifacts[a.artifactId]} title={title} size="large" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
