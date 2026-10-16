/**
 * Parsers for the judging and helper answers of spec §3.3. Each returns the value or a plain problem, which the model
 * step appends to its one automatic retry. Builders' artifacts are parsed in formats.ts.
 */
import { z } from 'zod';
import { locate, type Parsed } from './formats.ts';
import { hitsCritique } from './hits.ts';
import type { TellsHit } from './types.ts';

const fail = (problem: string): Parsed<never> => ({ ok: false, problem });
const lastLine = (text: string): string => text.trim().split('\n').at(-1)?.trim() ?? '';
const withoutLastLine = (text: string): string => text.trim().split('\n').slice(0, -1).join('\n').trim();
/** Markdown emphasis models sometimes put around a final line ("**Score: 8/10**"). */
const plain = (line: string): string => line.replace(/^[*_`\s]+|[*_`\s]+$/g, '');

/** A critic's answer: a score out of 10 (OK mode), or every label of the lineup ranked, best first (GREAT mode). */
export type CriticAnswer = { mode: 'OK'; critique: string; score: number } | { mode: 'GREAT'; critique: string; ranking: string[] };

/**
 * OK mode (no lineup): the critique as bullets, then `Score: N/10`. GREAT mode (the lineup's labels): each item's
 * critique, then `Ranking: C, A, E, B, D`, every label exactly once, best first (ADR-0072: the critic is never told
 * which item is ours, so it ranks them all). The mode is ours to ask, so an answer in the other form is refused: a
 * lineup scored out of 10 says nothing about our place in it.
 */
export function parseCritic(text: string, lineup?: readonly string[]): Parsed<CriticAnswer> {
  const last = plain(lastLine(text));
  const critique = withoutLastLine(text);
  if (!lineup) {
    const m = /^Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10$/i.exec(last);
    if (!m) return fail(`The last line must be "Score: N/10"; it was "${last.slice(0, 80)}".`);
    const value = Number(m[1]);
    if (value < 0 || value > 10) return fail(`The score must be between 0 and 10; it was ${value}.`);
    return { ok: true, value: { mode: 'OK', critique, score: value } };
  }
  const shape = `"Ranking: ${lineup.join(', ')}" in your order, best first`;
  const m = /^Ranking:\s*(.+?)\.?$/i.exec(last);
  if (!m) return fail(`The last line must rank every item: ${shape}; it was "${last.slice(0, 80)}".`);
  const ranking = (m[1] as string).split(',').map((l) => l.trim().toUpperCase());
  const unknown = ranking.filter((l) => !lineup.includes(l));
  const missing = lineup.filter((l) => !ranking.includes(l));
  if (unknown.length || missing.length || new Set(ranking).size !== ranking.length) {
    const why = [
      ...(missing.length ? [`missing ${missing.join(', ')}`] : []),
      ...(unknown.length ? [`not in the lineup: ${unknown.map((l) => l || '(blank)').join(', ')}`] : []),
      ...(new Set(ranking).size !== ranking.length ? ['a label named twice'] : []),
    ];
    return fail(`The ranking must name every label exactly once (${why.join('; ')}): ${shape}.`);
  }
  return { ok: true, value: { mode: 'GREAT', critique, ranking } };
}

/**
 * One item's part of a lineup critique: the lines under its "### X" heading (any heading level, and the heading may
 * go on after the label, "### B — the bakery"), up to the next heading of that level or higher, or the closing
 * `Ranking:` line when the item is last, heading stripped. Undefined when the critique has no such section, or it is
 * empty. When the label heads more than one section, the shallowest (top-level) one is ours: an item's own inner
 * headings must not stand in for it (ENG-7).
 */
export function sectionOf(critique: string, label: string): string | undefined {
  const lines = critique.split('\n');
  const head = new RegExp(`^(#{1,6})[ \\t]+\\**${label}\\**(?![A-Za-z0-9])`);
  const levels = lines.map((l) => head.exec(l.trim())?.[1]?.length ?? 0);
  const top = Math.min(...levels.filter((n) => n > 0));
  const at = levels.indexOf(top);
  if (at < 0) return undefined;
  const level = top;
  const stop = new RegExp(`^(#{1,${level}}[ \\t]|Ranking:)`, 'i');
  const end = lines.findIndex((l, i) => i > at && stop.test(plain(l)));
  const body = lines
    .slice(at + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
  return body || undefined;
}

/** judge, select, rerank: optional reasoning, then `Choice: <label>` naming one of the labels shown. */
export function parseChoice(text: string, labels: readonly string[]): Parsed<string> {
  const m = /^Choice:\s*\[?([A-Z]{1,2})\]?\.?$/i.exec(plain(lastLine(text)));
  if (!m) return fail('The last line must be "Choice: X", where X is one of the labels shown.');
  const label = (m[1] as string).toUpperCase();
  if (!labels.includes(label)) return fail(`"${label}" is not one of the labels shown (${labels.join(', ')}).`);
  return { ok: true, value: label };
}

/** check: a bullet list of defects, or the single line `No defects.` */
export function parseCheck(text: string): Parsed<{ clean: boolean; defects: string }> {
  const t = text.trim();
  if (/^No defects\.?$/i.test(plain(t))) return { ok: true, value: { clean: true, defects: 'No defects.' } };
  const bullets = t.split('\n').filter((l) => /^\s*[-*•]\s+\S/.test(l));
  if (!bullets.length) return fail('Answer with a bullet list of defects, or exactly "No defects."');
  return { ok: true, value: { clean: false, defects: bullets.map((l) => l.trim()).join('\n') } };
}

const REMOVAL = /^[-*•]\s+(?:\*\*)?(Remove|Delete|Drop|Merge)\b/i;

/**
 * cut: removals, each starting with a removal verb (Remove, Delete, Drop, Merge); other lines are ignored. The single
 * line `Nothing to remove.` is an empty directive (spec §3.3), returned as ''.
 */
export function parseCut(text: string): Parsed<string> {
  if (/^Nothing to remove\.?$/i.test(plain(text.trim()))) return { ok: true, value: '' };
  const bullets = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => REMOVAL.test(l));
  if (!bullets.length) return fail('Answer with a bullet list of removals, each starting with Remove, Delete, Drop or Merge, or the single line "Nothing to remove."');
  return { ok: true, value: bullets.join('\n') };
}

const Hits = z.object({ hits: z.array(z.object({ pattern: z.string().min(1), where: z.string(), alternative: z.string() })) });

function json<T>(text: string, schema: z.ZodType<T>, what: string): Parsed<T> {
  // A json block, else a bare one (JSON.parse is the check), else the whole answer when it has no fence (ENG-1).
  const where = locate(text, ['json'], { bare: true });
  if (where.kind === 'problem') return fail(where.problem);
  const raw = where.kind === 'block' ? where.block.body : text.trim();
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? { ok: true, value: r.data } : fail(`The JSON does not match ${what}: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);
  } catch (e) {
    return fail(`The answer has no valid JSON (expected one fenced json block with ${what}): ${(e as Error).message}`);
  }
}

/** tells-sweep: `{"hits":[{pattern, where, alternative}]}`, rendered as a list the fix step can act on. */
export function parseTellsSweep(text: string): Parsed<{ hits: TellsHit[]; critique: string }> {
  const r = json(text, Hits, '{"hits":[{"pattern","where","alternative"}]}');
  if (!r.ok) return r;
  return { ok: true, value: { hits: r.value.hits, critique: hitsCritique(r.value.hits) } };
}

/** tells-compare (model): optional reasoning, then `Keep: A` or `Keep: B`. */
export function parseKeep(text: string): Parsed<'A' | 'B'> {
  const m = /^Keep:\s*([AB])\.?$/i.exec(plain(lastLine(text)));
  return m ? { ok: true, value: (m[1] as string).toUpperCase() as 'A' | 'B' } : fail('The last line must be "Keep: A" or "Keep: B".');
}

/** vision (model): plain text. */
export function parseVision(text: string): Parsed<string> {
  const t = text.trim();
  return t ? { ok: true, value: t } : fail('The answer is empty.');
}

const Dedupe = z.object({ keep: z.array(z.string()), merged: z.array(z.object({ into: z.string(), from: z.array(z.string()) })).default([]) });

/**
 * dedupe: `{"keep":[…],"merged":[{"into","from":[…]}]}` over the labels shown. Every label is kept or merged, never
 * both, and something is kept.
 */
export function parseDedupe(text: string, labels: readonly string[]): Parsed<{ keep: string[] }> {
  const r = json(text, Dedupe, '{"keep":[labels],"merged":[{"into","from":[labels]}]}');
  if (!r.ok) return r;
  const keep = r.value.keep.map((l) => l.toUpperCase());
  const from = r.value.merged.flatMap((m) => m.from.map((l) => l.toUpperCase()));
  const unknown = [...keep, ...from].filter((l) => !labels.includes(l));
  if (unknown.length) return fail(`Labels ${unknown.join(', ')} were not shown (the labels are ${labels.join(', ')}).`);
  if (!keep.length) return fail('Keep at least one option.');
  if (new Set(keep).size !== keep.length || keep.some((l) => from.includes(l))) return fail('Each label must be either kept once or merged, never both.');
  const missing = labels.filter((l) => !keep.includes(l) && !from.includes(l));
  if (missing.length) return fail(`Say for every label whether it is kept or merged; missing: ${missing.join(', ')}.`);
  return { ok: true, value: { keep: labels.filter((l) => keep.includes(l)) } };
}

const Overlap = z.object({ flags: z.array(z.object({ label: z.string(), overlapsWith: z.string(), note: z.string() })) });

/** overlap: `{"flags":[{"label","overlapsWith","note"}]}`, an annotation only (03 C2). */
export function parseOverlap(text: string, seeded: readonly string[], vanilla: readonly string[]): Parsed<string> {
  const r = json(text, Overlap, '{"flags":[{"label","overlapsWith","note"}]}');
  if (!r.ok) return r;
  const bad = r.value.flags.filter((f) => !seeded.includes(f.label.toUpperCase()) || (vanilla.length > 0 && !vanilla.includes(f.overlapsWith.toUpperCase())));
  if (bad.length) return fail(`Flags must name a labelled option (${seeded.join(', ')}) and an unseeded answer (${vanilla.join(', ')}).`);
  const critique = r.value.flags.length
    ? r.value.flags.map((f) => `- Option ${f.label.toUpperCase()} overlaps the plain answer ${f.overlapsWith.toUpperCase()}: ${f.note}`).join('\n')
    : '- No option overlaps what a plain request produces.';
  return { ok: true, value: critique };
}

const Briefs = z.object({
  images: z.array(z.object({ slot: z.union([z.string(), z.number()]).transform(String), prompt: z.string().min(1), alt: z.string().default(''), size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024') })),
  // Read as text below; anything else is no advice, never a miss (ADR-0101).
  advice: z.unknown().optional(),
});
export type ImageBrief = z.infer<typeof Briefs>['images'][number];

/** A brief answer: the briefs, and the optional line of advice for the person (ADR-0101), plain and bounded. */
export interface BriefAnswer {
  images: ImageBrief[];
  advice?: string;
}

/** The most characters of the AI's advice a step's note shows (ADR-0101); C3's prompt states the same bound. */
export const ADVICE_MAX = 200;

/**
 * Control characters, and format characters such as direction overrides and zero-width spaces, which could make a
 * line read differently from what it holds. The zero-width joiner and non-joiner stay: emoji and some scripts need them.
 */
const NOT_PLAIN = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/gu;

/** Something a person can read: a letter, a number, a punctuation mark or a symbol (blank letters such as U+3164 are not). */
const READABLE = /(?![\u3164\u115F\u1160\uFFA0\u2800])[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * Model text as one plain line for the person to read (ADR-0101): well-formed (a lone surrogate becomes U+FFFD),
 * without control or format characters, its whitespace collapsed, and at most `max` characters, cut at a word with an
 * ellipsis. Empty when nothing readable is left (no letter, number, punctuation mark or symbol). A removed character
 * becomes a space, never nothing, so cleaning cannot join two halves of a text into one; the gateway's held-key check
 * (ADR-0088) runs on the answer's raw text before this.
 */
export function plainLine(text: string, max: number): string {
  // Whitespace first, so a line break between two words leaves a space; then the rest (each removed character becomes a
  // space), then the spaces left doubled.
  const t = text.toWellFormed().replace(/\s+/g, ' ').replace(NOT_PLAIN, ' ').replace(/ {2,}/g, ' ').trim();
  if (!READABLE.test(t)) return '';
  const chars = [...t];
  if (chars.length <= max) return t;
  const cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * asset.briefs: `{"images":[{"slot","prompt","alt","size"}],"advice"?}`. The advice is optional and never makes an
 * answer a miss: anything but text, or text with nothing readable in it, is no advice, so it never costs a retry.
 */
export function parseBriefs(text: string): Parsed<BriefAnswer> {
  const r = json(text, Briefs, '{"images":[{"slot","prompt","alt","size"}]}');
  if (!r.ok) return r;
  const advice = typeof r.value.advice === 'string' ? plainLine(r.value.advice, ADVICE_MAX) : '';
  return { ok: true, value: { images: r.value.images, ...(advice ? { advice } : {}) } };
}

const Relay = z.object({ clipPrompt: z.string().min(1), durationSec: z.number().positive() });

/** relay:media: `{"clipPrompt":string,"durationSec":number}`. */
export function parseRelay(text: string): Parsed<z.infer<typeof Relay>> {
  return json(text, Relay, '{"clipPrompt","durationSec"}');
}
