/**
 * The page a browser gets when the per-start secret refuses it (B-188, guard.ts): self-contained, since a refused
 * browser can load none of byway's own files, and with nothing in it but the message, escaped.
 */
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const page = (head: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">${head}<title>byway</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#222}h1{font-size:1.25rem}</style></head><body><h1>byway</h1>${body}</body></html>`;

export function refusalPage(message: string): string {
  return page('', `<p>${escape(message)}</p>`);
}

/**
 * The start link's answer, with the access cookie: a page that goes on to the start screen by itself, rather than a
 * redirect. A browser sends a SameSite=Strict cookie on a navigation only when the page that started it is byway's
 * own, and the start link is often opened from another site's page (a chat, a notes page), which a redirect would
 * carry over: this page is byway's, so its move to the start screen carries the cookie.
 */
export function openedPage(): string {
  return page('<meta http-equiv="refresh" content="0;url=/">', '<p><a href="/">Continue to byway</a></p>');
}
