/**
 * "Your turn" panels rendered to HTML (react-dom/server, no browser): what a panel shows before anyone touches it. The
 * interactions themselves run in the Playwright suite; these pin the starting state, which decides what one stray key
 * or click would send.
 */
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckpointKind, CheckpointRecord } from '@byway/contracts';
import { SelectPanel } from '../src/components/run/panels/SelectPanel.tsx';
import type { PanelProps } from '../src/components/run/panels/types.ts';

const cp = (kind: CheckpointKind, extra: Partial<CheckpointRecord> = {}): CheckpointRecord => ({
  id: 'cp1',
  runId: 'r1',
  stepId: 's1',
  kind,
  prompt: 'Question?',
  status: 'open',
  openedAt: '2026-10-07T10:00:00.000Z',
  ...extra,
});

const render = (Panel: ComponentType<PanelProps>, record: CheckpointRecord) =>
  renderToStaticMarkup(createElement(Panel, { cp: record, artifacts: {}, busy: false, onSubmit: () => undefined, promptId: 'q' }));

describe('select panel (TELLS hits, C2)', () => {
  const hits = cp('select', {
    prompt: 'Which of these should be swapped? Choose any, or none.',
    options: [
      { id: 'hit-1', label: 'Em dash pivot — hero heading → a full stop' },
      { id: 'hit-2', label: 'Triplet — features list → two items' },
    ],
  });

  it('is a checklist with nothing ticked, whose button says that nothing will be swapped', () => {
    const html = render(SelectPanel, hits);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).not.toMatch(/checked=""/);
    expect(html).toContain('Swap none');
    expect(html).toContain('None chosen: nothing will be swapped.');
  });

  it('shows each hit as its pattern, where it is and what it would become', () => {
    const html = render(SelectPanel, hits);
    expect(html).toContain('Em dash pivot');
    expect(html).toContain('In hero heading');
    expect(html).toContain('Swap for a full stop');
  });
});
