'use client';

import type { CheckpointRecord, CheckpointResolution } from '@byway/contracts';
import { useEffect, useId, useRef, type ComponentType } from 'react';
import { panelFor, type PanelKind } from '../../view/checkpoints.ts';
import type { ArtifactInfo } from '../../view/rundata.ts';
import type { TimelineStep } from '../../view/timeline.ts';
import { TERMS, codeForLabel, stepTitle } from '../../view/vocabulary.ts';
import { useTechnicalNames } from '../TechNames.tsx';
import { ChoosePanel } from './panels/ChoosePanel.tsx';
import { ComparePanel } from './panels/ComparePanel.tsx';
import { ConfirmPanel } from './panels/ConfirmPanel.tsx';
import { DirectivePanel } from './panels/DirectivePanel.tsx';
import { PickPanel } from './panels/PickPanel.tsx';
import { SelectPanel } from './panels/SelectPanel.tsx';
import type { PanelProps } from './panels/types.ts';
import { ReactPanel, WritePanel } from './panels/TextPanels.tsx';

/** One dedicated interface per checkpoint kind, through the mapping in view/checkpoints.ts. */
const PANELS: Record<PanelKind, ComponentType<PanelProps>> = {
  'contact-sheet': PickPanel,
  checklist: SelectPanel,
  'side-by-side': ComparePanel,
  editor: WritePanel,
  'list-editor': DirectivePanel,
  reaction: ReactPanel,
  'yes-no': ConfirmPanel,
  branches: ChoosePanel,
};

/** Kinds whose first control is a text field; those panels focus the field, the others the question. */
const TEXT_PANELS = new Set<PanelKind>(['editor', 'list-editor', 'reaction']);

interface Props {
  cp: CheckpointRecord;
  step: TimelineStep | undefined;
  artifacts: Record<string, ArtifactInfo>;
  busy: boolean;
  paused: boolean;
  onSubmit: (resolution: CheckpointResolution) => void;
}

/** The "Your turn" panel: it takes over the working area while a checkpoint is open (spec §5, Run). */
export function YourTurn({ cp, step, artifacts, busy, paused, onSubmit }: Props) {
  const technical = useTechnicalNames();
  const promptId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const spec = panelFor(cp.kind);
  const Panel = PANELS[spec.panel];

  // Move focus to the question when it opens, unless you are busy elsewhere on the page.
  useEffect(() => {
    if (TEXT_PANELS.has(spec.panel)) return;
    const active = document.activeElement;
    if (!active || active === document.body || active.id === 'main' || active.closest('.turn')) heading.current?.focus();
  }, [spec.panel]);

  return (
    <section className="turn" data-kind={cp.kind} data-checkpoint={cp.id} aria-labelledby={promptId}>
      <header className="turn-head">
        <p className="turn-kicker">
          <span className="tag tag-you">{technical ? `${TERMS.checkpoint.plain} (${TERMS.checkpoint.code})` : TERMS.checkpoint.plain}</span>
          {step ? <span className="muted">{stepTitle(step.label, codeForLabel(step.label) ?? step.block, technical)}</span> : null}
          {technical ? <span className="muted">{cp.kind}</span> : null}
        </p>
        <h2 id={promptId} ref={heading} tabIndex={-1}>
          {cp.prompt}
        </h2>
      </header>
      {paused ? <p className="notice small">The run is paused. You can answer now; it carries on when you resume.</p> : null}
      <Panel cp={cp} artifacts={artifacts} busy={busy} onSubmit={onSubmit} promptId={promptId} />
    </section>
  );
}
