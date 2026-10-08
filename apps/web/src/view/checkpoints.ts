/**
 * "Your turn" panels: one dedicated interface per checkpoint kind (spec §5, Run screen), plus the pure logic
 * behind them (what counts as a complete answer, how it becomes a CheckpointResolution).
 */
import type { CheckpointKind, CheckpointRecord, CheckpointResolution } from '@byway/contracts';

/** Every kind in packages/contracts/src/store.ts, in declaration order. */
export const CHECKPOINT_KINDS = ['pick', 'select', 'react', 'confirm', 'compare', 'directive', 'write', 'choose'] as const satisfies readonly CheckpointKind[];

// Compile-time check that the list above is exhaustive.
type Missing = Exclude<CheckpointKind, (typeof CHECKPOINT_KINDS)[number]>;
const exhaustive: Missing extends never ? true : false = true;
void exhaustive;

export type PanelKind = 'contact-sheet' | 'checklist' | 'reaction' | 'yes-no' | 'side-by-side' | 'list-editor' | 'editor' | 'branches';

export interface Shortcut {
  keys: string;
  does: string;
}

export interface PanelSpec {
  panel: PanelKind;
  /** Verb for the primary button; it names exactly what happens. */
  action: string;
  shortcuts: Shortcut[];
}

const SUBMIT_TEXT: Shortcut = { keys: 'Ctrl+Enter', does: 'send' };

export const CHECKPOINT_PANELS: Record<CheckpointKind, PanelSpec> = {
  pick: {
    panel: 'contact-sheet',
    action: 'Keep selected',
    shortcuts: [
      { keys: 'J', does: 'next draft' },
      { keys: 'K', does: 'previous draft' },
      { keys: 'Space', does: 'select' },
      { keys: 'Enter', does: 'keep selected' },
    ],
  },
  select: {
    panel: 'checklist',
    action: 'Swap the chosen ones',
    shortcuts: [
      { keys: 'J', does: 'next' },
      { keys: 'K', does: 'previous' },
      { keys: 'Space', does: 'choose or clear' },
      { keys: 'Ctrl+Enter', does: 'send' },
    ],
  },
  react: { panel: 'reaction', action: 'Send reaction', shortcuts: [SUBMIT_TEXT] },
  confirm: {
    panel: 'yes-no',
    action: 'Answer',
    shortcuts: [
      { keys: 'Y', does: 'yes' },
      { keys: 'N', does: 'no' },
    ],
  },
  compare: {
    panel: 'side-by-side',
    action: 'Keep this version',
    shortcuts: [
      { keys: 'Space', does: 'flip' },
      { keys: 'J', does: 'next version' },
      { keys: 'K', does: 'previous version' },
      { keys: 'Enter', does: 'keep the one shown' },
    ],
  },
  directive: { panel: 'list-editor', action: 'Send the list', shortcuts: [SUBMIT_TEXT] },
  write: { panel: 'editor', action: 'Use my words', shortcuts: [SUBMIT_TEXT] },
  choose: {
    panel: 'branches',
    action: 'Go this way',
    shortcuts: [
      { keys: 'J', does: 'next option' },
      { keys: 'K', does: 'previous option' },
      { keys: 'Enter', does: 'go this way' },
    ],
  },
};

export function panelFor(kind: CheckpointKind): PanelSpec {
  return CHECKPOINT_PANELS[kind];
}

/** The shortcuts a panel lists: all of them, or only the Ctrl ones when single-key shortcuts are off in Settings. */
export function listedShortcuts(kind: CheckpointKind, singleKeys: boolean): Shortcut[] {
  const all = CHECKPOINT_PANELS[kind].shortcuts;
  return singleKeys ? all : all.filter((s) => s.keys.startsWith('Ctrl+'));
}

/** What the person has entered so far, for any kind of panel. */
export interface CheckpointDraft {
  choice: string[];
  text: string;
  items: string[];
  approved: boolean | null;
}

export function emptyDraft(cp: CheckpointRecord): CheckpointDraft {
  return {
    choice: [],
    text: cp.initialText ?? '',
    items: cp.kind === 'directive' ? directiveItems(cp.initialText) : [],
    approved: null,
  };
}

/** How many options a pick needs: k, or every option when fewer are on offer. */
export function picksNeeded(cp: CheckpointRecord): number {
  const k = cp.k ?? 1;
  return Math.max(1, Math.min(k, cp.options?.length ?? k));
}

function nonEmpty(items: string[]): string[] {
  return items.map((i) => i.trim()).filter((i) => i.length > 0);
}

export function canSubmit(cp: CheckpointRecord, draft: CheckpointDraft): boolean {
  switch (cp.kind) {
    case 'pick':
      return draft.choice.length === picksNeeded(cp);
    case 'select':
      // Any subset, none included: choosing nothing is an answer (the fix step then changes nothing).
      return true;
    case 'compare':
    case 'choose':
      return draft.choice.length === 1;
    case 'write':
    case 'react':
      return draft.text.trim().length > 0;
    case 'directive':
      return nonEmpty(draft.items).length > 0;
    case 'confirm':
      return draft.approved !== null;
  }
}

export function toResolution(cp: CheckpointRecord, draft: CheckpointDraft): CheckpointResolution {
  const base = { checkpointId: cp.id };
  switch (cp.kind) {
    case 'pick':
    case 'compare':
    case 'choose':
      return { ...base, choice: [...draft.choice] };
    case 'select': {
      // Distinct, listed ids only, in the order the options are shown (contracts: any distinct subset of the options).
      const chosen = new Set(draft.choice);
      return { ...base, choice: (cp.options ?? []).filter((o) => chosen.has(o.id)).map((o) => o.id) };
    }
    case 'write':
    case 'react':
      return { ...base, text: draft.text };
    case 'directive':
      return { ...base, text: nonEmpty(draft.items).join('\n') };
    case 'confirm':
      return { ...base, approved: draft.approved === true };
  }
}

/** Selecting in a contact sheet: a pick of one behaves like a radio group; beyond k, nothing more is added. */
export function toggleChoice(selected: string[], id: string, k: number): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (k <= 1) return [id];
  return selected.length >= k ? selected : [...selected, id];
}

/**
 * The select panel's button names what sending does (C2, TELLS per instance): the chosen hits are swapped, or none
 * are and the work stays as it is.
 */
export function selectAction(chosen: number): string {
  if (chosen === 0) return 'Swap none';
  return chosen === 1 ? 'Swap the chosen one' : 'Swap the chosen ones';
}

export interface HitParts {
  pattern: string;
  where?: string;
  alternative?: string;
}

/** A TELLS hit is labelled "<pattern> — <where> → <alternative>" (C2); each part is shown on its own. */
export function hitParts(label: string): HitParts {
  const arrow = label.indexOf(' → ');
  const head = arrow >= 0 ? label.slice(0, arrow) : label;
  const alternative = arrow >= 0 ? label.slice(arrow + 3).trim() : '';
  const dash = head.indexOf(' — ');
  const pattern = (dash >= 0 ? head.slice(0, dash) : head).trim();
  const where = dash >= 0 ? head.slice(dash + 3).trim() : '';
  return { pattern, ...(where ? { where } : {}), ...(alternative ? { alternative } : {}) };
}

/** Splits list text (bullets, numbers or plain lines) into editable items; always at least one. */
export function directiveItems(text: string | undefined): string[] {
  const items = (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0);
  return items.length > 0 ? items : [''];
}

/** J/K movement through drafts; stops at the ends rather than wrapping, like a list. */
export function moveFocus(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, current + delta));
}
