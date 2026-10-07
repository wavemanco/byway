import { describe, expect, it } from 'vitest';
import type { CheckpointKind, CheckpointRecord } from '@byway/contracts';
import {
  CHECKPOINT_KINDS,
  canSubmit,
  directiveItems,
  emptyDraft,
  moveFocus,
  panelFor,
  toResolution,
  toggleChoice,
} from '../src/view/checkpoints.ts';

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

describe('checkpoint panels', () => {
  it('has a dedicated panel for every checkpoint kind', () => {
    expect(CHECKPOINT_KINDS).toEqual(['pick', 'react', 'confirm', 'compare', 'directive', 'write', 'choose']);
    const panels = CHECKPOINT_KINDS.map((k) => panelFor(k).panel);
    expect(panels).toEqual(['contact-sheet', 'reaction', 'yes-no', 'side-by-side', 'list-editor', 'editor', 'branches']);
    expect(new Set(panels).size).toBe(CHECKPOINT_KINDS.length);
  });

  it('lists the keyboard shortcuts each panel supports', () => {
    expect(panelFor('pick').shortcuts.map((s) => s.keys)).toEqual(['J', 'K', 'Space', 'Enter']);
    expect(panelFor('compare').shortcuts.map((s) => s.keys)).toEqual(['Space', 'J', 'K', 'Enter']);
    expect(panelFor('confirm').shortcuts.map((s) => s.keys)).toEqual(['Y', 'N']);
    expect(panelFor('write').shortcuts.map((s) => s.keys)).toEqual(['Ctrl+Enter']);
  });
});

describe('drafts and resolutions', () => {
  it('requires exactly k picks, or every option when there are fewer', () => {
    const pick = cp('pick', { k: 2, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] });
    expect(canSubmit(pick, { ...emptyDraft(pick), choice: ['a'] })).toBe(false);
    expect(canSubmit(pick, { ...emptyDraft(pick), choice: ['a', 'c'] })).toBe(true);
    const small = cp('pick', { k: 3, options: [{ id: 'a', label: 'A' }] });
    expect(canSubmit(small, { ...emptyDraft(small), choice: ['a'] })).toBe(true);
    expect(toResolution(pick, { ...emptyDraft(pick), choice: ['c', 'a'] })).toEqual({ checkpointId: 'cp1', choice: ['c', 'a'] });
  });

  it('treats a pick of one as a radio choice and refuses picks beyond k', () => {
    expect(toggleChoice(['a'], 'b', 1)).toEqual(['b']);
    expect(toggleChoice(['a'], 'a', 1)).toEqual([]);
    expect(toggleChoice(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleChoice(['a', 'b'], 'a', 2)).toEqual(['b']);
  });

  it('needs text for write and react, and at least one item for a directive', () => {
    const write = cp('write', { initialText: 'Headline: Hello' });
    expect(emptyDraft(write).text).toBe('Headline: Hello');
    expect(canSubmit(write, { ...emptyDraft(write), text: '   ' })).toBe(false);
    expect(canSubmit(cp('react'), { ...emptyDraft(cp('react')), text: 'More air' })).toBe(true);
    const directive = cp('directive');
    expect(canSubmit(directive, { ...emptyDraft(directive), items: ['', '  '] })).toBe(false);
    expect(toResolution(directive, { ...emptyDraft(directive), items: ['Remove the testimonials', '', 'Drop the FAQ '] })).toEqual({
      checkpointId: 'cp1',
      text: 'Remove the testimonials\nDrop the FAQ',
    });
  });

  it('turns a directive text into editable items', () => {
    expect(directiveItems('- Remove the footer\n\n* Drop the FAQ\n3. Merge the two CTAs')).toEqual([
      'Remove the footer',
      'Drop the FAQ',
      'Merge the two CTAs',
    ]);
    expect(directiveItems(undefined)).toEqual(['']);
  });

  it('resolves confirm with a yes or no, and compare and choose with one option', () => {
    const confirm = cp('confirm');
    expect(canSubmit(confirm, emptyDraft(confirm))).toBe(false);
    expect(toResolution(confirm, { ...emptyDraft(confirm), approved: false })).toEqual({ checkpointId: 'cp1', approved: false });
    const compare = cp('compare', { options: [{ id: 'A', label: 'Before' }, { id: 'B', label: 'After' }] });
    expect(emptyDraft(compare).choice).toEqual([]);
    expect(canSubmit(compare, { ...emptyDraft(compare), choice: ['B'] })).toBe(true);
    expect(toResolution(compare, { ...emptyDraft(compare), choice: ['B'] })).toEqual({ checkpointId: 'cp1', choice: ['B'] });
  });

  it('moves focus between drafts without wrapping', () => {
    expect(moveFocus(0, 1, 4)).toBe(1);
    expect(moveFocus(3, 1, 4)).toBe(3);
    expect(moveFocus(0, -1, 4)).toBe(0);
    expect(moveFocus(2, -1, 0)).toBe(0);
  });
});
