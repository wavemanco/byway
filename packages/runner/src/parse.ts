/**
 * Parsers for the judging and helper answers of spec §3.3. Each returns the value or a plain problem, which the model
 * step appends to its one automatic retry. Builders' artifacts are parsed in formats.ts.
 */
import { z } from 'zod';
import { lastFenced, type Parsed } from './formats.ts';
import type { Score } from './types.ts';

const fail = (problem: string): Parsed<never> => ({ ok: false, problem });
const lastLine = (text: string): string => text.trim().split('\n').at(-1)?.trim() ?? '';
const withoutLastLine = (text: string): string => text.trim().split('\n').slice(0, -1).join('\n').trim();
/** Markdown emphasis models sometimes put around a final line ("**Score: 8/10**"). */
const plain = (line: string): string => line.replace(/^[*_`\s]+|[*_`\s]+$/g, '');

export interface CriticAnswer {
  critique: string;
  score: Score;
}

/**
 * The critique as bullets, then `Score: N/10` (OK mode) or `Rank: N of M` (GREAT mode). The mode is ours to ask, so an
 * answer in the other form is refused: a GREAT lineup scored out of 10 says nothing about our place in it.
 */
export function parseCritic(text: string, mode: 'OK' | 'GREAT', lineup?: number): Parsed<CriticAnswer> {
  const last = plain(lastLine(text));
  const critique = withoutLastLine(text);
  if (mode === 'OK') {
    const m = /^Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10$/i.exec(last);
    if (!m) return fail(`The last line must be "Score: N/10"; it was "${last.slice(0, 80)}".`);
    const value = Number(m[1]);
    if (value < 0 || value > 10) return fail(`The score must be between 0 and 10; it was ${value}.`);
    return { ok: true, value: { critique, score: { kind: 'score', value } } };
  }
  const m = /^Rank:\s*(\d+)\s+of\s+(\d+)$/i.exec(last);
  if (!m) return fail(`The last line must be "Rank: N of M"; it was "${last.slice(0, 80)}".`);
  const rank = Number(m[1]);
  const of = Number(m[2]);
  if (lineup !== undefined && of !== lineup) return fail(`The lineup has ${lineup} items, so the last line must be "Rank: N of ${lineup}".`);
  if (rank < 1 || rank > of) return fail(`The rank must be between 1 and ${of}.`);
  return { ok: true, value: { critique, score: { kind: 'rank', rank, of } } };
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

/** cut: removals, each starting with a removal verb (Remove, Delete, Drop, Merge). Other lines are ignored. */
export function parseCut(text: string): Parsed<string> {
  const bullets = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => REMOVAL.test(l));
  if (!bullets.length) return fail('Answer with a bullet list of removals, each starting with Remove, Delete, Drop or Merge.');
  return { ok: true, value: bullets.join('\n') };
}

const Hits = z.object({ hits: z.array(z.object({ pattern: z.string().min(1), where: z.string(), alternative: z.string() })) });
export type TellsHit = z.infer<typeof Hits>['hits'][number];

function json<T>(text: string, schema: z.ZodType<T>, what: string): Parsed<T> {
  const raw = lastFenced(text, ['json']) ?? text.trim();
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
  const critique = r.value.hits.length ? r.value.hits.map((h) => `- ${h.pattern}${h.where ? ` (${h.where})` : ''}: ${h.alternative}`).join('\n') : 'No reflexive defaults found.';
  return { ok: true, value: { hits: r.value.hits, critique } };
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
});
export type ImageBrief = z.infer<typeof Briefs>['images'][number];

/** asset.briefs: `{"images":[{"slot","prompt","alt","size"}]}`. */
export function parseBriefs(text: string): Parsed<ImageBrief[]> {
  const r = json(text, Briefs, '{"images":[{"slot","prompt","alt","size"}]}');
  return r.ok ? { ok: true, value: r.value.images } : r;
}

const Relay = z.object({ clipPrompt: z.string().min(1), durationSec: z.number().positive() });

/** relay:media: `{"clipPrompt":string,"durationSec":number}`. */
export function parseRelay(text: string): Parsed<z.infer<typeof Relay>> {
  return json(text, Relay, '{"clipPrompt","durationSec"}');
}
