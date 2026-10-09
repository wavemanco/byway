/**
 * Helpers for the repo-level document checks: read a file by its repo path, cut a Markdown section out of it, and
 * resolve relative links the way GitHub renders them, so a check fails on a dead link or anchor rather than on wording.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A repo file's text with line endings normalised (the checkout may use CRLF). */
export const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');

/** Every file under a repo folder whose name matches `pattern`, as repo paths with forward slashes. */
export function filesUnder(rel: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (pattern.test(entry.name)) out.push(child);
    }
  };
  walk(rel);
  return out;
}

/**
 * The text of the section that starts at the heading line `heading` (exact, including its #s), up to the next heading
 * of the same or a higher level. Undefined when the heading is missing.
 */
export function section(text: string, heading: string): string | undefined {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return undefined;
  const level = /^#+/.exec(heading)?.[0].length ?? 1;
  const end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l) && (/^#+/.exec(l)?.[0].length ?? 9) <= level);
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** GitHub's heading anchor: lowercase, punctuation other than hyphens and underscores dropped, spaces to hyphens. */
export const slug = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

/** The anchors of every heading in a Markdown file. */
export function anchors(text: string): Set<string> {
  return new Set(
    text
      .split('\n')
      .filter((l) => /^#{1,6}\s/.test(l))
      .map((l) => slug(l.replace(/^#+\s+/, ''))),
  );
}

/** Relative links in a Markdown text, as written: `[label](target)`, skipping URLs with a scheme. */
export function relativeLinks(text: string): { label: string; target: string }[] {
  return [...text.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)]
    .map((m) => ({ label: m[1] ?? '', target: m[2] ?? '' }))
    .filter((l) => !/^[a-z][a-z0-9+.-]*:/i.test(l.target));
}

/**
 * Why a relative link from the Markdown file `fromRel` does not resolve, or undefined when it does: the target file
 * (or folder) must exist, and an anchor must name a heading in the target Markdown file.
 */
export function brokenLink(fromRel: string, target: string): string | undefined {
  const [file = '', anchor] = target.split('#');
  const targetRel = file === '' ? fromRel : path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), file));
  if (!existsSync(path.join(REPO, targetRel))) return `${target}: no file ${targetRel}`;
  if (anchor === undefined) return undefined;
  if (!targetRel.endsWith('.md')) return `${target}: anchor into a file that is not Markdown`;
  return anchors(read(targetRel)).has(anchor) ? undefined : `${target}: no heading #${anchor} in ${targetRel}`;
}
