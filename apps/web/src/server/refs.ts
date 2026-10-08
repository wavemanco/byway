/**
 * Storing "Examples you admire" before a run starts: pasted text as Markdown, images as PNG, JPEG or WebP. An
 * image is accepted only when its bytes are the type it claims, so nothing else (an SVG with script, say) can be
 * stored under an image type and shown back.
 */
import type { Store } from '@byway/contracts';
import { MAX_REF_IMAGE_BYTES, type RefImageType } from '../view/refs.ts';

export type RefUpload = { text: string } | { image: { mediaType: RefImageType; base64: string } };

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0) => prefix.every((b, i) => bytes[at + i] === b);

/** The image type the bytes really are, from their signature. */
export function sniffImage(bytes: Uint8Array): RefImageType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return undefined;
}

export class RefError extends Error {
  override name = 'RefError';
}

export async function storeRef(store: Store, upload: RefUpload): Promise<{ artifactId: string; mediaType: string }> {
  if ('text' in upload) {
    const record = await store.artifacts.putText(upload.text.trim(), 'text/markdown');
    return { artifactId: record.id, mediaType: record.mediaType };
  }
  const bytes = new Uint8Array(Buffer.from(upload.image.base64, 'base64'));
  if (bytes.byteLength === 0) throw new RefError('That image is empty.');
  if (bytes.byteLength > MAX_REF_IMAGE_BYTES) throw new RefError('That image is larger than 5 MB. Use a smaller one.');
  if (sniffImage(bytes) !== upload.image.mediaType) throw new RefError('That file is not a PNG, JPEG or WebP image.');
  const record = await store.artifacts.put(bytes, upload.image.mediaType);
  return { artifactId: record.id, mediaType: record.mediaType };
}
