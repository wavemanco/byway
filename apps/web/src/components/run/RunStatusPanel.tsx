'use client';

import type { RunRecord } from '@byway/contracts';
import Link from 'next/link';
import { exportLabel } from '../../view/history.ts';
import type { ArtifactInfo } from '../../view/rundata.ts';
import type { TimelineStage, TimelineStep } from '../../view/timeline.ts';
import { codeForLabel, stepTitle } from '../../view/vocabulary.ts';
import { artifactUrl } from '../api.ts';
import { ArtifactPreview } from '../ArtifactPreview.tsx';
import { useTechnicalNames } from '../TechNames.tsx';
import { References } from './panels/References.tsx';

const DELIVERABLE: Record<RunRecord['medium'], string> = {
  'web-page': 'Your page is ready.',
  prose: 'Your text is ready.',
  options: 'Your options are ready.',
  media: 'Your storyboard is ready.',
  'code-diff': 'Your diff is ready.',
};

interface Props {
  run: RunRecord;
  paused: boolean;
  step: TimelineStep | undefined;
  stages: TimelineStage[];
  artifacts: Record<string, ArtifactInfo>;
}

/** The working area when nothing is asked of you: what the AI is doing, or how the run ended. */
export function RunStatusPanel({ run, paused, step, stages, artifacts }: Props) {
  const technical = useTechnicalNames();
  // What the run made most recently: every output of the last step that made something (all its drafts, not
  // just the last one, which would wrongly suggest it was chosen).
  const recent = [...stages.flatMap((s) => s.steps)].reverse().find((s) => s.artifacts.length > 0);

  if (run.status === 'done') {
    const id = run.outputArtifactId;
    const info = id ? artifacts[id] : undefined;
    return (
      <section className="state state-done" aria-labelledby="state-title">
        <h2 id="state-title">{DELIVERABLE[run.medium]}</h2>
        <div className="state-actions">
          <Link className="button button-primary" href={`/runs/${run.id}/result`}>
            See the result
          </Link>
          {id && info ? (
            <a className="button" href={artifactUrl(id, run.title)}>
              {exportLabel(info.mediaType)}
            </a>
          ) : null}
        </div>
        {id ? (
          <div className="state-preview">
            <ArtifactPreview id={id} info={info} title={`Result: ${run.title}`} size="large" />
          </div>
        ) : null}
      </section>
    );
  }

  if (run.status === 'failed') {
    return (
      <section className="state" aria-labelledby="state-title">
        <h2 id="state-title">This run stopped with a problem</h2>
        <p className="notice notice-danger">{run.error ?? 'No reason was given.'}</p>
        <p className="muted">What it made so far is in the steps. You can start the same recipe again from the Library.</p>
        <Link className="button" href="/library">
          Go to the Library
        </Link>
      </section>
    );
  }

  if (run.status === 'cancelled') {
    return (
      <section className="state" aria-labelledby="state-title">
        <h2 id="state-title">This run was cancelled</h2>
        <p className="muted">What it made before it stopped is in the steps; open any step to see it.</p>
        <Link className="button" href="/">
          Start something new
        </Link>
      </section>
    );
  }

  const name = step ? stepTitle(step.label, codeForLabel(step.label) ?? step.block, technical) : null;
  return (
    <section className="state" aria-labelledby="state-title" aria-busy={!paused}>
      <h2 id="state-title">{paused ? 'Paused' : name ? `Working on ${name}` : 'Getting started'}</h2>
      <p className="muted">
        {paused
          ? 'Nothing more runs until you resume. What is done so far is kept.'
          : 'byway asks you when it is your turn. You can leave this page; the run carries on.'}
      </p>
      {!paused ? <div className="working" aria-hidden="true" /> : null}
      {recent ? (
        <div className="state-preview">
          <References
            ids={recent.artifacts.map((a) => a.artifactId)}
            artifacts={artifacts}
            title={`Most recent: ${stepTitle(recent.label, codeForLabel(recent.label) ?? recent.block, technical)}`}
          />
        </div>
      ) : null}
    </section>
  );
}
