/**
 * The artifact formats of each medium (spec §3.3 output contracts) and their text views (spec §3.2 "Views by
 * medium"). Parsers follow the spec: take the last fenced block of the expected language, fall back to the whole text
 * only when the answer has no fence at all, and fail with a plain message when the contract is not met.
 */
import { MEDIUM_FORMAT, type Medium } from '@byway/contracts';
import { z } from 'zod';

export const mediaTypeOf = (medium: Medium): string => MEDIUM_FORMAT[medium].artifactMediaType;
export const viewKindOf = (medium: Medium): 'screenshots' | 'text' => MEDIUM_FORMAT[medium].view;

// ---- Fences ------------------------------------------------------------------------------------------------------

/** A top-level fenced block of an answer. */
export interface Fenced {
  /** The info string's first word, lower case ('' for a bare fence). */
  lang: string;
  body: string;
  /** Offset of the opening fence line. */
  start: number;
  /** Offset just past the block's closing fence line (the end of the text when it was never closed). */
  end: number;
  closed: boolean;
}

/** A fence line: three or more backticks or tildes at the very start of a line, then an optional info string. */
const FENCE_LINE = /^(`{3,}|~{3,})(.*)$/;

/**
 * The answer's top-level fenced blocks, read line by line (ENG-1). Documents and diffs hold fences of their own (a
 * README's code block, a diff that adds one), so a block is not cut at the first ``` anywhere, as a lazy regex does:
 * - a fence is a line that starts with three or more backticks (or tildes); a fence in the middle of a line, or
 *   indented, or after a diff's "+", is content;
 * - a block closes at the first later fence line of the same character, at least as long, with nothing after it
 *   (CommonMark), so a longer outer fence (````markdown) holds any shorter one;
 * - inside a block, a fence line with a language (```bash) opens a nested block that the next bare fence closes: that
 *   is how a model writes a document with a code block inside one ```markdown fence, and the outer block must not end
 *   at the inner one's close.
 * A block never closed runs to the end of the text.
 */
export function fences(text: string): Fenced[] {
  const out: Fenced[] = [];
  const stack: { char: string; len: number; lang: string; start: number; bodyStart: number }[] = [];
  let at = 0;
  for (const raw of text.split('\n')) {
    const lineStart = at;
    at += raw.length + 1;
    const m = FENCE_LINE.exec(raw.replace(/\r$/, ''));
    if (!m) continue;
    const run = m[1]!;
    const info = m[2]!.trim();
    // "```x```" on one line is inline code, not a fence (a backtick fence's info string has no backticks).
    if (run[0] === '`' && info.includes('`')) continue;
    const top = stack.at(-1);
    if (!top) {
      stack.push({ char: run[0]!, len: run.length, lang: (info.split(/\s+/)[0] ?? '').toLowerCase(), start: lineStart, bodyStart: Math.min(at, text.length) });
      continue;
    }
    if (!info && run[0] === top.char && run.length >= top.len) {
      stack.pop();
      if (!stack.length) {
        const body = text.slice(top.bodyStart, Math.max(top.bodyStart, lineStart - 1)).replace(/\r$/, '');
        out.push({ lang: top.lang, body, start: top.start, end: Math.min(at, text.length), closed: true });
      }
    } else if (info) {
      stack.push({ char: run[0]!, len: run.length, lang: '', start: lineStart, bodyStart: at });
    }
  }
  const open = stack[0];
  if (open) out.push({ lang: open.lang, body: text.slice(open.bodyStart).replace(/\n$/, ''), start: open.start, end: text.length, closed: false });
  return out;
}

/** Where an answer's content is: one block of the language, no fence at all (the whole text), or a problem. */
export type Located = { kind: 'block'; block: Fenced } | { kind: 'whole' } | { kind: 'problem'; problem: string };

/**
 * The last block of the expected language. A bare block after it means a fence inside the content closed the block
 * early (the rest of the content follows it), so the answer is refused with the fix. An answer with fences but none
 * of the language is refused too, unless `bare` allows a bare block (formats whose content check is strict: JSON
 * parses or does not, a diff has its headers). Only an answer with no fence at all is read whole.
 */
export function locate(text: string, langs: readonly string[], opts: { bare?: boolean } = {}): Located {
  const blocks = fences(text);
  const fence = langs[0] ?? '';
  const i = blocks.findLastIndex((b) => langs.includes(b.lang));
  if (i >= 0) {
    if (blocks.slice(i + 1).some((b) => b.lang === '')) {
      return { kind: 'problem', problem: `A fence inside the content closed the \`\`\`${fence} block early. Put the whole answer in one block with a longer fence: more backticks than any run inside it (\`\`\`\`${fence}).` };
    }
    return { kind: 'block', block: blocks[i]! };
  }
  if (opts.bare) {
    const bare = blocks.findLast((b) => b.lang === '');
    if (bare) return { kind: 'block', block: bare };
  }
  if (blocks.length) return { kind: 'problem', problem: `The answer has fenced blocks, but none marked \`\`\`${fence}: put the answer in one \`\`\`${fence} block.` };
  return { kind: 'whole' };
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };
/**
 * A parsed answer, or why it misses its contract, where a miss may still be usable: an answer that is well formed but
 * short of what was asked (an ASSET answer with fewer images than its prompt asks for) carries what it did give.
 * askModel asks once more with the problem, and if the second answer falls short too it returns the usable part
 * instead of failing the step (ADR-0090). A malformed answer is a plain miss and still fails it.
 */
export type Usable<T> = Parsed<T> | { ok: false; problem: string; usable: T };
const fail = (problem: string): Parsed<never> => ({ ok: false, problem });

// ---- Structured artifacts ----------------------------------------------------------------------------------------

export const OptionSchema = z.object({
  title: z.string().min(1),
  pitch: z.string().min(1),
  rationale: z.string().min(1),
  /** Added by the runner when ASSET made a mood image for the option. */
  imageArtifactId: z.string().optional(),
  /**
   * True on the options the person chose, as C2's option-map step writes them (its prompt asks for it). VOICE edits only
   * an option's title, pitch and rationale, so this is what the mood boards follow, not the "Chosen." a rationale opens
   * with (B-049).
   */
  chosen: z.boolean().optional(),
});
export const OptionsSchema = z.object({ options: z.array(OptionSchema).min(1) });
export type OptionsDoc = z.infer<typeof OptionsSchema>;

export const ShotSchema = z.object({
  shot: z.number().int().positive(),
  description: z.string().min(1),
  imagePrompt: z.string().min(1),
  durationSec: z.number().positive(),
  /** On-screen copy over the shot (spec §3.3, contracts v5): the late VOICE writes it (VOICE-1). */
  caption: z.string().optional(),
  /** Added by the runner when it stores the shot's frame. */
  imageArtifactId: z.string().optional(),
  /** Added by the runner when a relay link made the shot's clip. */
  clipArtifactId: z.string().optional(),
  /**
   * Added with the clip: its last frame, which the gateway extracts and the next link starts from. The shot check inside
   * the link sees it beside the frame the clip started from (F10, ADR-0090). Never in the storyboard's text (BLIND-1).
   */
  lastFrameArtifactId: z.string().optional(),
  /** Added with the clip when the gateway could take one: a frame from its middle, which the shot check sees too (F10 (a)). */
  middleFrameArtifactId: z.string().optional(),
});
/**
 * A storyboard (spec §3.3): shots, the voice-over (locked after the early VOICE), and the on-screen headline and
 * tagline, which with the shots' captions are the late VOICE's copy (convention C4).
 */
export const StoryboardSchema = z.object({ storyboard: z.array(ShotSchema).min(1), voiceover: z.string(), headline: z.string().optional(), tagline: z.string().optional() });
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type Shot = z.infer<typeof ShotSchema>;

function parseJson<T>(text: string, schema: z.ZodType<T>, what: string): Parsed<T> {
  const where = locate(text, ['json'], { bare: true });
  if (where.kind === 'problem') return fail(where.problem);
  const raw = where.kind === 'block' ? where.block.body : text.trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    return fail(`The answer has no valid JSON ${what} (expected one fenced json block): ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return fail(`The JSON ${what} does not have the expected shape: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);
  return { ok: true, value: parsed.data };
}

export const parseOptions = (text: string): Parsed<OptionsDoc> => parseJson(text, OptionsSchema, 'options ({"options":[{"title","pitch","rationale"}]})');
export const parseStoryboard = (text: string): Parsed<Storyboard> =>
  parseJson(text, StoryboardSchema, 'storyboard ({"storyboard":[{"shot","description","imagePrompt","durationSec"}],"voiceover"})');

/**
 * Why a storyboard a writer answers with numbers a shot twice, or undefined. The relay keys a shot's clip by its number
 * (activities/relay.ts: one link per number, whose clip is written onto every shot with it), so with shots 1, 2, 2 the
 * second shot 2's clip would replace the first on both. Only what a writer answers is held to it (parseArtifact): a
 * model's answer, which askModel asks for again with the problem, and a person's own draft (activities/human.ts
 * finishHumanStep), which is asked for again with the problem, as any other draft parseArtifact cannot use is. A storyboard
 * already stored is read as it is (parseStoryboard), and the late VOICE's "Shot N:" lines are read in order and applied
 * by position (copy.ts readLabelled, applyOnScreen).
 */
function repeatedShots(sb: Storyboard): string | undefined {
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const { shot } of sb.storyboard) (seen.has(shot) ? repeated : seen).add(shot);
  if (!repeated.size) return undefined;
  const shots = [...repeated];
  const named = shots.length === 1 ? `Shot ${shots[0]} appears` : `Shots ${shots.slice(0, -1).join(', ')} and ${shots.at(-1)} appear`;
  return `${named} more than once in the storyboard: give each shot its own number.`;
}

export const serializeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

// ---- Code diffs --------------------------------------------------------------------------------------------------

/** A code-diff artifact: a unified diff and the paragraph that says why. */
export interface CodeDiff {
  diff: string;
  why: string;
}

const WHY = /^Why:/m;

/** Split a stored code-diff artifact (the diff, a blank line, then the "Why:" paragraph). */
export function splitCodeDiff(text: string): CodeDiff {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l, i) => l.startsWith('Why:') && (i === 0 || lines[i - 1]?.trim() === ''));
  if (at < 0) return { diff: text.trimEnd(), why: '' };
  return { diff: lines.slice(0, at).join('\n').trimEnd(), why: lines.slice(at).join('\n').trim() };
}

export const joinCodeDiff = (d: CodeDiff): string => `${d.diff.trimEnd()}\n\n${d.why.trim()}\n`;

function looksLikeDiff(diff: string): string | undefined {
  const lines = diff.split('\n');
  const minus = lines.findIndex((l) => l.startsWith('--- '));
  if (minus < 0 || !lines[minus + 1]?.startsWith('+++ ')) return 'the diff has no ---/+++ file headers';
  if (!lines.some((l) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(l))) return 'the diff has no hunk (@@ … @@)';
  return undefined;
}

/** One fenced diff block (a unified diff), then a paragraph starting "Why:". */
export function parseCodeDiff(text: string): Parsed<CodeDiff> {
  const where = locate(text, ['diff', 'patch'], { bare: true });
  if (where.kind === 'problem') return fail(`The answer is not a unified diff in one fenced diff block: ${where.problem}`);
  let diff: string;
  let why = '';
  if (where.kind === 'block') {
    // A "Why:" paragraph that slipped inside the block belongs after it.
    const inner = splitCodeDiff(where.block.body);
    diff = inner.diff;
    // The text after the block the diff came from (not after the last ``` anywhere: the diff may add a fence).
    const after = text.slice(where.block.end).trim();
    why = WHY.test(after) ? (after.slice(after.search(WHY)).split(/\n\s*\n/)[0] ?? '').trim() : inner.why;
  } else {
    const whole = splitCodeDiff(text.trim());
    diff = whole.diff;
    why = whole.why;
  }
  const problem = looksLikeDiff(diff);
  if (problem) return fail(`The answer is not a unified diff in one fenced diff block: ${problem}.`);
  if (!why) return fail('The answer has no paragraph starting "Why:" after the diff.');
  return { ok: true, value: { diff, why } };
}

// ---- Documents ---------------------------------------------------------------------------------------------------

const completePage = (html: string): boolean => /<html[\s>]/i.test(html) && /<\/html>/i.test(html);

/**
 * A complete HTML document: the last fenced html block when it is one. Otherwise the document in the text, from its
 * doctype (or <html>) to its last </html>: a page whose own code sample (a bare ``` line in a <pre>) closed the fence
 * early is still whole there.
 */
export function parseHtml(text: string): Parsed<string> {
  const where = locate(text, ['html'], { bare: true });
  const block = where.kind === 'block' ? where.block.body : undefined;
  const bare = /<!doctype html[\s\S]*<\/html>/i.exec(text)?.[0] ?? /<html[\s>][\s\S]*<\/html>/i.exec(text)?.[0];
  const candidate = block !== undefined && completePage(block) ? block : (bare ?? block);
  if (!candidate) return fail(where.kind === 'problem' ? where.problem : 'The answer has no HTML document (expected one fenced html block holding a complete page).');
  if (!completePage(candidate)) return fail('The HTML is not a complete document (it needs <html> … </html>).');
  return { ok: true, value: candidate.trim() };
}

/**
 * The Markdown document: the last fenced markdown block, or the whole answer when it has no fence at all. An answer
 * with other fences only, or whose block a fence inside it closed early, is refused (and so asked again), never stored
 * with its preamble and fence lines or cut short.
 */
export function parseMarkdown(text: string): Parsed<string> {
  const where = locate(text, ['markdown', 'md']);
  if (where.kind === 'problem') return fail(where.problem);
  const doc = (where.kind === 'block' ? where.block.body : text).trim();
  if (!doc) return fail('The answer is empty (expected the Markdown document).');
  return { ok: true, value: `${doc}\n` };
}

/** A builder's answer, as the text to store in the medium's format (a storyboard's shots numbered once each). */
export function parseArtifact(medium: Medium, text: string): Parsed<string> {
  switch (medium) {
    case 'web-page':
      return parseHtml(text);
    case 'prose':
      return parseMarkdown(text);
    case 'options': {
      const r = parseOptions(text);
      return r.ok ? { ok: true, value: serializeJson(r.value) } : r;
    }
    case 'media': {
      const r = parseStoryboard(text);
      if (!r.ok) return r;
      const repeated = repeatedShots(r.value);
      return repeated ? fail(repeated) : { ok: true, value: serializeJson(r.value) };
    }
    case 'code-diff': {
      const r = parseCodeDiff(text);
      return r.ok ? { ok: true, value: joinCodeDiff(r.value) } : r;
    }
  }
}

// ---- Text views --------------------------------------------------------------------------------------------------

/** Options as their audience reads them: a numbered plain-text list. */
export function optionsText(doc: OptionsDoc): string {
  return doc.options.map((o, i) => `${i + 1}. ${o.title}: ${o.pitch}\n   Why: ${o.rationale}`).join('\n');
}

/**
 * A storyboard as its audience meets it: the headline and tagline, each shot with its length, what it shows and its
 * on-screen caption, then the voice-over. Never how it was made (BLIND-1): the image prompts and whether a clip exists
 * are process, which a critic must not read (port rule 1), and a lineup's references have none.
 */
export function storyboardText(sb: Storyboard): string {
  const head = [...(sb.headline ? [`Headline: ${sb.headline}`] : []), ...(sb.tagline ? [`Tagline: ${sb.tagline}`] : [])];
  return [...head, ...(head.length ? [''] : []), ...sb.storyboard.map(shotText), '', `Voice-over: ${sb.voiceover}`].join('\n');
}

/** One shot as storyboardText writes it: its length, what it shows and its on-screen caption. */
export const shotText = (s: Shot): string => `Shot ${s.shot} (${s.durationSec}s): ${s.description}${s.caption ? `\n   On screen: ${s.caption}` : ''}`;

/**
 * The text view of an artifact in a text medium (or the text half of a media view). Prose and diffs are read as they
 * are; options and storyboards as lists. A structured artifact that does not parse is shown as stored.
 */
export function textView(medium: Medium, text: string): string {
  if (medium === 'options') {
    const r = parseOptions(text);
    return r.ok ? optionsText(r.value) : text;
  }
  if (medium === 'media') {
    const r = parseStoryboard(text);
    return r.ok ? storyboardText(r.value) : text;
  }
  return text;
}
