/**
 * The artifact formats of each medium (spec §3.3 output contracts) and their text views (spec §3.2 "Views by
 * medium"). Parsers follow the spec: take the last fenced block of the expected language, fall back to the whole text,
 * and fail with a plain message when the contract is not met.
 */
import { MEDIUM_FORMAT, type Medium } from '@byway/contracts';
import { z } from 'zod';

export const mediaTypeOf = (medium: Medium): string => MEDIUM_FORMAT[medium].artifactMediaType;
export const viewKindOf = (medium: Medium): 'screenshots' | 'text' => MEDIUM_FORMAT[medium].view;

/** The fence language a medium's artifact travels in (fix, voice.apply and asset.integrate turns). */
export const ARTIFACT_FENCE: Readonly<Record<Medium, string>> = {
  'web-page': 'html',
  prose: 'markdown',
  options: 'json',
  media: 'json',
  'code-diff': 'diff',
};

/** Contents of every fenced block whose language is one of `langs`, in order. */
export function fencedBlocks(text: string, langs: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/```([A-Za-z0-9_-]*)[^\n]*\n([\s\S]*?)\n?```/g)) {
    if (langs.includes((m[1] ?? '').toLowerCase())) out.push(m[2] ?? '');
  }
  return out;
}

export const lastFenced = (text: string, langs: readonly string[]): string | undefined => fencedBlocks(text, langs).at(-1);

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };
const fail = (problem: string): Parsed<never> => ({ ok: false, problem });

// ---- Structured artifacts ----------------------------------------------------------------------------------------

export const OptionSchema = z.object({
  title: z.string().min(1),
  pitch: z.string().min(1),
  rationale: z.string().min(1),
  /** Added by the runner when ASSET made a mood image for the option. */
  imageArtifactId: z.string().optional(),
});
export const OptionsSchema = z.object({ options: z.array(OptionSchema).min(1) });
export type OptionsDoc = z.infer<typeof OptionsSchema>;

export const ShotSchema = z.object({
  shot: z.number().int().positive(),
  description: z.string().min(1),
  imagePrompt: z.string().min(1),
  durationSec: z.number().positive(),
  /** Added by the runner when it stores the shot's frame. */
  imageArtifactId: z.string().optional(),
  /** Added by the runner when a relay link made the shot's clip. */
  clipArtifactId: z.string().optional(),
});
export const StoryboardSchema = z.object({ storyboard: z.array(ShotSchema).min(1), voiceover: z.string() });
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type Shot = z.infer<typeof ShotSchema>;

function parseJson<T>(text: string, schema: z.ZodType<T>, what: string): Parsed<T> {
  const raw = lastFenced(text, ['json']) ?? text.trim();
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
  const block = lastFenced(text, ['diff', 'patch']);
  let diff: string;
  let why = '';
  if (block !== undefined) {
    // A "Why:" paragraph that slipped inside the block belongs after it.
    const inner = splitCodeDiff(block);
    diff = inner.diff;
    const after = text.slice(text.lastIndexOf('```') + 3).trim();
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

/** A complete HTML document: the last fenced html block, else a bare document in the text. */
export function parseHtml(text: string): Parsed<string> {
  const block = lastFenced(text, ['html']);
  const candidate = block ?? /<!doctype html[\s\S]*<\/html>/i.exec(text)?.[0] ?? /<html[\s>][\s\S]*<\/html>/i.exec(text)?.[0];
  if (!candidate) return fail('The answer has no HTML document (expected one fenced html block holding a complete page).');
  if (!/<html[\s>]/i.test(candidate) || !/<\/html>/i.test(candidate)) return fail('The HTML is not a complete document (it needs <html> … </html>).');
  return { ok: true, value: candidate.trim() };
}

/** The Markdown document: the last fenced markdown block, else the whole answer. */
export function parseMarkdown(text: string): Parsed<string> {
  const doc = (lastFenced(text, ['markdown', 'md']) ?? text).trim();
  if (!doc) return fail('The answer is empty (expected the Markdown document).');
  return { ok: true, value: `${doc}\n` };
}

/** A builder's answer, as the text to store in the medium's format. */
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
      return r.ok ? { ok: true, value: serializeJson(r.value) } : r;
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

/** A storyboard as text: each shot with its length and what it shows, then the voice-over. */
export function storyboardText(sb: Storyboard): string {
  const shots = sb.storyboard.map((s) => `Shot ${s.shot} (${s.durationSec}s): ${s.description}\n   Frame: ${s.imagePrompt}${s.clipArtifactId ? '\n   Clip: made' : ''}`);
  return [...shots, '', `Voice-over: ${sb.voiceover}`].join('\n');
}

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
