/**
 * Whether the providers still price byway's models as its price table records them: the weekly CI run's report
 * (verify.yml), at the owner's answer of 2026-10-21 23:15 on keeping the price table current, "Weekly report + monthly
 * re-read + date in the app (Recommended)": "A weekly CI report (reporting only) compares OpenRouter's price API
 * exactly and checks the other providers' pages for changed figures; Claude re-reads every page monthly and at once
 * when the report flags a change; Settings and the estimate show when prices were last checked, with a notice after
 * about 45 days. Plus the planned ledger-vs-dashboard check after real runs." The owner added on 2026-10-22 that the
 * re-read is for any model with web access, from any provider, not Claude alone; AGENTS.md says how, and a person can
 * do it too.
 *
 * It reports and never fails, as scripts/playwright-pin.ts does: it prints what it found, adds it to the run's summary,
 * and marks a flagged figure, or a re-read that is due, with a warning on the run's page; a page it cannot read is said
 * in one line, and it exits 0 whatever happens. It reads no key. What it checks, against packages/gateway/src/prices.ts:
 * - OpenRouter's model list (openrouter.ai/api/v1/models): each pinned model's pricing.prompt and pricing.completion,
 *   per token, compared exactly, as decimals, with the row's rates per 1M tokens.
 * - Every other row's page (Anthropic's, OpenAI's, Google's and fal's): each figure the row records must be on the
 *   page, as a dollar amount shortly after a name the page gives the model; OpenAI's long-context rates, which the page
 *   draws from its own script, in the page's scripts; and the sentences byway's reading of a page rests on (Anthropic's
 *   standard pricing across 1M tokens, the two thresholds). A figure not found means the page changed or moved it, and
 *   that page is read again (AGENTS.md); it cannot see a new rate the table does not record.
 * - How long ago the last full re-read was (PRICES_CHECKED): the monthly re-read is due from 30 days after it (Claude's
 *   reading of "monthly").
 *
 * Run with plain Node, which strips this file's types and those of prices.ts: `node scripts/price-report.ts`. prices.ts
 * imports only types, so this runs before the dependencies are installed.
 */
import { appendFileSync } from 'node:fs';
import { PRICES, PRICES_CHECKED, priceFor, type PriceRow } from '../packages/gateway/src/prices.ts';

type Provider = PriceRow['provider'];

/** OpenRouter's model list: its models and their prices per token, as decimal strings. */
export const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models';

/** A page byway reads prices from: where it is, how its text is read, and what of it the report checks. */
export interface PricePage {
  /** The provider, as the report names it. */
  label: string;
  url: string;
  /** 'markdown': the page as served (Anthropic's .md); 'html': its text with the markup taken out. */
  form: 'markdown' | 'html';
  /** The rows priced on this page. */
  rows: readonly PriceRow[];
  /** The name the page gives each row's model, where it is not the model's id. */
  names?: Readonly<Record<string, string>>;
  /** Sentences the page must still carry, in its text or its attributes. */
  sentences?: readonly string[];
  /** The long-context rates are in the page's own scripts (OpenAI's Long table), not in its text. */
  longInScripts?: boolean;
}

/** The figures of a row that a page states, by what they are. Zero is not stated (fal's token rates). */
function figures(row: PriceRow, withLong: boolean): { what: string; usd: number }[] {
  const all: [string, number | undefined][] = [
    ['input', row.inputPerMTok],
    ['output', row.outputPerMTok],
    ['cache read', row.cacheReadPerMTok],
    ['cache write', row.cacheWritePerMTok],
    ['per image', row.perImageUsd],
    ['per second', row.perSecondUsd],
  ];
  if (withLong && row.longContext) {
    all.push(['long-context input', row.longContext.inputPerMTok], ['long-context output', row.longContext.outputPerMTok], ['long-context cache read', row.longContext.cacheReadPerMTok], ['long-context cache write', row.longContext.cacheWritePerMTok]);
  }
  return all.filter((f): f is [string, number] => f[1] !== undefined && f[1] > 0).map(([what, usd]) => ({ what, usd }));
}

const rowsOf = (provider: Provider) => PRICES.filter((r) => r.provider === provider);

/**
 * The pages, built from the price table, so a row added to prices.ts is checked on its provider's page. fal has a page
 * per model, each naming its price in one sentence.
 */
export function pricePages(): PricePage[] {
  const fal = rowsOf('fal').map((row): PricePage => ({
    label: `fal (${row.model})`,
    url: `https://fal.ai/models/${row.model}`,
    form: 'html',
    rows: [row],
    names: { [row.model]: FAL_PRICE_SENTENCE[row.model] ?? 'will cost' },
  }));
  return [
    {
      label: 'Anthropic',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing.md',
      form: 'markdown',
      rows: rowsOf('anthropic'),
      names: { 'claude-fable-5-1': 'Claude Fable 5.1', 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-opus-5': 'Claude Opus 5', 'claude-opus-4-8': 'Claude Opus 4.8' },
      sentences: ['include the full 1M token context window at standard pricing'],
    },
    { label: 'OpenAI', url: 'https://developers.openai.com/api/docs/pricing', form: 'html', rows: rowsOf('openai'), sentences: ['Long: >272K input tokens'], longInScripts: true },
    // In English: asked by Node's fetch with no hl=en, Google answered with its page in Russian (2026-10-22).
    { label: 'Google', url: 'https://ai.google.dev/gemini-api/docs/pricing?hl=en', form: 'html', rows: rowsOf('google'), sentences: ['prompts > 200k tokens'] },
    ...fal,
  ];
}

/** Where each fal page states its price: the words just before the figure. */
const FAL_PRICE_SENTENCE: Readonly<Record<string, string>> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'For every additional second',
  'fal-ai/kling-video/v3/pro/image-to-video': 'For every second of video you generated',
  'fal-ai/ffmpeg-api/extract-frame': 'Your request will cost',
};

/** How far after a model's name its figures are looked for, in characters of the page's text. */
const WINDOW = 700;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
const decode = (text: string) => text.replace(/&(#x?[\da-f]+|\w+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all);

/**
 * A page's text: an HTML page without its scripts, styles and tags; a Markdown page with its links' targets dropped. A
 * tag starts with a letter, so text such as Google's "prompts <= 200k tokens" is kept as text.
 */
export function pageText(body: string, form: PricePage['form']): string {
  if (form === 'markdown') return body.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ');
  return decode(text).replace(/\s+/g, ' ');
}

/** Every dollar amount in a text, as a number: "$12.50", "$ 0.0002", "$1,000". */
function dollars(text: string): number[] {
  return [...text.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?|\.\d+)/g)].map((m) => Number(m[1]!.replace(/,/g, '')));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A name as a whole word: not inside a longer name ("Claude Opus 5" in "Claude Opus 5.5", an id with a suffix). */
const nameRe = (name: string) => new RegExp(`(?<![\\w.-])${escapeRe(name)}(?![\\w-]|\\.\\d)`, 'g');

/**
 * The figures of a row the page's text does not show: for some place the page names the model, every figure must be
 * among the dollar amounts in the stretch after it (to the end of the line in Markdown, else WINDOW characters, cut at
 * the next name of another model on the page). Returns the figures missing at the place that shows the most of them.
 */
export function missingFigures(text: string, name: string, wanted: readonly { what: string; usd: number }[], otherNames: readonly string[], form: PricePage['form']): { what: string; usd: number }[] {
  let best = [...wanted];
  for (const m of text.matchAll(nameRe(name))) {
    const from = m.index + m[0].length;
    let to = form === 'markdown' ? (text.indexOf('\n', from) < 0 ? text.length : text.indexOf('\n', from)) : Math.min(text.length, from + WINDOW);
    for (const other of otherNames) {
      const next = nameRe(other);
      next.lastIndex = from;
      const at = next.exec(text);
      if (at && at.index < to) to = at.index;
    }
    const shown = dollars(text.slice(from, to));
    const missing = wanted.filter((f) => !shown.includes(f.usd));
    if (missing.length < best.length) best = missing;
    if (best.length === 0) break;
  }
  return best;
}

/** The script files a page loads from its own site (Astro's islands name them in component-url). */
export function pageScripts(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const urls = [...html.matchAll(/component-url="([^"]+\.js[^"]*)"/g)].map((m) => new URL(decode(m[1]!), origin));
  return [...new Set(urls.filter((u) => u.origin === origin).map((u) => u.href))];
}

/**
 * Whether a script states a row's long-context rates: an object literal for the model, `"<model>":{input:20,output:75,
 * cachedInput:2,cacheWrite:25}` as OpenAI's pricing script writes its Long table, whose numbers equal the tier's.
 */
export function scriptStatesTier(script: string, row: PriceRow): boolean {
  const tier = row.longContext;
  if (!tier) return true;
  for (const m of script.matchAll(new RegExp(`"${escapeRe(row.model)}":\\{([^{}]*)\\}`, 'g'))) {
    const v = Object.fromEntries([...m[1]!.matchAll(/(\w+):(-?(?:\d+\.?\d*|\.\d+))/g)].map((p) => [p[1]!, Number(p[2])]));
    if (
      v.input === tier.inputPerMTok &&
      v.output === tier.outputPerMTok &&
      (tier.cacheReadPerMTok === undefined || v.cachedInput === tier.cacheReadPerMTok) &&
      (tier.cacheWritePerMTok === undefined || v.cacheWrite === tier.cacheWritePerMTok)
    ) {
      return true;
    }
  }
  return false;
}

/** A decimal's digits and exponent, so two spellings of one number compare equal with no rounding: "0.000004" is 4e-6. */
export function decimal(text: string): { digits: string; exp: number } | undefined {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!m || (m[1] === '' && !m[2])) return undefined;
  let digits = `${m[1]}${m[2] ?? ''}`.replace(/^0+/, '');
  let exp = -(m[2]?.length ?? 0);
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    exp++;
  }
  return digits === '' ? { digits: '0', exp: 0 } : { digits, exp };
}

/** Whether a per-token price as OpenRouter gives it (a decimal string) is exactly a rate per 1M tokens. */
export function samePerToken(perToken: unknown, perMTok: number): boolean {
  const theirs = typeof perToken === 'string' ? decimal(perToken) : undefined;
  const ours = decimal(String(perMTok));
  if (!theirs || !ours) return false;
  return theirs.digits === ours.digits && (theirs.digits === '0' || theirs.exp === ours.exp - 6);
}

/** What OpenRouter's model list says of a model: its id and prices per token. */
export interface OpenRouterModels {
  data?: { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }[];
}

/** The lines on OpenRouter's pinned models: a match for each, or what differs. */
export function openRouterReport(models: OpenRouterModels, rows: readonly PriceRow[]): { flagged: boolean; lines: string[] } {
  const listed = new Map((models.data ?? []).filter((m) => typeof m.id === 'string').map((m) => [m.id as string, m.pricing ?? {}]));
  const lines: string[] = [];
  for (const row of rows) {
    const pricing = listed.get(row.model);
    if (!pricing) {
      lines.push(`OpenRouter ${row.model}: the model list no longer has it.`);
      continue;
    }
    for (const [what, theirs, ours] of [
      ['prompt', pricing.prompt, row.inputPerMTok],
      ['completion', pricing.completion, row.outputPerMTok],
    ] as const) {
      if (!samePerToken(theirs, ours)) lines.push(`OpenRouter ${row.model}: the model list gives ${what} ${JSON.stringify(theirs)} per token; byway records $${ours} per 1M tokens.`);
    }
  }
  if (lines.length === 0) return { flagged: false, lines: [`OpenRouter: the prompt and completion prices of ${rows.map((r) => r.model).join(', ')} match its model list exactly.`] };
  return { flagged: true, lines };
}

const usd = (n: number) => `$${n}`;

/** The lines on one page: every figure found, or each row's missing figures and each missing sentence. */
export function pageReport(page: PricePage, body: string, scripts: readonly string[] = []): { flagged: boolean; lines: string[] } {
  const text = pageText(body, page.form);
  const attributes = page.form === 'html' ? decode(body) : body;
  const nameOf = (row: PriceRow) => page.names?.[row.model] ?? row.model;
  const names = [...new Set(page.rows.map(nameOf))];
  const lines: string[] = [];
  for (const row of page.rows) {
    const wanted = figures(row, !page.longInScripts);
    const missing = missingFigures(text, nameOf(row), wanted, names.filter((n) => n !== nameOf(row)), page.form);
    const dated = row.from ? ` (the row from ${row.from})` : '';
    if (missing.length > 0) lines.push(`${page.label} ${row.model}${dated}: not found after its name on the page: ${missing.map((f) => `${f.what} ${usd(f.usd)}`).join(', ')}.`);
    if (page.longInScripts && row.longContext && !scripts.some((s) => scriptStatesTier(s, row))) {
      const t = row.longContext;
      lines.push(`${page.label} ${row.model}: the page's scripts do not give its long-context rates as byway records them (input ${usd(t.inputPerMTok)}, output ${usd(t.outputPerMTok)}).`);
    }
  }
  for (const sentence of page.sentences ?? []) if (!text.includes(sentence) && !attributes.includes(sentence)) lines.push(`${page.label}: the page no longer says "${sentence}".`);
  if (lines.length === 0) return { flagged: false, lines: [`${page.label}: every figure byway records was found on ${page.url}.`] };
  return { flagged: true, lines };
}

const DAY_MS = 86_400_000;
/** From this many days after the last full re-read, the report says the monthly re-read is due. */
export const REREAD_DUE_DAYS = 30;

/** The line on the last full re-read, and whether the monthly one is due. */
export function rereadLine(checked: string, now: Date): { due: boolean; line: string } {
  const days = Math.floor((now.getTime() - Date.parse(`${checked}T00:00:00.000Z`)) / DAY_MS);
  const ago = `${days} ${days === 1 ? 'day' : 'days'} ago`;
  if (!(days >= REREAD_DUE_DAYS)) return { due: false, line: `byway's price table was last read in full on ${checked}, ${ago}.` };
  return { due: true, line: `byway's price table was last read in full on ${checked}, ${ago}: the monthly re-read the owner chose on 2026-10-21 is due.` };
}

export interface PriceReportOptions {
  fetch?: (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  now?: () => Date;
  /** Where the lines go: the job's log, by default. */
  print?: (line: string) => void;
  /** The run's summary file (GITHUB_STEP_SUMMARY on GitHub); none locally. */
  summary?: string;
}

const FLAGGED_NEXT =
  'The agent running the next session (any model with web access, or a person) reads each flagged page again and updates prices.ts, as AGENTS.md says; until then estimates and recorded costs use the table as it is.';

/** The report, printed: it never throws and never sets a failing exit code. */
export async function report(opts: PriceReportOptions = {}): Promise<void> {
  const print = opts.print ?? ((line: string) => console.log(line));
  const get = async (url: string): Promise<string> => {
    // The pages in English, which the figures and sentences are read in.
    const res = await (opts.fetch ?? fetch)(url, { signal: AbortSignal.timeout(60_000), headers: { 'accept-language': 'en-US,en;q=0.9' } });
    if (!res.ok) throw new Error(`it answered ${res.status}`);
    return res.text();
  };
  const said = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const now = (opts.now ?? (() => new Date()))();
  const sections: { flagged: boolean; lines: string[] }[] = [];
  let due = false;
  try {
    const reread = rereadLine(PRICES_CHECKED, now);
    due = reread.due;
    sections.push({ flagged: false, lines: [reread.line] });
    const openrouter = rowsOf('openrouter').filter((r) => priceFor(PRICES, r.provider, r.model, now) === r);
    const checks: Promise<{ flagged: boolean; lines: string[] }>[] = [
      (async () => {
        let models: OpenRouterModels;
        try {
          // An answer that is not JSON is as unreadable as no answer.
          models = JSON.parse(await get(OPENROUTER_MODELS)) as OpenRouterModels;
        } catch (err) {
          return { flagged: false, lines: [`OpenRouter: its model list could not be read (${said(err)}), so this run says nothing of it.`] };
        }
        return openRouterReport(models, openrouter);
      })(),
      ...pricePages().map(async (page) => {
        let body: string;
        try {
          body = await get(page.url);
        } catch (err) {
          return { flagged: false, lines: [`${page.label}: ${page.url} could not be read (${said(err)}), so this run says nothing of it.`] };
        }
        // A script that cannot be read is left out: the rates it would show are then reported as not found.
        const scripts = page.longInScripts ? (await Promise.all(pageScripts(body, page.url).map((u) => get(u).catch(() => '')))).filter((s) => s !== '') : [];
        return pageReport(page, body, scripts);
      }),
    ];
    for (const section of await Promise.all(checks)) sections.push(section);
  } catch (err) {
    sections.push({ flagged: false, lines: [`The price report could not be made (${said(err)}), so this run reports nothing on prices.`] });
  }
  const flagged = sections.some((s) => s.flagged);
  const lines = sections.flatMap((s) => s.lines);
  if (flagged) lines.push(FLAGGED_NEXT);
  for (const line of lines) print(line);
  // A warning on the run's page, which blocks nothing.
  if (flagged || due) {
    const warned = sections.flatMap((s, i) => (s.flagged || (i === 0 && due) ? s.lines : []));
    if (flagged) warned.push(FLAGGED_NEXT);
    print(`::warning title=Prices::${warned.join(' ').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  }
  if (opts.summary) {
    try {
      appendFileSync(opts.summary, `### Prices\n\n${lines.join('\n\n')}\n`);
    } catch {
      // The summary is a convenience; the log has the lines.
    }
  }
}

if (import.meta.main) await report({ ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}) });
