/**
 * Keyboard shortcuts on a Your turn (UX-1, WCAG 2.1.4): a stray key elsewhere on the page must not answer a question,
 * and single-key shortcuts can be turned off.
 */
import { describe, expect, it } from 'vitest';
import { shortcutFor, type KeyPress, type ShortcutMap } from '../src/components/useShortcuts.ts';

const noop = () => undefined;
const MAP: ShortcutMap = { Y: noop, N: noop, J: noop, Enter: noop, Space: noop, Escape: noop, 'Mod+Enter': noop };

const press = (key: string, target: Partial<KeyPress['target']> = {}, mods: Partial<Pick<KeyPress, 'ctrl' | 'meta' | 'alt'>> = {}): KeyPress => ({
  key,
  ctrl: false,
  meta: false,
  alt: false,
  composing: false,
  defaultPrevented: false,
  ...mods,
  target: { tag: 'H2', editable: false, inScope: true, shortcutTarget: false, ...target },
});

describe('single-key shortcuts', () => {
  it('answer only while focus is in the Your turn panel (or nowhere), never from Pause, a timeline row or a link', () => {
    expect(shortcutFor(press('n'), MAP, true)).toBe('N');
    expect(shortcutFor(press('n', { tag: 'BODY' }), MAP, true)).toBe('N');
    expect(shortcutFor(press('n', { tag: 'BUTTON', inScope: false }), MAP, true)).toBeNull();
    expect(shortcutFor(press('y', { tag: 'A', inScope: false }), MAP, true)).toBeNull();
  });

  it('can be turned off, leaving Ctrl+Enter and Escape', () => {
    expect(shortcutFor(press('y'), MAP, false)).toBeNull();
    expect(shortcutFor(press('Enter'), MAP, false)).toBeNull();
    expect(shortcutFor(press('Enter', {}, { ctrl: true }), MAP, false)).toBe('Mod+Enter');
    expect(shortcutFor(press('Escape', { inScope: false }), MAP, false)).toBe('Escape');
  });

  it('never fire while typing or with a modifier held, and leave Enter and Space to a focused button', () => {
    expect(shortcutFor(press('y', { tag: 'TEXTAREA' }), MAP, true)).toBeNull();
    expect(shortcutFor(press('y', { tag: 'INPUT', type: 'text' }), MAP, true)).toBeNull();
    expect(shortcutFor(press('j', { tag: 'INPUT', type: 'radio' }), MAP, true)).toBe('J');
    expect(shortcutFor(press(' ', { tag: 'INPUT', type: 'checkbox' }), MAP, true)).toBeNull();
    expect(shortcutFor(press('y', {}, { alt: true }), MAP, true)).toBeNull();
    expect(shortcutFor(press('Enter', { tag: 'BUTTON' }), MAP, true)).toBeNull();
    // Ctrl+Enter sends from a text field too.
    expect(shortcutFor(press('Enter', { tag: 'TEXTAREA' }, { meta: true }), MAP, true)).toBe('Mod+Enter');
    expect(shortcutFor(press('x'), MAP, true)).toBeNull();
  });
});
