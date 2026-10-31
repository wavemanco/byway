/**
 * The slot plan of an ASSET step (F11, F12; ADR-0090): what its image briefs must cover, and the one identity every use
 * of a brief's slot goes by: checking the answer, dropping duplicates, buying, attaching, announcing and the anchor.
 * - `each`: on media and options, one image per storyboard shot or per option, as the work lists them (the prompts that
 *   declare `images: each` say so). A slot is a shot number ("1", " 1 ", "Shot 1") or an option label ("a", "Option A").
 *   Coverage is checked before anything is bought: a missing slot is a miss, naming any unknown ones too; an answer that
 *   covers every slot is used, and briefs for slots the work does not have are left out (the step's note says so).
 *   C5's anchor step plans shot 1 alone (asset.ts), and a brief for one of the other shots is left out without a word.
 * - `free`: on prose and web pages, between the counts the step's prompt declares (`images: min-max`), at most the
 *   step's `slots` knob. A slot is a name (trimmed); duplicates collapse, the last one kept. Briefs beyond the most it
 *   makes are left out, and the step's note names them.
 * A miss that still names some usable briefs carries them (formats.ts Usable): askModel asks once more, the second
 * answer is added to them (checkBriefs' `earlier`), and the step makes what the two cover and says what is missing,
 * instead of failing the run.
 */
import type { ImageCount, Medium } from '@byway/contracts';
import { labelOf } from '@byway/prompts/pure';
import { parseOptions, parseStoryboard, type Parsed, type Usable } from '../formats.ts';
import type { ImageBrief } from '../parse.ts';
import { StepError } from './failures.ts';

/** The most mood boards an options step makes: one for each chosen option, and C2 chooses 1 to 3 (03 C2; B-049). */
export const MOOD_BOARDS_MAX = 3;

/**
 * `others`: shots the work has that the step makes no image for (C5's anchor frames make shot 1's only, F12 (b)). A
 * brief for one is left out without a word: it is a shot of the work, so the note's "the storyboard has no shot for"
 * would be false.
 */
export type SlotPlan =
  | { kind: 'each'; medium: 'media' | 'options'; expected: readonly string[]; first?: string; over?: readonly string[]; others?: readonly string[] }
  | { kind: 'free'; min: number; max: number };

/**
 * Before any call: on media and options, the plan from the shots or options the work lists, in order (shots by
 * number); `first` is the lowest shot, whose frame starts the relay chain. Work that cannot be read stops the step
 * here, before anything is asked or bought. Undefined on other media, whose count the prompt declares (freePlan).
 */
export function eachPlan(medium: Medium, artifact: string, what: string): SlotPlan | undefined {
  if (medium === 'media') {
    const r = parseStoryboard(artifact);
    if (!r.ok) throw new StepError(`The ${what} step could not read the storyboard: ${r.problem}`);
    const shots = r.value.storyboard.map((s) => s.shot).sort((a, b) => a - b).map(String);
    return { kind: 'each', medium, expected: [...new Set(shots)], ...(shots[0] ? { first: shots[0] } : {}) };
  }
  if (medium === 'options') {
    const r = parseOptions(artifact);
    if (!r.ok) throw new StepError(`The ${what} step could not read the options: ${r.problem}`);
    // The chosen options only, at most MOOD_BOARDS_MAX (the owner's choice for C2, B-049): those the option map flags,
    // or, in a map written without flags, those whose rationale opens with "Chosen." as its prompt asks.
    const flags = r.value.options.some((o) => o.chosen !== undefined);
    const flagged = r.value.options.flatMap((o, i) => (o.chosen === true ? [labelOf(i)] : []));
    // Markdown or quotes around the word are allowed ("**Chosen.**").
    const chosen = flags ? flagged : r.value.options.flatMap((o, i) => (/^[\s*_"'“]*chosen\b/i.test(o.rationale) ? [labelOf(i)] : []));
    return { kind: 'each', medium, expected: chosen.slice(0, MOOD_BOARDS_MAX), ...(chosen.length > MOOD_BOARDS_MAX ? { over: chosen.slice(MOOD_BOARDS_MAX) } : {}) };
  }
  return undefined;
}

/**
 * On prose and web pages: the range the step's prompt declares, at most the step's `slots` knob. A prompt that
 * declares none (only one outside @byway/prompts' library can) asks for one to three, as before.
 */
export function freePlan(declared: ImageCount | undefined, slotsKnob: number | undefined): Extract<SlotPlan, { kind: 'free' }> {
  const range = declared && declared !== 'each' ? declared : { min: 1, max: 3 };
  const max = Math.max(0, Math.min(range.max, slotsKnob ?? Number.POSITIVE_INFINITY));
  return { kind: 'free', min: Math.min(range.min, max), max };
}

/** A slot's one identity in a plan: a shot number, an option label or a trimmed name; undefined when not in the plan. */
export function slotId(plan: SlotPlan, raw: string): string | undefined {
  if (plan.kind === 'free') return raw.trim();
  const id = slotKey(plan, raw);
  return id && plan.expected.includes(id) ? id : undefined;
}

/** A shot number or an option label as written, in its one form, whether or not the plan has it ('' when neither). */
function slotKey(plan: Extract<SlotPlan, { kind: 'each' }>, raw: string): string {
  const t = raw.trim();
  return plan.medium === 'media' ? (/^(?:shot\s*)?(\d+)$/i.exec(t)?.[1] ?? '').replace(/^0+(?=\d)/, '') : t.replace(/^option\s+/i, '').toUpperCase();
}

/** A brief under its slot's identity. */
export type SlotBrief = ImageBrief & { slot: string };

/** The briefs to make, one per slot, and what an `each` plan's answer left out. */
export interface SlotBriefs {
  /** In the plan's order on media and options (shots, labels), as answered elsewhere. */
  briefs: SlotBrief[];
  /** Shots or options no brief covers. */
  missing: string[];
  /** Slots the answers named (both, after a retry) that are not shots or options of the work, as written: one per brief. */
  unknown: string[];
  /** On a free plan, the slots of the briefs beyond the most the step makes, in the order kept: left out. */
  dropped: string[];
  /**
   * The AI's line of advice for the person, where the step's prompt asks for one (ADR-0101): the later answer's, else
   * the earlier one's. Never a reason to make fewer images.
   */
  advice?: string;
}

/**
 * Holds a parsed brief answer to its plan (see the module comment). A malformed answer stays a plain miss.
 * - `earlier` is the usable part of the step's earlier, short answer (askModel): its briefs stay for the slots this answer
 *   does not cover, and what it left out stays left out, so no usable brief is dropped and coverage is judged on both
 *   answers together. A slot both name is made from this, the later, answer.
 * - An `each` answer that covers every slot is used as it is, without asking again, even when it also names slots the
 *   work does not have: those are left out, and listed in `unknown` for the step's note.
 * - `advice` is this answer's line of advice, when the prompt asks for one (ADR-0101); without it the earlier answer's
 *   stays. It never changes what counts as covered.
 */
export function checkBriefs(parsed: Parsed<ImageBrief[]>, plan: SlotPlan, earlier?: SlotBriefs, advice?: string): Usable<SlotBriefs> {
  if (!parsed.ok) return parsed;
  const kept = advice || earlier?.advice;
  const withAdvice = (v: SlotBriefs): SlotBriefs => (kept ? { ...v, advice: kept } : v);
  const byId = new Map<string, SlotBrief>();
  const unknown: string[] = [...(earlier?.unknown ?? [])];
  for (const b of parsed.value) {
    const id = slotId(plan, b.slot);
    if (id === undefined) {
      if (plan.kind === 'each' && plan.others?.includes(slotKey(plan, b.slot))) continue;
      unknown.push(b.slot.trim());
    } else {
      // The last brief for a slot is the one kept, in the place it was last given.
      byId.delete(id);
      byId.set(id, { ...b, slot: id });
    }
  }
  for (const b of earlier?.briefs ?? []) if (!byId.has(b.slot)) byId.set(b.slot, b);
  if (plan.kind === 'free') {
    const all = [...byId.values()];
    const briefs = all.slice(0, plan.max);
    const value = withAdvice({ briefs, missing: [], unknown: [], dropped: all.slice(plan.max).map((b) => b.slot) });
    if (briefs.length >= plan.min) return { ok: true, value };
    return { ok: false, problem: plan.min === 1 ? 'Write at least one image brief.' : `Write at least ${plan.min} image briefs.`, usable: value };
  }
  const value = withAdvice({ briefs: plan.expected.flatMap((id) => byId.get(id) ?? []), missing: plan.expected.filter((id) => !byId.has(id)), unknown, dropped: [] });
  if (!value.missing.length) return { ok: true, value };
  const what = plan.medium === 'media' ? 'storyboard shot (slot = the shot number)' : 'option (slot = its label)';
  const wrong = [
    ...(value.missing.length ? [`There is none for ${value.missing.map((id) => slotName(plan, id)).join(', ')}.`] : []),
    ...(unknown.length ? [`${unknown.map((u) => JSON.stringify(u)).join(', ')} ${unknown.length > 1 ? 'are' : 'is'} not ${plan.medium === 'media' ? 'a shot' : 'an option'} of this work.`] : []),
  ];
  return { ok: false, problem: `Write one brief per ${what}: ${plan.expected.join(', ')}. ${wrong.join(' ')}`, usable: value };
}

/** How a slot is named to the person: "shot 2", "option C", "“hero”". */
export function slotName(plan: SlotPlan, id: string): string {
  if (plan.kind === 'free') return `“${id}”`;
  return plan.medium === 'media' ? `shot ${id}` : `option ${id}`;
}
