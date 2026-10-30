/**
 * Exports that work away from byway (EXP-1). Generated pages and Markdown reference generated images at byway's own
 * addresses (`/api/artifacts/<id>`, spec §3.3), which mean nothing once the file is opened from disk, pasted into a
 * document or published elsewhere. A downloaded page or Markdown file therefore carries its images inline, as data:
 * URIs. A reference that is missing, or to something other than an image or clip, is left as it was.
 */
import type { ArtifactStore } from '@byway/contracts';

/** `/artifacts/<id>` or `/api/artifacts/<id>`, the colon written plainly or percent-encoded. */
const REFERENCE = /\/(?:api\/)?artifacts\/sha256(?::|%3A)([0-9a-f]{64})/gi;

/** Media that may be inlined: what a page or document shows. */
const INLINE = /^(image\/(png|jpeg|webp|gif|avif|svg\+xml)|video\/[a-z0-9.+-]+)$/;

/** Above this, the file would be unwieldy; the rest stay as references. */
const MAX_INLINE_BYTES = 40 * 1024 * 1024;

/** Whether a downloaded file of this type gets its images inlined. */
export function exportsInline(mediaType: string): boolean {
  const type = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'text/html' || type === 'text/markdown';
}

/**
 * An option map downloaded with its mood boards (B-014): each option a board was made for (`imageArtifactId`) gets the
 * image inline as `moodBoard`, a data: URI, within the same size limit as a page's images. Anything that is not an
 * option map is returned as it was.
 */
export async function withMoodBoards(text: string, artifacts: Pick<ArtifactStore, 'has' | 'get'>): Promise<string> {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof doc !== 'object' || doc === null) return text;
  const options = (doc as { options?: unknown }).options;
  if (!Array.isArray(options)) return text;
  let total = 0;
  const out = [];
  for (const o of options as Record<string, unknown>[]) {
    const id = typeof o?.imageArtifactId === 'string' ? o.imageArtifactId : undefined;
    if (!id || !(await artifacts.has(id))) {
      out.push(o);
      continue;
    }
    const { record, bytes } = await artifacts.get(id);
    const type = record.mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!INLINE.test(type) || !type.startsWith('image/') || total + bytes.length > MAX_INLINE_BYTES) {
      out.push(o);
      continue;
    }
    total += bytes.length;
    out.push({ ...o, moodBoard: `data:${type};base64,${Buffer.from(bytes).toString('base64')}` });
  }
  return `${JSON.stringify({ ...(doc as object), options: out }, null, 2)}\n`;
}

export async function selfContained(text: string, artifacts: Pick<ArtifactStore, 'has' | 'get'>): Promise<string> {
  const ids = [...new Set([...text.matchAll(REFERENCE)].map((m) => (m[1] ?? '').toLowerCase()))];
  const uris = new Map<string, string>();
  let total = 0;
  for (const hex of ids) {
    const id = `sha256:${hex}`;
    if (!(await artifacts.has(id))) continue;
    const { record, bytes } = await artifacts.get(id);
    const type = record.mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!INLINE.test(type) || total + bytes.length > MAX_INLINE_BYTES) continue;
    total += bytes.length;
    uris.set(hex, `data:${type};base64,${Buffer.from(bytes).toString('base64')}`);
  }
  return text.replace(REFERENCE, (whole, hex: string) => uris.get(hex.toLowerCase()) ?? whole);
}
