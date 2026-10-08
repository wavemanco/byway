import type { ProblemBrief } from '@byway/contracts';
import type { Medium } from '@byway/protocol';

/**
 * Helpers that lay out slot values the way the templates expect them (spec §3.3 shared conventions), so the runner,
 * the advisor and the mock agree on one format. Pure functions: safe in workflow bundles.
 */

/** The fence language a medium's artifact travels in, in fix, voice.apply and asset.integrate turns. */
export const ARTIFACT_FENCE: Readonly<Record<Medium, string>> = {
  'web-page': 'html',
  prose: 'markdown',
  options: 'json',
  media: 'json',
  'code-diff': 'diff',
};

/** A, B, … Z, AA, AB, … for the i-th item (0-based). */
export function labelOf(i: number): string {
  if (!Number.isInteger(i) || i < 0) throw new Error(`No label for index ${i}`);
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const headed = (heads: string[], texts: readonly string[]) => texts.map((t, i) => `### ${heads[i]}\n${t.trim()}`).join('\n\n');

/** Candidates or options as "### A" headings, each followed by its text (the `options` slot, or `view` for a view). */
export function labelled(texts: readonly string[]): string {
  return headed(texts.map((_, i) => labelOf(i)), texts);
}

/** The unseeded control runs of an overlap step, as "### V1" headings (the `options` slot of an overlap step). */
export function vanillaLabelled(texts: readonly string[]): string {
  return headed(texts.map((_, i) => `V${i + 1}`), texts);
}

/**
 * The two slots of a GREAT-mode critic (ADR-0071: at least 3 references). The template turns them into the line
 * "There are R references and 1 of ours (M items, labelled A–X; ours is Y)." The critic is told which item is ours
 * because the answer contract (spec §3.3) is our own place, "Rank: N of M"; the runner shuffles where ours sits.
 */
export function greatLineup(referenceCount: number, oursIndex: number): { refs: string; labels: string } {
  if (!Number.isInteger(referenceCount) || referenceCount < 1) throw new Error('A GREAT-mode lineup needs at least one reference');
  const m = referenceCount + 1;
  if (!Number.isInteger(oursIndex) || oursIndex < 0 || oursIndex >= m) throw new Error(`ours must be one of the ${m} positions`);
  return { refs: String(referenceCount), labels: `${m} items, labelled A–${labelOf(m - 1)}; ours is ${labelOf(oursIndex)}` };
}

export interface GeneratedImage {
  artifactId: string;
  alt: string;
  /** The brief's slot: a data-slot name on pages, an option label, a shot number. */
  slot: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The `images` slot of an asset.integrate turn. Images are served from the artifact store at `/api/artifacts/<id>`.
 * Prose gets Markdown image lines; a page gets "address | alt | slot" lines (the address first, so a reader of the
 * prompt, the mock included, finds the route).
 */
export function imagesSlot(medium: Medium, images: readonly GeneratedImage[]): string {
  const route = (id: string) => `/api/artifacts/${id}`;
  if (medium === 'prose') return images.map((i) => `![${oneLine(i.alt).replace(/\[/g, '(').replace(/\]/g, ')')}](${route(i.artifactId)})`).join('\n');
  if (medium === 'web-page') return images.map((i) => `${route(i.artifactId)} | ${oneLine(i.alt).replace(/\|/g, '/')} | ${oneLine(i.slot)}`).join('\n');
  throw new Error(`There is no asset.integrate call on ${medium}: the runner attaches imageArtifactId instead (spec §3.3)`);
}

/** A fence that its content cannot close: one backtick longer than the longest run inside. */
function fence(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The `problem` slot: the user's words, then the brief fields they gave, then pasted material, each fenced. */
export function problemSlot(p: ProblemBrief): string {
  const parts = [p.text.trim()];
  const fields = [
    ...(p.deliverable ? [`Deliverable: ${p.deliverable}`] : []),
    ...(p.audience ? [`Audience: ${p.audience}`] : []),
    ...(p.constraints?.length ? ['Constraints:', ...p.constraints.map((c) => `- ${c}`)] : []),
  ];
  if (fields.length) parts.push(fields.join('\n'));
  for (const a of p.attachments ?? []) {
    const f = fence(a.text);
    parts.push(`Attachment: ${a.name}\n${f}\n${a.text.replace(/\n+$/, '')}\n${f}`);
  }
  return parts.join('\n\n');
}
