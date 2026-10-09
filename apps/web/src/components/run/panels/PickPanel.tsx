'use client';

import { useId, useRef, useState } from 'react';
import { canSubmit, moveFocus, picksNeeded, toResolution, toggleChoice, type CheckpointDraft } from '../../../view/checkpoints.ts';
import { outputKind } from '../../../view/run.ts';
import type { ArtifactInfo } from '../../../view/rundata.ts';
import { withoutLeadingTitle } from '../../../view/text.ts';
import { openHref } from '../../api.ts';
import { ArtifactPreview } from '../../ArtifactPreview.tsx';
import { useShortcuts } from '../../useShortcuts.ts';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

const isVisual = (mediaType: string | undefined) => ['page', 'image', 'video'].includes(outputKind(mediaType));

/**
 * A text card shown under its caption need not repeat the caption as its own first heading. A card is a snippet of
 * the draft (it clips), so it reads the excerpt; Open shows the whole draft (F13).
 */
function cardInfo(info: ArtifactInfo | undefined, label: string): ArtifactInfo | undefined {
  return info?.excerpt === undefined ? info : { ...info, excerpt: withoutLeadingTitle(info.excerpt, label) };
}

/**
 * pick: a contact sheet of the drafts. One pick behaves as a radio group, several as checkboxes; J and K move
 * between drafts, Space selects the one in focus, Enter keeps the selection once it is complete. The selection starts as
 * the Run screen kept it for this question and every change is written through (ADR-0082).
 */
export function PickPanel({ cp, artifacts, busy, onSubmit, promptId, draft: seed, onDraft, sent }: PanelProps) {
  const options = cp.options ?? [];
  const n = picksNeeded(cp);
  const [draft, setDraftState] = useState(seed);
  const setDraft = (next: CheckpointDraft) => {
    // Sent: the selection stays as sent until byway settles the question (ADR-0082).
    if (sent) return;
    setDraftState(next);
    onDraft(next);
  };
  // -1 until you move: the first J lands on the first draft.
  const [focus, setFocus] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const base = useId();
  const ready = canSubmit(cp, draft);
  const pages = options.some((o) => o.artifactId && outputKind(artifacts[o.artifactId]?.mediaType) === 'page');

  function toggle(id: string) {
    const choice = toggleChoice(draft.choice, id, n);
    setHint(choice === draft.choice ? `You have chosen ${n}. Clear one to choose another.` : null);
    setDraft({ ...draft, choice });
  }

  function move(delta: number) {
    const next = moveFocus(focus, delta, options.length);
    setFocus(next);
    inputs.current[next]?.focus();
    inputs.current[next]?.closest('li')?.scrollIntoView({ block: 'nearest' });
  }

  function submit() {
    if (busy) return;
    if (!ready) {
      setHint(n === 1 ? 'Choose one first.' : `Choose ${n} first.`);
      return;
    }
    onSubmit(toResolution(cp, draft));
  }

  useShortcuts({
    J: () => move(1),
    K: () => move(-1),
    Space: () => {
      const option = options[focus];
      if (option) toggle(option.id);
    },
    Enter: submit,
  });

  const chosenLabels = options.filter((o) => draft.choice.includes(o.id)).map((o) => o.label);
  const status = n === 1 ? (chosenLabels[0] ? `Chosen: ${chosenLabels[0]}` : 'Choose one.') : `${draft.choice.length} of ${n} chosen`;

  return (
    <>
      <fieldset className="sheet-set" aria-describedby={promptId}>
        <legend className="sr-only">{n === 1 ? 'Choose one draft' : `Choose ${n} drafts`}</legend>
        <ul className="sheet" data-layout={pages ? 'pages' : 'cards'}>
          {options.map((o, i) => {
            const checked = draft.choice.includes(o.id);
            return (
              <li key={o.id} className="sheet-item" data-checked={checked ? 'true' : undefined} data-focused={focus === i ? 'true' : undefined}>
                <label className="sheet-hit">
                  <input
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    className="sheet-input"
                    type={n === 1 ? 'radio' : 'checkbox'}
                    name={cp.id}
                    value={o.id}
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    onFocus={() => setFocus(i)}
                    // The name is the caption alone; the whole card read out as a name would be unusable.
                    aria-labelledby={`${base}-${i}`}
                  />
                  <span className="sheet-caption">
                    <span className="sheet-mark" aria-hidden="true" />
                    <span id={`${base}-${i}`} className="sheet-label">
                      {o.label}
                    </span>
                  </span>
                  {o.artifactId ? (
                    <span className="sheet-preview">
                      <ArtifactPreview id={o.artifactId} info={cardInfo(artifacts[o.artifactId], o.label)} title={o.label} size="thumb" />
                    </span>
                  ) : null}
                </label>
                {o.artifactId ? (
                  // Every draft can be seen whole: a card shows only its opening (F05, F13).
                  <a className="sheet-open" href={openHref(o.artifactId)} target="_blank" rel="noopener noreferrer">
                    {isVisual(artifacts[o.artifactId]?.mediaType) ? 'Open full size' : 'Open the whole text'}
                    <span className="sr-only">: {o.label}</span>
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p className="turn-hint" role="status">
        {hint}
      </p>
      <TurnFooter kind={cp.kind} ready={ready} busy={busy} onSubmit={submit} status={status} sent={sent} />
    </>
  );
}
