/**
 * Sample web pages for demo runs of Landing Page Studio. Four deliberately different directions stand in for
 * the four seeded drafts; the copy starts as typical AI copy so the cliché sweep and "Your words" have
 * something real to change.
 */

export type PageStyle = 'signal' | 'lantern' | 'herbarium' | 'index';
export const PAGE_STYLES: PageStyle[] = ['signal', 'lantern', 'herbarium', 'index'];

export const STYLE_NAMES: Record<PageStyle, string> = {
  signal: 'Signal',
  lantern: 'Lantern',
  herbarium: 'Herbarium',
  index: 'Index',
};

export interface PageCopy {
  headline: string;
  subhead: string;
  cta: string;
  points: [string, string][];
  closing: string;
}

export interface PageOptions {
  imagery?: boolean;
  /** After Trim: the last point and the closing band are gone. */
  trimmed?: boolean;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Typical first-draft AI copy, varied a little per direction. */
export function aiCopy(subject: string, style: PageStyle): PageCopy {
  const s = subject.charAt(0).toUpperCase() + subject.slice(1);
  const headlines: Record<PageStyle, string> = {
    signal: `Elevate your experience with ${subject}`,
    lantern: `Where ${subject} comes alive`,
    herbarium: `A field guide to ${subject}`,
    index: `${s}. Reimagined.`,
  };
  return {
    headline: headlines[style],
    subhead: 'Seamless, effortless and designed for the way you live today.',
    cta: 'Get started',
    points: [
      ['Crafted with care', 'Every detail considered, so you can focus on what matters most.'],
      ['Built for everyone', 'Whether you are just starting out or a seasoned pro, we have you covered.'],
      ['Trusted by many', 'Join a growing community that has already discovered the difference.'],
    ],
    closing: 'Ready to begin your journey?',
  };
}

/** The cliché sweep's swaps: plainer lines for the stock ones. */
export function sweptCopy(copy: PageCopy, subject: string): PageCopy {
  const s = subject.charAt(0).toUpperCase() + subject.slice(1);
  return {
    ...copy,
    headline: copy.headline.replace(/^Elevate your experience with .*$|^Where .* comes alive$|^.*\. Reimagined\.$/, `${s}`),
    subhead: 'What it is, who it is for, and what happens when you get in touch.',
    points: copy.points.map(([title, body], i) =>
      i === 0 ? ['What you get', 'Name the one thing people come for, in plain words.'] : i === 1 ? ['Who it is for', body] : [title, body],
    ),
  };
}

export const COPY_FIELDS = ['Headline', 'Subhead', 'Button', 'Point 1', 'Point 2', 'Point 3', 'Closing'] as const;

/** The copy as one editable text, one field per line, for the "Your words" editor. */
export function copyToText(copy: PageCopy, trimmed: boolean): string {
  const lines = [`Headline: ${copy.headline}`, `Subhead: ${copy.subhead}`, `Button: ${copy.cta}`];
  copy.points.slice(0, trimmed ? 2 : 3).forEach(([title, body], i) => lines.push(`Point ${i + 1}: ${title}. ${body}`));
  if (!trimmed) lines.push(`Closing: ${copy.closing}`);
  return lines.join('\n');
}

/** Reads the editor text back; fields the person deleted keep their previous text. */
export function textToCopy(text: string, previous: PageCopy): PageCopy {
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z ]+\d?)\s*:\s*(.+)$/.exec(line);
    if (m?.[1] && m[2]) fields.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  const point = (i: number): [string, string] => {
    const raw = fields.get(`point ${i + 1}`);
    const prev = previous.points[i] ?? ['', ''];
    if (!raw) return prev;
    const dot = raw.indexOf('. ');
    return dot > 0 ? [raw.slice(0, dot), raw.slice(dot + 2)] : [raw, ''];
  };
  return {
    headline: fields.get('headline') ?? previous.headline,
    subhead: fields.get('subhead') ?? previous.subhead,
    cta: fields.get('button') ?? previous.cta,
    points: [point(0), point(1), point(2)],
    closing: fields.get('closing') ?? previous.closing,
  };
}

const ART: Record<PageStyle, string> = {
  signal:
    '<svg viewBox="0 0 400 300" role="img" aria-label="Generated image: interlocking red and black planes"><rect width="400" height="300" fill="#f1f1ef"/><rect x="40" y="40" width="200" height="200" fill="#e0301e"/><rect x="160" y="100" width="200" height="160" fill="#111" opacity=".92"/><circle cx="300" cy="80" r="38" fill="#e0301e"/></svg>',
  lantern:
    '<svg viewBox="0 0 400 300" role="img" aria-label="Generated image: lanterns over a night street"><rect width="400" height="300" fill="#0f1733"/><g fill="#ffb648"><circle cx="90" cy="90" r="22" opacity=".9"/><circle cx="200" cy="70" r="16" opacity=".7"/><circle cx="310" cy="100" r="26" opacity=".85"/></g><path d="M0 240 Q200 190 400 240 V300 H0Z" fill="#1d2a55"/></svg>',
  herbarium:
    '<svg viewBox="0 0 400 300" role="img" aria-label="Generated image: pressed fern drawing"><rect width="400" height="300" fill="#e9efe2"/><path d="M200 280 C200 200 190 120 200 30" stroke="#2f5d3a" stroke-width="3" fill="none"/><g fill="#4f8a5b">' +
    Array.from({ length: 9 }, (_, i) => `<ellipse cx="${i % 2 ? 230 : 170}" cy="${60 + i * 24}" rx="34" ry="9" transform="rotate(${i % 2 ? -25 : 25} ${i % 2 ? 230 : 170} ${60 + i * 24})"/>`).join('') +
    '</g></svg>',
  index:
    '<svg viewBox="0 0 400 300" role="img" aria-label="Generated image: grid of numbered tiles"><rect width="400" height="300" fill="#fff"/>' +
    Array.from({ length: 12 }, (_, i) => `<rect x="${(i % 4) * 100 + 4}" y="${Math.floor(i / 4) * 100 + 4}" width="92" height="92" fill="${i === 5 ? '#ffe500' : '#fff'}" stroke="#000" stroke-width="3"/>`).join('') +
    '</svg>',
};

const STYLES: Record<PageStyle, string> = {
  signal: `body{margin:0;font:16px/1.5 "Helvetica Neue",Arial,sans-serif;color:#111;background:#fff}
header{display:flex;justify-content:space-between;padding:20px 48px;border-bottom:2px solid #111;font-weight:700}
.hero{display:grid;grid-template-columns:7fr 5fr;gap:48px;padding:72px 48px 56px;align-items:end}
h1{font-size:64px;line-height:1;letter-spacing:-.03em;margin:0 0 24px}
.sub{font-size:20px;max-width:30ch}
.cta{display:inline-block;margin-top:28px;background:#e0301e;color:#fff;padding:14px 24px;font-weight:700;text-decoration:none}
.points{display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid #111}
.points div{padding:28px 48px 40px;border-right:1px solid #111}.points div:last-child{border-right:0}
.points h2{font-size:15px;margin:0 0 8px}.closing{padding:56px 48px;background:#111;color:#fff;font-size:32px;font-weight:700}
svg{width:100%;height:auto;display:block}`,
  lantern: `body{margin:0;font:17px/1.6 Georgia,serif;color:#f6ecd9;background:#0f1733}
header{padding:24px 40px;font-style:italic;color:#ffb648}
.hero{text-align:center;padding:64px 40px 48px;max-width:760px;margin:0 auto}
h1{font-size:56px;line-height:1.05;margin:0 0 20px;font-weight:400}
.sub{color:#cdbfa6}.cta{display:inline-block;margin-top:24px;border:1px solid #ffb648;color:#ffb648;padding:12px 28px;border-radius:999px;text-decoration:none}
.points{display:flex;gap:24px;justify-content:center;padding:24px 40px 56px;flex-wrap:wrap}
.points div{max-width:220px}.points h2{font-size:18px;color:#ffb648;font-weight:400;margin:0 0 6px}
.closing{text-align:center;padding:48px;border-top:1px solid #2b3a6b;font-size:26px}
.art{max-width:520px;margin:32px auto 0}svg{width:100%;height:auto;display:block;border-radius:12px}`,
  herbarium: `body{margin:0;font:17px/1.65 "Iowan Old Style",Palatino,serif;color:#1f3324;background:#f4f7ef}
header{padding:24px 56px;border-bottom:1px solid #b9c9ae;letter-spacing:.02em}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:56px;padding:64px 56px;align-items:center}
h1{font-size:52px;line-height:1.1;margin:0 0 18px;font-weight:600}
.sub{font-style:italic;color:#3f5a45}.cta{display:inline-block;margin-top:24px;background:#2f5d3a;color:#f4f7ef;padding:12px 22px;text-decoration:none}
.points{padding:8px 56px 56px;columns:3;column-gap:40px}.points div{break-inside:avoid;margin-bottom:20px}
.points h2{font-size:17px;margin:0 0 4px}.closing{padding:40px 56px;background:#2f5d3a;color:#f4f7ef;font-size:24px}
svg{width:100%;height:auto;display:block}`,
  index: `body{margin:0;font:15px/1.5 "Courier New",monospace;color:#000;background:#fff}
header{display:flex;justify-content:space-between;padding:14px 24px;border-bottom:3px solid #000;text-transform:uppercase}
.hero{padding:48px 24px;border-bottom:3px solid #000}
h1{font-size:60px;line-height:1;margin:0 0 16px;text-transform:uppercase;background:#ffe500;display:inline}
.sub{margin-top:28px;max-width:52ch}.cta{display:inline-block;margin-top:20px;border:3px solid #000;padding:10px 18px;color:#000;text-decoration:none;font-weight:700}
.points div{display:grid;grid-template-columns:80px 1fr 2fr;border-bottom:3px solid #000;padding:16px 24px;gap:16px}
.points h2{font-size:15px;margin:0}.closing{padding:40px 24px;font-size:28px;text-transform:uppercase}
.art{max-width:420px;margin-top:28px}svg{width:100%;height:auto;display:block}`,
};

export function renderPage(style: PageStyle, brand: string, copy: PageCopy, opts: PageOptions = {}): string {
  const e = escapeHtml;
  const points = copy.points.slice(0, opts.trimmed ? 2 : 3);
  const pointHtml = points
    .map(([title, body], i) => (style === 'index' ? `<div><span>0${i + 1}</span><h2>${e(title)}</h2><p>${e(body)}</p></div>` : `<div><h2>${e(title)}</h2><p>${e(body)}</p></div>`))
    .join('');
  const art = opts.imagery ? `<div class="art">${ART[style]}</div>` : '';
  const heroText = `<div><h1>${e(copy.headline)}</h1><p class="sub">${e(copy.subhead)}</p><a class="cta" href="#">${e(copy.cta)}</a></div>`;
  const hero = style === 'signal' || style === 'herbarium' ? `<section class="hero">${heroText}${art || '<div></div>'}</section>` : `<section class="hero">${heroText}${art}</section>`;
  const closing = opts.trimmed ? '' : `<section class="closing">${e(copy.closing)}</section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(brand)}</title>
<style>${STYLES[style]}
@media (max-width:720px){.hero{grid-template-columns:1fr!important;padding:40px 20px!important}h1{font-size:40px!important}.points{grid-template-columns:1fr!important;columns:1!important}.points div{padding:20px!important;border-right:0!important}header{padding:16px 20px!important}}</style>
</head><body><header><span>${e(brand)}</span><span>Menu</span></header>
${hero}<section class="points">${pointHtml}</section>${closing}
</body></html>
`;
}

export const BRANDS: Record<PageStyle, string> = {
  signal: 'Northlight',
  lantern: 'Lamplight',
  herbarium: 'Fieldnote',
  index: 'Tessellate',
};
