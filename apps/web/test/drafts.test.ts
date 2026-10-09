/**
 * The rules behind a person's unsent answers (F06, ADR-0082): what an untouched panel holds, when a draft counts as
 * the person's work, which drafts outlive a reload, what a stored draft may restore into, and how server state settles
 * a draft. Pure; the store that applies them is tested in draft-store.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { CheckpointKind, CheckpointRecord } from '@byway/contracts';
import { emptyDraft, toResolution, type CheckpointDraft } from '../src/view/checkpoints.ts';
import { answerable, decodeStoredDraft, isDirty, persisted, sanitize, settle, startingDraft, unsentText, type StoredDraft } from '../src/view/drafts.ts';
import { serializeOnScreenCopy, parseOnScreenCopy } from '../src/view/onscreen.ts';

const cp = (kind: CheckpointKind, extra: Partial<CheckpointRecord> = {}): CheckpointRecord => ({
  id: 'run-1/cp3-voice',
  runId: 'run-1',
  stepId: 'voice',
  kind,
  prompt: 'Question?',
  status: 'open',
  openedAt: '2026-10-08T10:00:00.000Z',
  ...extra,
});

const draft = (over: Partial<CheckpointDraft> = {}): CheckpointDraft => ({ choice: [], text: '', items: [], approved: null, ...over });
const stored = (record: CheckpointRecord, d: CheckpointDraft, sent?: true): StoredDraft => ({ id: record.id, kind: record.kind, draft: d, ...(sent ? { sent } : {}) });

describe('the starting draft: what an untouched panel holds', () => {
  it('is the model’s starting text for a plain write, and nothing chosen for the choice kinds', () => {
    const write = cp('write', { initialText: 'The model’s draft.' });
    expect(startingDraft(write)).toEqual(emptyDraft(write));
    expect(startingDraft(cp('pick', { options: [{ id: 'a', label: 'A' }] })).choice).toEqual([]);
  });

  it('treats untouched on-screen copy as clean, although sending it normalises the lines', () => {
    const initialText = 'Headline: Bread, the slow way\n\nTagline:Open at seven\nShot 1: Made by hand';
    const write = cp('write', { initialText });
    const fields = parseOnScreenCopy(initialText) ?? [];
    expect(serializeOnScreenCopy(fields)).not.toBe(initialText);
    const start = startingDraft(write);
    expect(start.items).toEqual(['Bread, the slow way', 'Open at seven', 'Made by hand']);
    expect(start.text).toBe(serializeOnScreenCopy(fields));
    expect(isDirty(write, start)).toBe(false);
    const edited = serializeOnScreenCopy(fields.map((f, i) => (i === 0 ? { ...f, value: 'Bread, slowly' } : f)));
    expect(isDirty(write, { ...start, items: ['Bread, slowly', 'Open at seven', 'Made by hand'], text: edited })).toBe(true);
  });

  it('treats blank list rows as clean, and any listed item as the person’s work', () => {
    const directive = cp('directive', { initialText: '- the intro' });
    expect(isDirty(directive, draft({ items: ['the intro', '', '  '] }))).toBe(false);
    expect(isDirty(directive, draft({ items: ['the intro', 'the outro'] }))).toBe(true);
    expect(isDirty(cp('directive'), draft({ items: [''] }))).toBe(false);
  });

  it('counts a write as changed only when its text differs from the starting text', () => {
    const write = cp('write', { initialText: 'Start.' });
    expect(isDirty(write, draft({ text: 'Start.' }))).toBe(false);
    expect(isDirty(write, draft({ text: 'Mine.' }))).toBe(true);
    expect(isDirty(cp('select', { options: [{ id: 'h1', label: 'x' }] }), draft({ choice: ['h1'] }))).toBe(true);
  });
});

describe('which drafts outlive a reload', () => {
  it('keeps typed text and deliberate ticks; compare and choose highlights stay in memory (UX-1); confirm has none', () => {
    for (const kind of ['write', 'react', 'directive', 'pick', 'select'] as const) expect(persisted(kind), kind).toBe(true);
    for (const kind of ['compare', 'choose', 'confirm'] as const) expect(persisted(kind), kind).toBe(false);
  });
});

describe('restoring a stored draft', () => {
  const pick = cp('pick', { k: 2, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] });

  it('never restores into another question or another kind', () => {
    expect(sanitize(pick, { id: 'run-1/cp9-other', kind: 'pick', draft: draft({ choice: ['a'] }) })).toBeNull();
    expect(sanitize(pick, { id: pick.id, kind: 'select', draft: draft({ choice: ['a'] }) })).toBeNull();
  });

  it('keeps only options the question offers, at most k for a pick, without repeats', () => {
    expect(sanitize(pick, stored(pick, draft({ choice: ['zz', 'a', 'a', 'b', 'c'] })))?.choice).toEqual(['a', 'b']);
    const select = cp('select', { options: [{ id: 'h1', label: 'x' }, { id: 'h2', label: 'y' }] });
    expect(sanitize(select, stored(select, draft({ choice: ['h2', 'gone', 'h1'] })))?.choice).toEqual(['h2', 'h1']);
  });

  it('decodes only a well-formed draft, and tolerates garbage', () => {
    const good = { id: 'x', kind: 'write', draft: { choice: [], text: 'mine', items: [], approved: null } };
    expect(decodeStoredDraft(good)).toEqual(good);
    expect(decodeStoredDraft({ ...good, sent: true })).toEqual({ ...good, sent: true });
    for (const bad of [null, 'text', 3, [], {}, { ...good, kind: 'essay' }, { ...good, draft: { ...good.draft, items: [1] } }, { ...good, draft: { ...good.draft, text: 5 } }, { ...good, sent: 'yes' }, { ...good, id: 7 }]) {
      expect(decodeStoredDraft(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('settling a draft against the server’s state', () => {
  const write = cp('write', { initialText: 'Model text.' });
  const mine = draft({ text: 'My words.' });

  it('keeps an unsent draft while its question can be answered', () => {
    expect(answerable(write, 'waiting')).toBe(true);
    expect(answerable(write, 'paused')).toBe(true);
    expect(settle(stored(write, mine), write, 'waiting')).toBe('keep');
  });

  it('unlocks a sent draft whose question is still open: the server’s state wins', () => {
    expect(settle(stored(write, mine, true), write, 'waiting')).toBe('unlock');
  });

  it('drops a sent draft once its question has closed', () => {
    expect(settle(stored(write, mine, true), { ...write, status: 'resolved', resolution: { checkpointId: write.id, text: 'My words.' } }, 'running')).toBe('drop');
    expect(settle(stored(write, mine, true), { ...write, status: 'withdrawn' }, 'cancelled')).toBe('drop');
  });

  it('keeps a draft whose question a snapshot does not list while the run goes on: the snapshot may predate it (Back)', () => {
    // The browser's cached copy of the page, restored by Back, was rendered before the question opened.
    for (const status of ['queued', 'running', 'waiting', 'paused'] as const) {
      expect(settle(stored(write, mine), undefined, status), status).toBe('keep');
      expect(settle(stored(write, mine, true), undefined, status), status).toBe('keep');
    }
  });

  it('drops a draft whose question is not listed once the run has ended: it can no longer appear', () => {
    for (const status of ['done', 'failed', 'cancelled'] as const) expect(settle(stored(write, mine), undefined, status), status).toBe('drop');
  });

  it('drops a draft whose answer landed although the response was lost (the stored resolution is the draft)', () => {
    const answered = { ...write, status: 'resolved' as const, resolution: toResolution(write, mine) };
    expect(settle(stored(write, mine), answered, 'running')).toBe('drop');
  });

  it('shows text left on a question that closed unanswered: withdrawn, answered elsewhere, or a run that ended with it still listed open', () => {
    expect(settle(stored(write, mine), { ...write, status: 'withdrawn' }, 'cancelled')).toBe('unsent');
    expect(settle(stored(write, mine), { ...write, status: 'resolved', resolution: { checkpointId: write.id, text: 'Other words.' } }, 'running')).toBe('unsent');
    // A torn read: the run's terminal status was written before its questions were withdrawn (R3).
    expect(answerable(write, 'cancelled')).toBe(false);
    expect(settle(stored(write, mine), write, 'cancelled')).toBe('unsent');
    expect(settle(stored(write, mine), write, 'failed')).toBe('unsent');
  });

  it('drops what is not worth showing: a clean draft, or a choice on a closed question', () => {
    expect(settle(stored(write, draft({ text: 'Model text.' })), { ...write, status: 'withdrawn' }, 'cancelled')).toBe('drop');
    const select = cp('select', { options: [{ id: 'h1', label: 'x' }] });
    expect(settle(stored(select, draft({ choice: ['h1'] })), { ...select, status: 'withdrawn' }, 'cancelled')).toBe('drop');
  });

  it('drops a draft stored for another kind than the question now has', () => {
    expect(settle({ id: write.id, kind: 'react', draft: mine }, write, 'waiting')).toBe('drop');
  });

  it('shows unsent text as it would have been sent', () => {
    expect(unsentText(write, mine)).toBe('My words.');
    expect(unsentText(cp('directive'), draft({ items: [' the intro ', '', 'the outro'] }))).toBe('the intro\nthe outro');
  });
});
