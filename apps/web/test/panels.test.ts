/**
 * "Your turn" panels rendered to HTML (react-dom/server, no browser): what a panel shows before anyone touches it. The
 * interactions themselves run in the Playwright suite; these pin the starting state, which decides what one stray key
 * or click would send.
 */
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckpointKind, CheckpointRecord } from '@byway/contracts';
import { Examples } from '../src/components/Examples.tsx';
import { ChoosePanel } from '../src/components/run/panels/ChoosePanel.tsx';
import { ComparePanel } from '../src/components/run/panels/ComparePanel.tsx';
import { SelectPanel } from '../src/components/run/panels/SelectPanel.tsx';
import { WritePanel } from '../src/components/run/panels/TextPanels.tsx';
import type { PanelProps } from '../src/components/run/panels/types.ts';
import { fieldName, parseOnScreenCopy, serializeOnScreenCopy } from '../src/view/onscreen.ts';

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

describe('panels that commit with Enter start with nothing chosen (UX-1)', () => {
  it('choose: no branch is preselected, so Enter alone goes nowhere', () => {
    const html = render(ChoosePanel, cp('choose', { options: [{ id: 'ai', label: 'ai' }, { id: 'own', label: 'own' }] }));
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toMatch(/checked=""/);
    expect(html).toMatch(/aria-disabled="true"[^>]*>Go this way/);
  });

  it('compare: no version is kept until one is chosen', () => {
    const html = render(ComparePanel, cp('compare', { options: [{ id: 'A', label: 'Before the sweep' }, { id: 'B', label: 'After the swaps' }] }));
    expect(html).not.toContain('data-current');
    expect(html).toMatch(/aria-disabled="true"[^>]*>Keep this version/);
  });
});

describe('Examples you admire (UX-12)', () => {
  it('uses its own class names, not the Start page chips’ (.example, .examples)', () => {
    const html = renderToStaticMarkup(createElement(Examples, { entries: [{ key: 1, kind: 'text', text: 'A memo I admire' }], onChange: () => undefined }));
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/));
    expect(classes).not.toContain('example');
    expect(classes).not.toContain('examples');
    expect(classes).toContain('ref-example');
  });
});

describe('on-screen copy in a Your words turn (C4)', () => {
  const copy = 'Headline: Bread, the slow way\nTagline:Open at seven\nShot 1: Made by hand';

  it('reads Headline, Tagline and Shot lines as fields, and sends unchanged copy back exactly', () => {
    const fields = parseOnScreenCopy(copy);
    expect(fields?.map((f) => [f.label, f.value])).toEqual([
      ['Headline', 'Bread, the slow way'],
      ['Tagline', 'Open at seven'],
      ['Shot 1', 'Made by hand'],
    ]);
    expect(serializeOnScreenCopy(fields ?? [])).toBe(copy);
    const edited = (fields ?? []).map((f) => (f.label === 'Tagline' ? { ...f, value: 'Open from seven,\nevery day' } : f));
    expect(serializeOnScreenCopy(edited)).toBe('Headline: Bread, the slow way\nTagline:Open from seven, every day\nShot 1: Made by hand');
    expect(fieldName('Shot 1')).toBe('Shot 1 caption');
  });

  it('leaves any other text to the plain editor', () => {
    expect(parseOnScreenCopy('A whole page of copy\nHeadline: but not only')).toBeNull();
    expect(parseOnScreenCopy('')).toBeNull();
    expect(parseOnScreenCopy(undefined)).toBeNull();
  });

  it('shows a labelled field for each line', () => {
    const html = render(WritePanel, cp('write', { prompt: 'Write the words shown on screen.', initialText: copy }));
    expect(html).toContain('Shot 1 caption');
    expect(html).toContain('value="Bread, the slow way"');
    expect(html).not.toContain('<textarea');
  });
});
