/** Small text helpers shared by the server and the client. */

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 3 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** A run title from the problem: its first sentence, capitalised, at most 60 characters. */
export function titleFromProblem(problem: string, max = 60): string {
  const first = problem.trim().split(/(?<=[.!?])\s+|\n/)[0]?.trim().replace(/[.!?]+$/, '') ?? '';
  if (!first) return 'Untitled';
  return clip(first.charAt(0).toUpperCase() + first.slice(1), max);
}

/** A one-paragraph excerpt of Markdown or plain text, without markup. */
export function excerpt(text: string, max = 160): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    // A heading runs into the text after it, so it keeps a colon to read as a lead-in ("Brief: …").
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*$/gm, (_, heading: string) => (/[.!?:]$/.test(heading) ? heading : `${heading}:`))
    .replace(/^\s{0,3}(>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return clip(plain, max);
}

/** A card's text without its first heading, when that heading only repeats the caption shown above the card. */
export function withoutLeadingTitle(text: string, label: string): string {
  const match = /^\s*#{1,6}[ \t]+(.+?)[ \t]*(?:\r?\n)+/.exec(text);
  if (!match || match[1]?.trim() !== label.trim()) return text;
  return text.slice(match[0].length);
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || 'byway-result';
}

const EXTENSIONS: Record<string, string> = {
  'text/html': 'html',
  'text/markdown': 'md',
  'application/json': 'json',
  'text/x-diff': 'patch',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function extensionFor(mediaType: string): string {
  return EXTENSIONS[mediaType.split(';')[0]?.trim() ?? ''] ?? 'txt';
}

export function exportFileName(title: string, mediaType: string): string {
  return `${slugify(title)}.${extensionFor(mediaType)}`;
}
