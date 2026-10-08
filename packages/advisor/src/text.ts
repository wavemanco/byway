import type { ProblemBrief } from '@byway/contracts';

/**
 * Text helpers for prompts and answers, following the shared conventions of product spec §3.3 (the same layout the
 * prompts package and the gateway's mock use; the advisor does not depend on @byway/prompts, so the few it needs are
 * here).
 */

/** A fence its content cannot close: one backtick longer than the longest run inside, and at least three. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

export function fenced(lang: string, body: string): string {
  const f = fenceFor(body);
  return `${f}${lang}\n${body.replace(/\n+$/, '')}\n${f}`;
}

/** The last fenced block of a language (```json … ```), or undefined when there is none. */
export function lastFenced(text: string, lang: string): string | undefined {
  const re = /(`{3,})([A-Za-z0-9_-]*)[^\n]*\n([\s\S]*?)\n?\1(?!`)/g;
  let found: string | undefined;
  for (const m of text.matchAll(re)) if ((m[2] ?? '').toLowerCase() === lang) found = m[3] ?? '';
  return found;
}

/**
 * The JSON value an answer carries: the last fenced json block, else the whole text (spec §3.3: parsers take the last
 * fenced block of the expected language and fall back to the whole text). Throws a plain message on bad JSON.
 */
export function answerJson(text: string): unknown {
  const body = lastFenced(text, 'json') ?? text.trim();
  try {
    return JSON.parse(body);
  } catch {
    throw new ContractError('the answer holds no valid JSON (expected one fenced json block)');
  }
}

/** An answer that does not meet its output contract; the message goes back to the model on the retry. */
export class ContractError extends Error {
  override name = 'ContractError';
}

/**
 * The `problem` slot: the user's words, then the brief fields they gave, then pasted material, each fenced. Templates
 * put it inside <problem>…</problem> (the shared convention), so the slot itself carries no tags.
 */
export function problemText(p: ProblemBrief): string {
  const parts = [p.text.trim()];
  const fields = [
    ...(p.deliverable ? [`Deliverable: ${p.deliverable}`] : []),
    ...(p.audience ? [`Audience: ${p.audience}`] : []),
    ...(p.constraints?.length ? ['Constraints:', ...p.constraints.map((c) => `- ${c}`)] : []),
  ];
  if (fields.length) parts.push(fields.join('\n'));
  for (const a of p.attachments ?? []) parts.push(`Attachment: ${a.name}\n${fenced('', a.text)}`);
  return parts.join('\n\n');
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** At most `max` characters, cut at a word boundary with an ellipsis. */
export function clip(text: string, max: number): string {
  const t = oneLine(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
