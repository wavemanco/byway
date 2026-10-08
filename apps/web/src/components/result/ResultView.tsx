'use client';

import type { EvidenceLabel as Label, RecipePresentation, RunRecord } from '@byway/contracts';
import Link from 'next/link';
import { formatUsd } from '../../view/format.ts';
import { exportLabel, formatWhen } from '../../view/history.ts';
import { parseOptions, parseStoryboard, resultKind } from '../../view/result.ts';
import type { HowItWasMade } from '../../view/run.ts';
import type { ArtifactInfo } from '../../view/rundata.ts';
import { codeForLabel, recipeTitle, stepTitle, whoLabel } from '../../view/vocabulary.ts';
import { artifactUrl } from '../api.ts';
import { DiffView } from '../DiffView.tsx';
import { EvidenceLabel } from '../EvidenceLabel.tsx';
import { Markdown } from '../Markdown.tsx';
import { OptionsList, Storyboard } from '../results.tsx';
import { useTechnicalNames } from '../TechNames.tsx';
import { CopyButton } from './CopyButton.tsx';
import { PageResult } from './PageResult.tsx';

interface Props {
  run: RunRecord;
  artifactId: string;
  mediaType: string;
  /** The deliverable's text, for every medium except pages. */
  text: string | null;
  made: HowItWasMade;
  /** Media types of what the deliverable shows besides itself (a storyboard's frames and clips). */
  media: Record<string, ArtifactInfo>;
  presentation: RecipePresentation | null;
  label: Label | null;
}

function Deliverable({ run, artifactId, text, made, media }: Pick<Props, 'run' | 'artifactId' | 'text' | 'made' | 'media'>) {
  const kind = resultKind(run.medium);
  if (kind === 'page') return <PageResult src={artifactUrl(artifactId)} title={run.title} />;
  if (text === null) return null;
  if (kind === 'markdown') return <Markdown text={text} className="prose prose-read" />;
  if (kind === 'diff') return <DiffView text={text} />;
  if (kind === 'options') {
    const options = parseOptions(text);
    return options ? <OptionsList options={options} /> : <pre className="preview-raw">{text}</pre>;
  }
  const board = parseStoryboard(text);
  return board ? <Storyboard board={board} media={media} skipped={made.skipped} /> : <pre className="preview-raw">{text}</pre>;
}

/** "just now", "5 min ago", "yesterday", "on Oct 1": formatWhen's words, fitted into a sentence. */
function finishedPhrase(when: string): string {
  if (when === 'Just now' || when === 'Yesterday') return when.toLowerCase();
  return when.endsWith('ago') ? when : `on ${when}`;
}

/** The deliverable, its export, and "How this was made": the steps, who did each, and the cost. */
export function ResultView({ run, artifactId, mediaType, text, made, media, presentation, label }: Props) {
  const technical = useTechnicalNames();
  const aiSteps = made.byWho.ai;
  return (
    <article className="result">
      <header className="result-head">
        <div>
          <p className="run-recipe">
            {presentation ? recipeTitle(presentation, technical) : 'Recipe'}
            {label ? <EvidenceLabel label={label} /> : null}
          </p>
          <h1>{run.title}</h1>
          <p className="muted" suppressHydrationWarning>
            Finished {finishedPhrase(formatWhen(run.updatedAt))}
          </p>
        </div>
        <div className="result-actions">
          <a className="button button-primary" href={artifactUrl(artifactId, run.title)} download>
            {exportLabel(mediaType)}
          </a>
          {text !== null ? <CopyButton text={text} /> : null}
          {mediaType === 'text/html' ? (
            <a className="button" href={artifactUrl(artifactId)} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
          ) : null}
        </div>
      </header>

      <section className="result-body" aria-label="Result">
        <Deliverable run={run} artifactId={artifactId} text={text} made={made} media={media} />
      </section>

      <section className="made" aria-labelledby="made-title">
        <h2 id="made-title">How this was made</h2>
        <p className="made-summary">
          You did {made.byWho.you} {made.byWho.you === 1 ? 'step' : 'steps'}. AI did {aiSteps} {aiSteps === 1 ? 'step' : 'steps'} for {formatUsd(made.totalUsd)}
          {made.byWho.tool > 0 ? `, and tools did ${made.byWho.tool}` : ''}. The run’s total cost was {formatUsd(run.costUsd)}.
        </p>
        <p className="made-problem">
          <span className="muted">You asked for </span>
          <q>{run.problem}</q>
        </p>
        <table className="made-table">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Step</th>
              <th scope="col">Who</th>
              <th scope="col" className="num">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {made.rows.map((row, i) => (
              <tr key={row.key}>
                <td className="muted">{made.rows[i - 1]?.stage === row.stage ? '' : row.stage}</td>
                <th scope="row">
                  {stepTitle(row.label, codeForLabel(row.label), technical)}
                  {row.round > 1 ? <span className="muted"> (round {row.round})</span> : null}
                  {row.note ? <span className="made-note">{row.note}</span> : null}
                </th>
                <td data-who={row.who}>{whoLabel(row.who)}</td>
                <td className="num">{row.costUsd > 0 ? formatUsd(row.costUsd) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {made.skipped.length > 0 ? (
          <div className="made-skipped">
            <h3>Skipped</h3>
            <ul>
              {made.skipped.map((s) => (
                <li key={s.key}>
                  {s.label}
                  {s.note ? <span className="muted">: {s.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="small">
          <Link href={`/runs/${run.id}`}>Open the run</Link> to see every step’s outputs.
        </p>
      </section>
    </article>
  );
}
