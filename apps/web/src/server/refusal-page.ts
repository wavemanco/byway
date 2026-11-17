/**
 * The page a browser gets when the per-start secret refuses it (B-188, guard.ts): self-contained, since a refused
 * browser can load none of byway's own files, and with nothing in it but the message, escaped.
 */
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function refusalPage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>byway</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#222}h1{font-size:1.25rem}</style></head><body><h1>byway</h1><p>${escape(message)}</p></body></html>`;
}
