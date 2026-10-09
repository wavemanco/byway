/**
 * VOICE (01 VOICE, spec §3.2): a human writes every reader-facing line. Each medium's copy deck is the contract
 * (ADR-0081): the runner offers the deck, reads the person's answer with a total reader (every line lands in exactly
 * one place, or the answer is refused with that line named), writes it back deterministically with no model, and
 * checks the written artifact against what the person wrote. Later machine writes are held to the same deck
 * (keepsVoice, port rule 6): the deck locked at VOICE must be unchanged.
 *
 * - web-page: one line per run of visible text (a block, unless a line break or a tag other than inline formatting
 *   splits it), in reading order, link words in [brackets] (page-copy.ts reads, places and verifies it).
 * - prose: the whole Markdown document; the edited text becomes the artifact.
 * - options: each option's title, pitch and rationale under its "### A" label.
 * - media: the voice-over script at the early VOICE (locked after it), the headline, tagline and captions at the late one.
 * - code-diff: the "Why:" paragraph.
 *
 * Non-web answers are checked by a round trip: the deck read back from the written artifact, laid out by
 * {@link layoutOf}, equals the answer laid out the same way. layoutOf is line-based and is never the reader, so a reader
 * that dropped or moved a line cannot pass its own check.
 *
 * This module must stay activity-side: never bundle it for a browser or the workflow sandbox.
 */
import type { Medium } from '@byway/contracts';
import { joinCodeDiff, parseOptions, parseStoryboard, serializeJson, splitCodeDiff, type Storyboard } from './formats.ts';
import { squashHtml } from './html-tokens.ts';
import { deckLines, pageLockView, readPageCopy } from './page-copy.ts';
import type { StepSpec } from './types.ts';
import { labelOf } from '@byway/prompts/pure';

// ---- Pages (page-copy.ts) ------------------------------------------------------------------------------------------

export {
  deckLines,
  pageEditProblems,
  pageLockView,
  pageVoiceSuffix,
  placePageEdit,
  readPageCopy,
  readPageEdit,
  samePageCopy,
  type PageDeck,
  type PageEdit,
  type PageRefusal,
  type Placed,
  type Witness,
} from './page-copy.ts';

/** The page's visible copy, one line per run of text (see page-copy.ts), in reading order, as the person is shown it (link words in brackets). */
export const pageCopy = (html: string): string[] => deckLines(readPageCopy(html));

/** The deck a page's VOICE offers: its lines but those a browser does not show (`notOffered`, from page-arbiter.ts). */
export const offeredPageCopy = (html: string, notOffered?: ReadonlySet<number>): string => deckLines(readPageCopy(html, notOffered)).join('\n');

// ---- Per medium ---------------------------------------------------------------------------------------------------

/** Line endings as the decks use them. */
const lf = (text: string): string => text.replace(/\r\n?/g, '\n');

/**
 * Which of a storyboard's copy a VOICE step writes (VOICE-1, convention C4): the voice-over script (C5's early VOICE,
 * locked after it), or the on-screen copy (the late VOICE: the headline, the tagline and each shot's caption).
 */
export type MediaCopy = 'script' | 'on-screen';

export const mediaCopyOf = (step: Pick<StepSpec, 'variant'>): MediaCopy => (step.variant === 'VOICE-early' ? 'script' : 'on-screen');

/** A storyboard's on-screen copy, one labelled line per field, empty fields included so they can be written. */
const onScreenCopy = (sb: Storyboard): string => [`Headline: ${sb.headline ?? ''}`, `Tagline: ${sb.tagline ?? ''}`, ...sb.storyboard.map((s) => `Shot ${s.shot}: ${s.caption ?? ''}`)].join('\n');

/**
 * The copy a `write` checkpoint offers for VOICE. A storyboard offers the copy its step writes (`scope`); with none,
 * all of it (the script, then the on-screen copy).
 */
export function extractCopy(medium: Medium, artifact: string, scope?: MediaCopy): string {
  switch (medium) {
    case 'web-page':
      return pageCopy(artifact).join('\n');
    case 'prose':
      return artifact.trimEnd();
    case 'options': {
      const r = parseOptions(artifact);
      if (!r.ok) return '';
      return r.value.options.map((o, i) => `### ${labelOf(i)}\nTitle: ${o.title}\nPitch: ${o.pitch}\nRationale: ${o.rationale}`).join('\n\n');
    }
    case 'media': {
      const r = parseStoryboard(artifact);
      if (!r.ok) return '';
      if (scope === 'script') return r.value.voiceover.trim();
      if (scope === 'on-screen') return onScreenCopy(r.value);
      return `${r.value.voiceover.trim()}\n${onScreenCopy(r.value)}`;
    }
    case 'code-diff':
      return splitCodeDiff(artifact).why;
  }
}

// ---- Labelled decks: one line classifier, one total reader --------------------------------------------------------

/** The kinds of non-web deck: their layout ({@link layoutOf}) and, for labelled ones, their reader. */
export type DeckKind = 'prose' | 'script' | 'code-diff' | 'options' | 'on-screen';
type Labelled = Extract<DeckKind, 'options' | 'on-screen'>;

export const deckKindOf = (medium: Exclude<Medium, 'web-page'>, scope: MediaCopy): DeckKind => (medium === 'media' ? (scope === 'script' ? 'script' : 'on-screen') : medium);

const OPTION_FIELD = /^[ \t]*(title|pitch|rationale)[ \t]*:(.*)$/i;
const OPTION_HEAD = /^[ \t]*###[ \t]+(.*?)[ \t]*$/;
const SCREEN_FIELD = /^[ \t]*(headline|tagline|shot[ \t]+(\d+)|voice-?over|vo)[ \t]*:(.*)$/i;
const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1).toLowerCase();

/** A labelled deck line's label (normalised: "Title", "### A", "Shot 2", "Voice-over") and the text after it. */
function labelLine(kind: Labelled, line: string): { key: string; value: string } | undefined {
  if (kind === 'options') {
    const h = OPTION_HEAD.exec(line);
    if (h) return { key: `### ${h[1]}`, value: '' };
    const f = OPTION_FIELD.exec(line);
    return f ? { key: cap(f[1]!), value: f[2]! } : undefined;
  }
  const s = SCREEN_FIELD.exec(line);
  if (!s) return undefined;
  const key = s[2] ? `Shot ${Number(s[2])}` : /^(voice-?over|vo)$/i.test(s[1]!) ? 'Voice-over' : cap(s[1]!);
  return { key, value: s[3]! };
}

const isHead = (key: string): boolean => /^### [^/]+$/.test(key);
/** A field as the person reads it: `Option A "Pitch:"`, `### B`, `"Shot 2:"`. */
const fieldName = (key: string): string => (isHead(key) ? key : /^### (.+)\/(.+)$/.test(key) ? key.replace(/^### (.+)\/(.+)$/, 'Option $1 "$2:"') : `"${key}:"`);

/** A refused answer: the problem, and the fields it names (so the caller can quote how they were offered). */
export interface Refusal {
  problem: string;
  /** Labelled decks: the field keys named. Pages: the 1-based lines named. */
  names?: string[];
  lines?: number[];
}

/**
 * The total reader for a labelled deck: every line of the answer lands in exactly one field, or the answer is refused
 * with the line or field named. `expected` lists the fields in the order shown (option fields scoped by their block:
 * "### A/Title"); fields are matched by position, so a deck whose labels repeat (two shots numbered 2) still reads.
 * Values keep every line under their label (trailing spaces and blank edges trimmed); a label with nothing after it
 * takes the lines under it.
 */
export function readLabelled(kind: Labelled, text: string, expected: readonly string[]): { ok: true; values: string[] } | ({ ok: false } & Refusal) {
  const lines = lf(text).split('\n');
  // Option fields repeat per block, so their keys are scoped by the latest "### X" line.
  const keys: (string | undefined)[] = [];
  let scope = '';
  for (const line of lines) {
    const l = labelLine(kind, line);
    if (l && isHead(l.key)) scope = l.key;
    keys.push(l ? (kind === 'options' && !isHead(l.key) ? `${scope}/${l.key}` : l.key) : undefined);
  }
  const values: string[][] = [];
  let current = -1;
  let next = 0;
  for (const [n, line] of lines.entries()) {
    const key = keys[n];
    const l = key === undefined ? undefined : labelLine(kind, line);
    if (key !== undefined && l) {
      if (key === 'Voice-over') return { ok: false, problem: 'The voice-over was locked after the script step, so it cannot be changed here: leave it out.' };
      if (expected[next] === key) {
        current = next++;
        values[current] = [l.value];
        continue;
      }
      if (expected.slice(0, next).includes(key)) return { ok: false, problem: `${fieldName(key)} appears twice: keep one line for it, and put more words on the lines under it.`, names: [key] };
      const missing = expected[next];
      if (missing !== undefined && expected.indexOf(key, next) > next) {
        return keys.includes(missing)
          ? { ok: false, problem: 'Keep the lines in the order shown.', names: [missing, key] }
          : { ok: false, problem: `${fieldName(missing)} is missing: keep one line per field, in the order shown; leave it empty after the label to clear it.`, names: [missing] };
      }
      return { ok: false, problem: `${fieldName(key)} is not one of this copy's fields.` };
    }
    if (line.trim()) {
      if (current < 0 || isHead(expected[current]!)) {
        const start = kind === 'options' ? '"Title:", "Pitch:" or "Rationale:" under its "### A" label' : '"Headline:", "Tagline:" or "Shot N:"';
        return { ok: false, problem: `Line ${n + 1} ("${line.trim().slice(0, 60)}") is not under a field: start it with ${start}.` };
      }
      values[current]!.push(line);
    } else if (current >= 0) values[current]!.push(line);
  }
  if (next !== expected.length) return { ok: false, problem: `${fieldName(expected[next]!)} is missing: keep one line per field, in the order shown.`, names: [expected[next]!] };
  return { ok: true, values: values.map((v) => v.map((x) => x.trimEnd()).join('\n').trim()) };
}

/** The fields of an options deck, in the order shown. */
const optionFields = (count: number): string[] => Array.from({ length: count }, (_, i) => [`### ${labelOf(i)}`, ...['Title', 'Pitch', 'Rationale'].map((f) => `### ${labelOf(i)}/${f}`)]).flat();
/** The fields of a storyboard's on-screen deck, in the order shown: one per shot, by position. */
export const onScreenFields = (sb: Storyboard): string[] => ['Headline', 'Tagline', ...sb.storyboard.map((s) => `Shot ${s.shot}`)];

/**
 * The one layout of a non-web deck: line-based, keeps every line, never the reader. It normalises what is layout only:
 * line endings, trailing spaces, every run of blank lines that ends at a label or at either end (however long: the
 * reader trims a value's blank edges, so none of them is the person's text), a value on the line after its label, and
 * the label's case and spacing. Everything inside a value is kept, blank lines between its lines included, so a doubled
 * space in a caption is a change. It defines both the VOICE round trip and the "unchanged" test.
 */
export function layoutOf(kind: DeckKind, text: string): string {
  const t = lf(text);
  if (kind === 'prose') return t.trimEnd();
  if (kind === 'script') return t.trim();
  if (kind === 'code-diff') return t.trim().replace(/^Why:[ \t\n]*/, '').trim();
  const out: string[] = [];
  let pull = false; // a label line with nothing after it takes the next non-blank line as its value's first line
  for (const raw of t.split('\n').map((l) => l.trimEnd())) {
    const l = labelLine(kind, raw);
    if (l) {
      out.push(isHead(l.key) ? l.key : `${l.key}: ${l.value.trim()}`.trimEnd());
      pull = !isHead(l.key) && !l.value.trim();
      continue;
    }
    if (!raw.trim()) {
      if (!pull) out.push('');
      continue;
    }
    if (pull) {
      out[out.length - 1] = `${out.at(-1)} ${raw.trim()}`;
      pull = false;
      continue;
    }
    out.push(raw);
  }
  // A run of blank lines is layout when it starts the deck, ends it, or ends at a label line: look past the whole run.
  const kept: string[] = [];
  for (let i = 0; i < out.length; ) {
    if (out[i] !== '') {
      kept.push(out[i++]!);
      continue;
    }
    let j = i;
    while (j < out.length && out[j] === '') j++;
    if (kept.length && j < out.length && !labelLine(kind, out[j]!)) kept.push(...out.slice(i, j));
    i = j;
  }
  return kept.join('\n');
}

/** The "unchanged" test for a non-web answer: it differs from what was offered only in layout. */
export const sameCopy = (medium: Exclude<Medium, 'web-page'>, scope: MediaCopy, offered: string, answer: string): boolean => {
  const kind = deckKindOf(medium, scope);
  return layoutOf(kind, offered) === layoutOf(kind, answer);
};

/**
 * The VOICE round trip: the deck read back from the written artifact, laid out, equals the answer laid out. A reader
 * or a write that dropped, moved or changed any of the person's text fails it. The refusal quotes the first line that
 * would differ (as laid out), so the person has somewhere to look.
 */
export function roundTripProblem(medium: Exclude<Medium, 'web-page'>, scope: MediaCopy, written: string, answer: string): string | undefined {
  const kind = deckKindOf(medium, scope);
  const got = layoutOf(kind, extractCopy(medium, written, scope));
  const want = layoutOf(kind, answer);
  if (got === want) return undefined;
  const g = got.split('\n');
  const w = want.split('\n');
  let k = 0;
  while (k < w.length && w[k] === g[k]) k++;
  const line = (w[k] ?? g[k] ?? '').trim();
  return `byway could not write your words back exactly as you wrote them, from the line "${line.length > 80 ? `${line.slice(0, 79)}…` : line}" on. Leave that line as it was offered, or write it another way.`;
}

/**
 * Write edited copy back into a structured or text artifact exactly (prose, options, media, code-diff), after reading
 * it with the medium's total reader. Web pages are not handled here (page-copy.ts).
 */
export function applyCopy(medium: Exclude<Medium, 'web-page'>, artifact: string, edited: string, scope: MediaCopy = 'script'): { ok: true; value: string } | ({ ok: false } & Refusal) {
  switch (medium) {
    case 'prose':
      return edited.trim() ? { ok: true, value: `${edited.trimEnd()}\n` } : { ok: false, problem: 'The text is empty.' };
    case 'options': {
      const doc = parseOptions(artifact);
      if (!doc.ok) return doc;
      const fields = optionFields(doc.value.options.length);
      const read = readLabelled('options', edited, fields);
      if (!read.ok) return read;
      const get = (i: number, f: string) => read.values[fields.indexOf(`### ${labelOf(i)}/${f}`)] ?? '';
      const options = doc.value.options.map((o, i) => ({ ...o, title: get(i, 'Title'), pitch: get(i, 'Pitch'), rationale: get(i, 'Rationale') }));
      for (const [i, o] of options.entries()) {
        const empty = (['Title', 'Pitch', 'Rationale'] as const).find((f) => !o[f.toLowerCase() as 'title' | 'pitch' | 'rationale']);
        if (empty) return { ok: false, problem: `Option ${labelOf(i)} needs a title, a pitch and a rationale: its "${empty}:" is empty.`, names: [`### ${labelOf(i)}/${empty}`] };
      }
      return { ok: true, value: serializeJson({ ...doc.value, options }) };
    }
    case 'media': {
      const sb = parseStoryboard(artifact);
      if (!sb.ok) return sb;
      if (scope === 'on-screen') return applyOnScreen(sb.value, edited);
      return { ok: true, value: serializeJson({ ...sb.value, voiceover: edited.trim() }) };
    }
    case 'code-diff': {
      const why = edited.trim();
      if (!why || !why.replace(/^Why:/, '').trim()) return { ok: false, problem: 'The "Why:" paragraph is empty.' };
      return { ok: true, value: joinCodeDiff({ diff: splitCodeDiff(artifact).diff, why: why.startsWith('Why:') ? why : `Why: ${why}` }) };
    }
  }
}

/**
 * The late VOICE's lines back into the storyboard: "Headline:", "Tagline:" and one "Shot N:" per shot, each once, in
 * the order shown (a line left empty after its label clears that field). The voice-over was locked after the script
 * step, so a line for it is refused, never applied.
 */
function applyOnScreen(sb: Storyboard, edited: string): { ok: true; value: string } | ({ ok: false } & Refusal) {
  const read = readLabelled('on-screen', edited, onScreenFields(sb));
  if (!read.ok) return read;
  const [headline, tagline, ...captions] = read.values.map((v) => v || undefined);
  const storyboard = sb.storyboard.map((s, i) => {
    const { caption: _was, ...rest } = s;
    const caption = captions[i];
    return caption === undefined ? rest : { ...rest, caption };
  });
  const { headline: _h, tagline: _t, ...base } = sb;
  return { ok: true, value: serializeJson({ ...base, storyboard, ...(headline !== undefined ? { headline } : {}), ...(tagline !== undefined ? { tagline } : {}) }) };
}

/**
 * How the named lines of a refused answer were first offered, so the person can put them back even after a re-ask
 * (when the web editor's "starting text" is their own previous answer): at most five lines, 80 characters each.
 */
export function offeredQuotes(kind: DeckKind | 'web-page', offered: string | undefined, refusal: Pick<Refusal, 'names' | 'lines'>): string {
  if (offered === undefined) return '';
  const lines = lf(offered).split('\n');
  const at = new Set<number>((refusal.lines ?? []).map((n) => n - 1));
  if (refusal.names?.length && (kind === 'options' || kind === 'on-screen')) {
    let scope = '';
    lines.forEach((line, i) => {
      const l = labelLine(kind, line);
      if (!l) return;
      if (isHead(l.key)) scope = l.key;
      const key = kind === 'options' && !isHead(l.key) ? `${scope}/${l.key}` : l.key;
      if (refusal.names!.includes(key)) at.add(i);
    });
  }
  const quoted = [...at].filter((i) => i >= 0 && i < lines.length).sort((a, b) => a - b).slice(0, 5);
  if (!quoted.length) return '';
  const cut = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);
  return ` As first offered, ${quoted.map((i) => `line ${i + 1} read "${cut(lines[i]!.trim())}"`).join('; ')}.`;
}

// ---- keepsVoice: the deck locked at VOICE, held against later machine writes --------------------------------------

/** What a checked machine write stores: the text (with any locked field written back), its problems, and what was written back. */
export interface LockedWrite {
  text: string;
  problems: string[];
  /** Fields of the person's that this write changed and the runner wrote back as they were ("voice-over"). */
  restored: string[];
}

const ON_SCREEN_LOCKED = "The on-screen copy is the person's (headline, tagline and every shot's caption, which names every shot): keep it exactly as it is, with the same shots.";

/**
 * The keepsVoice lock (port rule 6) for a machine write that starts from `before` with the person's words `voice`.
 * Computed before the write (so a fault here costs no model call); the returned check takes the written text.
 *
 * - No voice: nothing is locked (no VOICE has run).
 * - A storyboard: its voice-over is written back from `before` (canonical C5 runs every keepsVoice writer with the VO
 *   script as its voice). Its on-screen copy is locked exactly when the late VOICE's own reader reads the voice as this
 *   storyboard's complete on-screen deck (whatever the values) and the voice is not the voice-over itself; then any
 *   change to it is refused.
 * - Options, prose and code diffs: the deck must be unchanged. Pages: the deck as shown, line for line.
 * - With no `before`, the written artifact must hold exactly the voice, as a VOICE write would.
 */
export function lockCopy(medium: Medium, voice: string | undefined, before: string | undefined): (after: string) => LockedWrite {
  if (voice === undefined) return (after) => ({ text: after, problems: [], restored: [] });
  if (before === undefined) {
    return (after) => ({ text: after, problems: holdsVoice(medium, voice, after) ? [] : [`The person's own words must stay exactly as written: the work must hold them as they are.`], restored: [] });
  }
  if (medium === 'media') return lockStoryboard(voice, before);
  const deck = lockedDeck(medium, before);
  return (after) => ({ text: after, problems: lockedDeck(medium, after) === deck ? [] : [LOCKED[medium]], restored: [] });
}

const LOCKED: Record<Exclude<Medium, 'media'>, string> = {
  'web-page': "The person's own words must stay exactly as written: keep every line of the page's text, and every link's words and address, exactly as they are, in the same order.",
  prose: "The person's own words must stay exactly as written: keep the text exactly as it is.",
  options: "The person's own words must stay exactly as written: keep every option's title, pitch and rationale exactly as they are.",
  'code-diff': "The person's own words must stay exactly as written: keep the \"Why:\" paragraph exactly as it is.",
};

/** The deck a write is held to, in a form compared exactly. */
const lockedDeck = (medium: Exclude<Medium, 'media'>, text: string): string => (medium === 'web-page' ? pageLockView(text) : extractCopy(medium, text));

/** With no work before the write: the written artifact's deck is the voice, as the VOICE round trip reads it. */
function holdsVoice(medium: Medium, voice: string, after: string): boolean {
  if (medium === 'web-page') {
    const lines = lf(voice).split('\n').map(squashHtml);
    while (lines.length && !lines.at(-1)) lines.pop();
    return JSON.stringify(pageCopy(after)) === JSON.stringify(lines);
  }
  if (medium === 'media') return (['script', 'on-screen'] as const).some((scope) => roundTripProblem(medium, scope, after, voice) === undefined);
  return roundTripProblem(medium, 'script', after, voice) === undefined;
}

function lockStoryboard(voice: string, beforeText: string): (after: string) => LockedWrite {
  const before = parseStoryboard(beforeText);
  if (!before.ok) throw new Error(`the storyboard before this step could not be read (${before.problem})`);
  // The late VOICE's own reader decides the scope: a VO script has no Headline: or Tagline: line, so it stays unlocked.
  const onScreenLocked = layoutOf('script', voice) !== layoutOf('script', before.value.voiceover) && readLabelled('on-screen', voice, onScreenFields(before.value)).ok;
  const onScreen = extractCopy('media', beforeText, 'on-screen');
  const script = extractCopy('media', beforeText, 'script');
  return (afterText) => {
    const after = parseStoryboard(afterText);
    if (!after.ok) return { text: afterText, problems: [after.problem], restored: [] };
    const restored: string[] = [];
    let text = afterText;
    if (after.value.voiceover !== before.value.voiceover) {
      text = serializeJson({ ...after.value, voiceover: before.value.voiceover });
      restored.push('voice-over');
    }
    const problems: string[] = [];
    if (onScreenLocked && extractCopy('media', text, 'on-screen') !== onScreen) problems.push(ON_SCREEN_LOCKED);
    if (extractCopy('media', text, 'script') !== script) throw new Error('the voice-over was not written back');
    return { text, problems, restored };
  };
}
