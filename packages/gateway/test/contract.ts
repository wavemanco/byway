import { z } from 'zod';
import { parseRecipe } from '@byway/recipe';
import { validate } from '@byway/validator';

/**
 * An independent reading of the product spec §3.3 output contracts, written the way the runner's parsers are
 * specified: take the last fenced block of the expected language, fall back to the whole text. Returns problems.
 */

export function lastBlock(text: string, lang: string): string | undefined {
  const blocks = [...text.matchAll(new RegExp('```' + lang + '[^\\n]*\\n([\\s\\S]*?)\\n?```', 'g'))];
  return blocks.at(-1)?.[1];
}

const lastLine = (text: string) => text.trim().split('\n').at(-1)?.trim() ?? '';
const bodyLines = (text: string) => text.trim().split('\n').slice(0, -1).filter((l) => l.trim());

const Options = z.strictObject({ options: z.array(z.strictObject({ title: z.string().min(1), pitch: z.string().min(1), rationale: z.string().min(1) })).min(1) });
const Storyboard = z.strictObject({
  storyboard: z.array(z.strictObject({ shot: z.number().int().positive(), description: z.string().min(1), imagePrompt: z.string().min(1), durationSec: z.number().positive() })).min(1),
  voiceover: z.string().min(1),
});
const Hits = z.strictObject({ hits: z.array(z.strictObject({ pattern: z.string().min(1), where: z.string().min(1), alternative: z.string().min(1) })) });
const Briefs = z.strictObject({
  images: z.array(z.strictObject({ slot: z.string().min(1), prompt: z.string().min(1), alt: z.string().min(1), size: z.enum(['1024x1024', '1536x1024', '1024x1536']) })).min(1),
});
const Dedupe = z.strictObject({
  keep: z.array(z.string().min(1)),
  merged: z.array(z.strictObject({ into: z.string().min(1), from: z.array(z.string().min(1)).min(1) })),
});
const Overlap = z.strictObject({ flags: z.array(z.strictObject({ label: z.string().min(1), overlapsWith: z.string().min(1), note: z.string().min(1) })) });
const Relay = z.strictObject({ clipPrompt: z.string().min(1), durationSec: z.number().positive() });
const Intake = z.strictObject({
  answers: z.array(z.strictObject({ questionId: z.string().min(1), answer: z.boolean(), confidence: z.number().min(0).max(1), rationale: z.string().min(1) })),
  routes: z.record(z.string(), z.string()),
});

function jsonBlock<T>(text: string, schema: z.ZodType<T>): { value?: T; problem?: string } {
  const raw = lastBlock(text, 'json') ?? text;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { value: parsed.data } : { problem: parsed.error.message };
  } catch (e) {
    return { problem: `not JSON: ${(e as Error).message}` };
  }
}

function checkDiff(text: string): string[] {
  const diff = lastBlock(text, 'diff');
  if (!diff) return ['no ```diff block'];
  const problems: string[] = [];
  const lines = diff.split('\n');
  if (!lines[0]?.startsWith('--- ') || !lines[1]?.startsWith('+++ ')) problems.push('missing ---/+++ file headers');
  let i = 2;
  while (i < lines.length) {
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i] as string);
    if (!h) {
      problems.push(`expected a hunk header at line ${i + 1}`);
      break;
    }
    let oldN = 0;
    let newN = 0;
    i++;
    while (i < lines.length && !(lines[i] as string).startsWith('@@')) {
      const c = (lines[i] as string)[0];
      if (c === ' ' || c === undefined) (oldN++, newN++);
      else if (c === '-') oldN++;
      else if (c === '+') newN++;
      else problems.push(`bad diff line ${i + 1}`);
      i++;
    }
    if (oldN !== Number(h[2] ?? 1) || newN !== Number(h[4] ?? 1)) problems.push(`hunk counts ${h[2]},${h[4]} do not match ${oldN},${newN}`);
  }
  const after = text.slice(text.lastIndexOf('```') + 3).trim();
  if (!after.startsWith('Why:')) problems.push('no paragraph starting "Why:" after the diff');
  return problems;
}

export interface CheckContext {
  /** Labels the judge was shown. */
  labels?: string[];
  /** Question ids the intake was asked. */
  questionIds?: string[];
  /** Maximum briefs requested. */
  maxBriefs?: number;
  /** asset.briefs on options and media: the exact slots expected (option labels, shot numbers). */
  slots?: string[];
  /** overlap: the unseeded (vanilla) labels shown, V1, V2… (`labels` holds the seeded ones). */
  vanillaLabels?: string[];
  /** asset.integrate: each image's src (web-page) or Markdown image line (prose) must be in the result. */
  images?: string[];
  /** critic: the mode the prompt asked for, and in GREAT mode the lineup size M of "Rank: N of M". */
  mode?: 'OK' | 'GREAT';
  lineup?: number;
}

export function checkContract(purpose: string, text: string, ctx: CheckContext = {}): string[] {
  const i = purpose.lastIndexOf(':');
  const role = i < 0 ? purpose : purpose.slice(0, i);
  const medium = i < 0 ? undefined : purpose.slice(i + 1);
  const builder = ['build', 'seed', 'fix', 'asset', 'asset.integrate', 'voice.apply'].includes(role);
  if (builder) {
    const problems = artifactProblems(medium, text);
    if (role === 'asset.integrate' && !problems.length) {
      const doc = medium === 'web-page' ? (lastBlock(text, 'html') ?? '') : (lastBlock(text, 'markdown') ?? text);
      for (const image of ctx.images ?? []) {
        if (!(medium === 'web-page' ? doc.includes(`src="${image}"`) : doc.includes(image))) problems.push(`image ${image} is not placed`);
      }
    }
    return problems;
  }
  return judgingProblems(role, text, ctx);
}

/** A builder's answer in its medium's format (spec §3.3, first five rows). */
function artifactProblems(medium: string | undefined, text: string): string[] {
  switch (medium) {
    case 'web-page': {
      const html = lastBlock(text, 'html');
      if (!html) return ['no ```html block'];
      const problems: string[] = [];
      if (!/^<!doctype html>/i.test(html.trim())) problems.push('not a complete document (no doctype)');
      for (const tag of ['<html', '<head>', '<title>', '<body>', '</body>', '</html>']) if (!html.includes(tag)) problems.push(`missing ${tag}`);
      if (/<script[^>]+src=|<link[^>]+href="https?:/i.test(html)) problems.push('loads external resources');
      return problems;
    }
    case 'prose': {
      const md = (lastBlock(text, 'markdown') ?? text).trim();
      return md.startsWith('# ') && md.length > 120 ? [] : ['not a Markdown document with a title'];
    }
    case 'options':
      return jsonBlock(text, Options).problem ? [jsonBlock(text, Options).problem as string] : [];
    case 'media':
      return jsonBlock(text, Storyboard).problem ? [jsonBlock(text, Storyboard).problem as string] : [];
    case 'code-diff':
      return checkDiff(text);
    default:
      return [`unknown medium ${medium}`];
  }
}

function judgingProblems(role: string, text: string, ctx: CheckContext): string[] {
  switch (role) {
    case 'critic': {
      const last = lastLine(text);
      const score = /^Score: (\d+(?:\.\d+)?)\/10$/.exec(last);
      const rank = /^Rank: (\d+) of (\d+)$/.exec(last);
      const problems: string[] = [];
      if (!score && !rank) problems.push(`last line is not a score or rank: "${last}"`);
      if (score && Number(score[1]) > 10) problems.push('score above 10');
      if (rank && Number(rank[1]) > Number(rank[2])) problems.push('rank beyond the lineup');
      if (ctx.mode === 'OK' && !score) problems.push('OK mode answers "Score: N/10"');
      if (ctx.mode === 'GREAT' && !rank) problems.push('GREAT mode answers "Rank: N of M"');
      if (rank && ctx.lineup !== undefined && Number(rank[2]) !== ctx.lineup) problems.push(`ranked among ${rank[2]}, not the ${ctx.lineup} items shown`);
      if (!bodyLines(text).length || !bodyLines(text).every((l) => l.startsWith('- '))) problems.push('critique is not a bullet list');
      return problems;
    }
    case 'judge':
    case 'select':
    case 'rerank': {
      const m = /^Choice: ([A-Z])$/.exec(lastLine(text));
      if (!m) return [`last line is not "Choice: <label>"`];
      return ctx.labels && !ctx.labels.includes(m[1] as string) ? [`chose ${m[1]}, not one of ${ctx.labels.join(', ')}`] : [];
    }
    case 'check':
      return text.trim() === 'No defects.' || text.trim().split('\n').every((l) => l.startsWith('- ')) ? [] : ['neither a defect list nor "No defects."'];
    case 'cut':
      return text.trim().split('\n').every((l) => /^- (Remove|Delete|Drop|Merge)\b/.test(l)) ? [] : ['not a list of removal-verb bullets'];
    case 'tells-sweep':
      return jsonBlock(text, Hits).problem ? [jsonBlock(text, Hits).problem as string] : [];
    case 'tells-compare':
      return /^Keep: [AB]$/.test(lastLine(text)) ? [] : ['last line is not "Keep: A" or "Keep: B"'];
    case 'vision':
      return text.trim() && !text.includes('```') ? [] : ['not plain text'];
    case 'asset.briefs': {
      const r = jsonBlock(text, Briefs);
      if (r.problem) return [r.problem];
      const slots = r.value?.images.map((i) => i.slot) ?? [];
      if (ctx.slots && slots.join() !== ctx.slots.join()) return [`briefs for slots ${slots.join()} instead of ${ctx.slots.join()}`];
      return ctx.maxBriefs && slots.length > ctx.maxBriefs ? ['more briefs than slots'] : [];
    }
    case 'dedupe': {
      const r = jsonBlock(text, Dedupe);
      if (r.problem || !r.value) return [r.problem ?? 'no answer'];
      const { keep, merged } = r.value;
      const problems: string[] = [];
      const from = merged.flatMap((m) => m.from);
      const named = [...keep, ...from];
      if (new Set(named).size !== named.length) problems.push('a label is both kept and merged, or listed twice');
      for (const m of merged) if (!keep.includes(m.into)) problems.push(`merged into ${m.into}, which is not kept`);
      if (ctx.labels) {
        for (const l of named) if (!ctx.labels.includes(l)) problems.push(`label ${l} was not shown`);
        for (const l of ctx.labels) if (!named.includes(l)) problems.push(`label ${l} is neither kept nor merged`);
      }
      return problems;
    }
    case 'overlap': {
      const r = jsonBlock(text, Overlap);
      if (r.problem || !r.value) return [r.problem ?? 'no answer'];
      const problems: string[] = [];
      for (const f of r.value.flags) {
        if (ctx.labels && !ctx.labels.includes(f.label)) problems.push(`flag names ${f.label}, not a seeded option`);
        if (ctx.vanillaLabels && !ctx.vanillaLabels.includes(f.overlapsWith)) problems.push(`flag overlaps ${f.overlapsWith}, not an unseeded answer`);
      }
      return problems;
    }
    case 'relay': {
      const r = jsonBlock(text, Relay);
      return r.problem ? [r.problem] : [];
    }
    case 'advisor.intake': {
      const r = jsonBlock(text, Intake);
      if (r.problem) return [r.problem];
      const ids = r.value?.answers.map((a) => a.questionId) ?? [];
      return ctx.questionIds && ids.join() !== ctx.questionIds.join() ? [`answered ${ids.join()} instead of ${ctx.questionIds.join()}`] : [];
    }
    case 'advisor.compose':
    case 'advisor.compose.repair': {
      const raw = lastBlock(text, 'json') ?? text;
      try {
        const recipe = parseRecipe(JSON.parse(raw));
        const verdict = validate(recipe);
        const problems = verdict.violations.map((v) => `${v.ruleId} ${v.path}: ${v.message}`);
        if (recipe.kind !== 'composed') problems.push(`kind ${recipe.kind}`);
        if (recipe.channel !== 'workspace') problems.push(`channel ${recipe.channel}`);
        return problems;
      } catch (e) {
        return [`not a valid recipe: ${(e as Error).message.slice(0, 300)}`];
      }
    }
    default:
      return [`no contract for the role ${role}`];
  }
}
