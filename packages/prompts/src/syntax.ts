import { PROMPT_SLOTS, type PromptSlot } from '@byway/contracts';
import { PromptTemplateError } from './errors.ts';

/**
 * The template language, kept deliberately small so templates stay readable as prompts: `{{slot}}` inserts a slot,
 * `{{#if slot}}…{{else}}…{{/if}}` chooses a block by whether the slot has a non-blank value. There are no loops,
 * helpers or escapes, so a template cannot compute anything the runner should own.
 *
 * Slot values are inserted after parsing and never re-read, so a user's text that happens to contain `{{seed}}`
 * stays literal text (no injection through a value).
 */

export type BodyNode =
  | { kind: 'text'; text: string }
  | { kind: 'slot'; name: PromptSlot }
  | { kind: 'if'; name: PromptSlot; then: BodyNode[]; otherwise: BodyNode[] };

export type SlotValues = Readonly<Partial<Record<string, string | undefined>>>;

const KNOWN = new Set<string>(PROMPT_SLOTS);
/** Any `{{…}}`. What is inside must be a slot name, `#if name`, `else` or `/if`. */
const TAG = /\{\{([^{}]*)\}\}/g;
/** A line holding nothing but one block tag: removed whole, so `#if` blocks on their own lines leave no blank line. */
const STANDALONE = /^[ \t]*\{\{\s*(?:#if\s+[a-z]+|else|\/if)\s*\}\}[ \t]*(?:\r?\n|$)/gm;

function slotName(raw: string, where: string): PromptSlot {
  if (!KNOWN.has(raw)) throw new PromptTemplateError('bad-template', `${where}: unknown slot "${raw}" (slots are PROMPT_SLOTS from @byway/contracts)`);
  return raw as PromptSlot;
}

/** Parse a template body. Throws on unknown slots, malformed tags and unbalanced blocks. */
export function parseBody(source: string, where: string): BodyNode[] {
  const src = source.replace(STANDALONE, (line) => line.replace(/[ \t]*(?:\r?\n)?$/, '').trim());
  const root: BodyNode[] = [];
  /** Open #if blocks; `inElse` says which branch new nodes go to. */
  const stack: { node: Extract<BodyNode, { kind: 'if' }>; inElse: boolean }[] = [];
  const out = (): BodyNode[] => {
    const top = stack.at(-1);
    return top ? (top.inElse ? top.node.otherwise : top.node.then) : root;
  };
  const text = (t: string) => {
    if (!t) return;
    if (t.includes('{{')) throw new PromptTemplateError('bad-template', `${where}: malformed tag near "${t.slice(t.indexOf('{{'), t.indexOf('{{') + 20)}"`);
    out().push({ kind: 'text', text: t });
  };

  let last = 0;
  for (const m of src.matchAll(TAG)) {
    text(src.slice(last, m.index));
    last = m.index + m[0].length;
    const inner = (m[1] ?? '').trim();
    const ifMatch = /^#if\s+([a-z]+)$/.exec(inner);
    if (ifMatch) {
      const node: Extract<BodyNode, { kind: 'if' }> = { kind: 'if', name: slotName(ifMatch[1] as string, where), then: [], otherwise: [] };
      out().push(node);
      stack.push({ node, inElse: false });
    } else if (inner === 'else') {
      const top = stack.at(-1);
      if (!top) throw new PromptTemplateError('bad-template', `${where}: {{else}} without an open {{#if}}`);
      if (top.inElse) throw new PromptTemplateError('bad-template', `${where}: a second {{else}} in one {{#if ${top.node.name}}} block`);
      top.inElse = true;
    } else if (inner === '/if') {
      if (!stack.pop()) throw new PromptTemplateError('bad-template', `${where}: {{/if}} without an open {{#if}}`);
    } else if (/^[a-z]+$/.test(inner)) {
      out().push({ kind: 'slot', name: slotName(inner, where) });
    } else {
      throw new PromptTemplateError('bad-template', `${where}: malformed tag "${m[0]}"`);
    }
  }
  text(src.slice(last));
  const open = stack.at(-1);
  if (open) throw new PromptTemplateError('bad-template', `${where}: {{#if ${open.node.name}}} is never closed`);
  return root;
}

/** Every slot a body mentions, as an insertion or as an #if condition. */
export function slotsUsed(nodes: readonly BodyNode[], into = new Set<PromptSlot>()): Set<PromptSlot> {
  for (const n of nodes) {
    if (n.kind === 'slot') into.add(n.name);
    if (n.kind === 'if') {
      into.add(n.name);
      slotsUsed(n.then, into);
      slotsUsed(n.otherwise, into);
    }
  }
  return into;
}

const present = (v: string | undefined): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Render a parsed body. A slot inserted on the path actually taken must be provided (an empty string counts as
 * provided); a slot used only inside an #if branch that is not taken is optional.
 */
export function evaluate(nodes: readonly BodyNode[], slots: SlotValues, where: string): string {
  let s = '';
  for (const n of nodes) {
    if (n.kind === 'text') s += n.text;
    else if (n.kind === 'slot') {
      const v = slots[n.name];
      if (typeof v !== 'string') throw new PromptTemplateError('missing-slot', `${where} needs slot "${n.name}", which is missing`, n.name);
      s += v;
    } else {
      s += evaluate(present(slots[n.name]) ? n.then : n.otherwise, slots, where);
    }
  }
  return s;
}
