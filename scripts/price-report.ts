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
 * and marks a flagged figure, a page it could not read (said in one line: it was not checked, and calls for the re-read
 * as a flag does), or a re-read that is due, with a warning on the run's page; it exits 0 whatever happens. It reads
 * no key, and nothing it quotes from a provider's answer can make a workflow command of a line (plain). What it
 * checks, against packages/gateway/src/prices.ts:
 * - OpenRouter's model list (openrouter.ai/api/v1/models): each pinned model's pricing.prompt and pricing.completion,
 *   per token, compared exactly, as decimals, with the rates per 1M tokens of the row in force on the day of the run.
 * - Every other row's page (Anthropic's, OpenAI's, Google's and fal's), for each row in force on the day of the run or
 *   still to come, not one a later row has replaced: each figure the row records must be on the page, as a dollar
 *   amount shortly after the first place the page names the model with a price (on OpenAI's page, its Standard row,
 *   before its Batch, Fast and Ultrafast rows); OpenAI's long-context rates, which the page draws from its own script,
 *   in that script's standard map; each long-context tier's threshold, beside the row's figures on Google's page and on
 *   the switch above the Flagship models' table on OpenAI's; a row with no tier that the page now prices by prompt
 *   length; the figures byway's reading of a page rests on without recording them (Kling 2.5's price for its first 5
 *   seconds, 5 times its rate per second); and the sentence it rests on, read whole (Anthropic's standard pricing
 *   across 1M tokens, with its list of exceptions). A figure not found means the page changed or moved it, and every
 *   page is then read again (AGENTS.md); it cannot see a new rate the table does not record.
 * - How long ago the last full re-read was (PRICES_CHECKED): the monthly re-read is due from 30 days after it (Claude's
 *   reading of "monthly").
 *
 * Run with plain Node, which strips this file's types and those of prices.ts: `node scripts/price-report.ts`. prices.ts
 * imports only types, so this runs before the dependencies are installed.
 */
import { appendFileSync } from 'node:fs';
import { PRICES, PRICES_CHECKED, priceFor, roundUsd, type LongContextTier, type PriceRow } from '../packages/gateway/src/prices.ts';

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
  /** Sentences the page must still carry, whole, in its text or its attributes. */
  sentences?: readonly string[];
  /** The long-context rates are in the page's own scripts (OpenAI's Long table), not in its text. */
  longInScripts?: boolean;
  /**
   * Where the page gives a long-context tier's threshold, in words built from the row's (`aboveInputTokens`), so a
   * threshold that changes is flagged as a changed figure is (PRICES-3). Without `heading`, the words must be in the
   * stretch where the row's figures are read (Google's "$4.00, prompts > 200k tokens"). With it, they must be in the
   * page's markup between that heading and the first place after it that names the model: OpenAI's Flagship models
   * table, whose context-length switch is labelled "Long: >272K input tokens", while its Cyber models table further
   * down has a switch of its own, which says nothing of byway's rows.
   */
  tierWords?: { words: (tier: LongContextTier) => string; heading?: string };
  /**
   * Words the page puts in a model's stretch when it prices the model by prompt length: on a row with no long-context
   * tier they are flagged, since its row charges a long prompt at the short rates (PRICES-3). Anthropic's "(for
   * prompts", as in "Claude Haiku 5.5 (for prompts over 100,000 tokens)"; Google's "prompts >".
   */
  byLength?: string;
  /**
   * Figures the page gives that the table does not record but its reading of the page rests on, each built from the row
   * and looked for after its own words as a row's figures are after the model's name: Kling 2.5's price for its first
   * 5 seconds, which byway's flat rate per second assumes is 5 times that rate (PRICES-2).
   */
  derived?: readonly { after: string; what: string; usd: number }[];
  /**
   * The page names its models by id (OpenAI's, Google's): a row's stretch also ends at the next id on the page, of a
   * model byway prices or not, so a section of a model with no row, within WINDOW characters, is never read as the
   * row's (its tier words could hide a changed threshold, or flag a row with no tier; B-032).
   */
  byIds?: boolean;
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

/** Whether a row is the one in force for its model on a day. */
const inForce = (row: PriceRow, now: Date) => priceFor(PRICES, row.provider, row.model, now) === row;

/**
 * A provider's rows to check on the day of a run: each row in force that day, and each row still to come, a dated row
 * before its day (Gemini 3.8 Flash's price from 2027-01-01, which Google's page already gives). A row a later one has
 * replaced is left out. It stays in the table, right for calls made before, but once its day has passed its provider
 * takes its figures off the page, and it would be flagged at every weekly run (PRICES-4).
 */
const rowsOf = (provider: Provider, now: Date) => {
  const today = now.toISOString().slice(0, 10);
  return PRICES.filter((r) => r.provider === provider && ((r.from !== undefined && r.from > today) || inForce(r, now)));
};

/**
 * The pages to check on the day of a run, built from the price table, so a row added to prices.ts is checked on its
 * provider's page. fal has a page per model, each naming its price in one sentence.
 */
export function pricePages(now: Date): PricePage[] {
  const fal = rowsOf('fal', now).map((row): PricePage => {
    const first = FAL_FIRST_SECONDS[row.model];
    return {
      label: `fal (${row.model})`,
      url: `https://fal.ai/models/${row.model}`,
      form: 'html',
      rows: [row],
      names: { [row.model]: FAL_PRICE_SENTENCE[row.model] ?? 'will cost' },
      ...(first !== undefined && row.perSecondUsd !== undefined
        ? { derived: [{ after: `For ${first}s video your request will cost`, what: `${first} seconds at the ${usd(row.perSecondUsd)} per second byway records`, usd: roundUsd(first * row.perSecondUsd) }] }
        : {}),
    };
  });
  return [
    {
      label: 'Anthropic',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing.md',
      form: 'markdown',
      rows: rowsOf('anthropic', now),
      names: { 'claude-fable-5-1': 'Claude Fable 5.1', 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-opus-5': 'Claude Opus 5', 'claude-opus-4-8': 'Claude Opus 4.8' },
      // Whole, with its list of exceptions: a model added to it would no longer be priced the same at every length.
      sentences: ['Claude 4.6 and later models (except Claude Haiku 5.5) and Claude Mythos Preview include the full 1M token context window at standard pricing'],
      byLength: '(for prompts',
    },
    {
      label: 'OpenAI',
      url: 'https://developers.openai.com/api/docs/pricing',
      form: 'html',
      rows: rowsOf('openai', now),
      longInScripts: true,
      byIds: true,
      tierWords: { words: (t) => `Long: >${t.aboveInputTokens / 1000}K input tokens`, heading: 'Flagship models' },
    },
    // In English: asked by Node's fetch with no hl=en, Google answered with its page in Russian (2026-10-22).
    {
      label: 'Google',
      url: 'https://ai.google.dev/gemini-api/docs/pricing?hl=en',
      form: 'html',
      rows: rowsOf('google', now),
      byIds: true,
      tierWords: { words: (t) => `prompts > ${t.aboveInputTokens / 1000}k tokens` },
      byLength: 'prompts >',
    },
    ...fal,
  ];
}

/** Where each fal page states its price: the words just before the figure. */
const FAL_PRICE_SENTENCE: Readonly<Record<string, string>> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'For every additional second',
  'fal-ai/kling-video/v3/pro/image-to-video': 'For every second of video you generated',
  'fal-ai/ffmpeg-api/extract-frame': 'Your request will cost',
};

/**
 * The seconds a fal page prices first, before its price for each further second: Kling 2.5's page reads "For 5s video
 * your request will cost $0.35. For every additional second you will be charged $0.07." byway records only the $0.07
 * and charges it for every second of the 5 s or 10 s clips the model makes (prices.ts), which holds only while the
 * first 5 seconds cost 5 times it; a base that moves alone would be charged wrongly on every clip.
 */
const FAL_FIRST_SECONDS: Readonly<Record<string, number>> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 5,
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
 * Any model id, as OpenAI's and Google's pages name them: lowercase words joined by hyphens, one of them starting with a
 * digit ("gpt-6-astra", "gemini-3.8-flash", "imagen-4.0-generate").
 * shortcut: an id with no hyphen before a digit (OpenAI's "o3") does not end a stretch; add its shape if a page lists one.
 */
const MODEL_ID = /(?<![\w.-])[a-z][a-z0-9]*(?:-[a-z0-9.]+)*?-\d[\w.-]*/g;

/**
 * Where a page prices a model: the stretch after the first place the page names the model with a dollar amount after
 * it, or undefined when no place does. A stretch runs to the end of the line in Markdown, else WINDOW characters, and
 * is cut at the next name of any model on the page, the same model's included, and on a page that names its models by
 * id at the next id of any model, priced or not (B-032). Only the first such place is read
 * because a page that prices a model several ways names it again in each table, in an order that puts the plain price
 * first: OpenAI's page has the model's Standard row, then its Batch, Fast and Ultrafast rows at half, twice and six
 * times it. Read at any place instead, a model whose every price doubled would still show byway's figures in its Batch
 * row, and one whose every price halved in its Fast row (PRICES-1). A page that names the model first in a sentence
 * with some other price is flagged, which a re-read clears.
 */
export function priceStretch(text: string, name: string, otherNames: readonly string[], form: PricePage['form'], byIds = false): string | undefined {
  for (const m of text.matchAll(nameRe(name))) {
    const from = m.index + m[0].length;
    let to = form === 'markdown' ? (text.indexOf('\n', from) < 0 ? text.length : text.indexOf('\n', from)) : Math.min(text.length, from + WINDOW);
    for (const other of [...otherNames, name]) {
      const next = nameRe(other);
      next.lastIndex = from;
      const at = next.exec(text);
      if (at && at.index < to) to = at.index;
    }
    // An id before the first price is the section's own (Google's "gemini-3.1-pro-preview and
    // gemini-3.1-pro-preview-customtools"); one after it starts the next section.
    const priced = text.slice(from, to).search(/\$/);
    if (byIds && priced >= 0) {
      const next = new RegExp(MODEL_ID);
      next.lastIndex = from + priced;
      const at = next.exec(text);
      if (at && at.index < to) to = at.index;
    }
    const stretch = text.slice(from, to);
    if (dollars(stretch).length > 0) return stretch;
  }
  return undefined;
}

/** The figures of a row the page's text does not show: every figure must be among the dollar amounts of its stretch. */
export function missingFigures(text: string, name: string, wanted: readonly { what: string; usd: number }[], otherNames: readonly string[], form: PricePage['form']): { what: string; usd: number }[] {
  const stretch = priceStretch(text, name, otherNames, form);
  const shown = stretch === undefined ? [] : dollars(stretch);
  return wanted.filter((f) => !shown.includes(f.usd));
}

/**
 * Whether the page's markup gives a tier's threshold words between a heading and the first place after it that names
 * the model: the switch above the model's table, not one above another table.
 */
function saidAbove(markup: string, heading: string, name: string, words: string): boolean {
  const start = markup.indexOf(heading);
  if (start < 0) return false;
  const next = nameRe(name);
  next.lastIndex = start + heading.length;
  const at = next.exec(markup);
  return at !== null && markup.slice(start, at.index).includes(words);
}

/** The script files a page loads from its own site (Astro's islands name them in component-url). */
export function pageScripts(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const urls = [...html.matchAll(/component-url="([^"]+\.js[^"]*)"/g)].map((m) => new URL(decode(m[1]!), origin));
  return [...new Set(urls.filter((u) => u.origin === origin).map((u) => u.href))];
}

/**
 * The bodies of a script's `<key>:{...}` object literals, each to its matching brace: OpenAI's pricing script writes
 * its Long table as `var m={ultrafast:{...},standard:{...},fast:{...},batch:{...},flex:{...}}`. The maps hold numbers
 * and short strings, with no braces in them, so the braces are counted as they come.
 */
function scriptObjects(script: string, key: string): string[] {
  const bodies: string[] = [];
  for (const m of script.matchAll(new RegExp(`(?<![\\w$])${escapeRe(key)}:\\{`, 'g'))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < script.length; i++) {
      if (script[i] === '{') depth++;
      else if (script[i] === '}' && --depth === 0) {
        bodies.push(script.slice(open + 1, i));
        break;
      }
    }
  }
  return bodies;
}

/**
 * Whether a script states a row's long-context rates: an object literal for the model in the script's `standard` map,
 * `"<model>":{input:20,output:75,cachedInput:2,cacheWrite:25}` as OpenAI's pricing script writes its Long table, whose
 * numbers equal the tier's. Only the standard map, as the rows are Standard processing: the script holds the model in
 * its ultrafast, fast, batch and flex maps too, at the page's ratios to Standard, so a doubled or halved price would
 * still be found in one of them (PRICES-1).
 */
export function scriptStatesTier(script: string, row: PriceRow): boolean {
  const tier = row.longContext;
  if (!tier) return true;
  const literal = new RegExp(`"${escapeRe(row.model)}":\\{([^{}]*)\\}`, 'g');
  for (const m of scriptObjects(script, 'standard').flatMap((body) => [...body.matchAll(literal)])) {
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

/**
 * The lines on one page: every figure found, or each row's missing figures, its tier's threshold where the page no
 * longer gives it, a tier the page now gives a row that has none, and each missing figure or sentence the reading of
 * the page rests on.
 */
export function pageReport(page: PricePage, body: string, scripts: readonly string[] = []): { flagged: boolean; lines: string[] } {
  const text = pageText(body, page.form);
  const attributes = page.form === 'html' ? decode(body) : body;
  const nameOf = (row: PriceRow) => page.names?.[row.model] ?? row.model;
  const names = [...new Set(page.rows.map(nameOf))];
  const lines: string[] = [];
  for (const row of page.rows) {
    const name = nameOf(row);
    const stretch = priceStretch(text, name, names.filter((n) => n !== name), page.form, page.byIds);
    const shown = stretch === undefined ? [] : dollars(stretch);
    const missing = figures(row, !page.longInScripts).filter((f) => !shown.includes(f.usd));
    const dated = row.from ? ` (the row from ${row.from})` : '';
    if (missing.length > 0) lines.push(`${page.label} ${row.model}${dated}: not found after its name on the page: ${missing.map((f) => `${f.what} ${usd(f.usd)}`).join(', ')}.`);
    if (row.longContext && page.tierWords) {
      const { heading } = page.tierWords;
      const words = page.tierWords.words(row.longContext);
      const said = heading === undefined ? (stretch ?? '').includes(words) : saidAbove(attributes, heading, name, words);
      if (!said) lines.push(`${page.label} ${row.model}${dated}: the page no longer gives its long-context tier as "${words}" ${heading === undefined ? 'after its name' : `between "${heading}" and its name`}.`);
    }
    if (!row.longContext && page.byLength && (stretch ?? '').includes(page.byLength)) lines.push(`${page.label} ${row.model}${dated}: the page prices it by prompt length after its name ("${page.byLength}"), and byway's row has no long-context tier.`);
    if (page.longInScripts && row.longContext && !scripts.some((s) => scriptStatesTier(s, row))) {
      const t = row.longContext;
      lines.push(`${page.label} ${row.model}: the page's scripts do not give its long-context rates as byway records them (input ${usd(t.inputPerMTok)}, output ${usd(t.outputPerMTok)}).`);
    }
  }
  for (const d of page.derived ?? []) if (missingFigures(text, d.after, [d], [], page.form).length > 0) lines.push(`${page.label}: not found after "${d.after}": ${d.what}, ${usd(d.usd)}.`);
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

/**
 * What follows a flag: a full re-read, every page and not the flagged one alone. The option the owner chose on
 * 2026-10-22 at 18:54, "Claude checks at each session's start (Recommended)", reads "when a session opens and the
 * last-checked date is 30 days old, or the weekly CI report has flagged a change, Claude re-reads every page first",
 * and the owner's note of 18:55 makes the re-read any capable agent's or a person's (AGENTS.md). A full re-read is
 * also the only one that moves PRICES_CHECKED (PRICES-6).
 */
const FLAGGED_NEXT =
  'The agent running the next session (any model with web access, or a person) reads every page again and updates prices.ts, as AGENTS.md says; until then estimates and recorded costs use the table as it is.';

/**
 * A line as the report prints it, with nothing in it that GitHub would read as a workflow command (SECURITY-2). The
 * report echoes some of what it is given: a parser's message quotes a stretch of an answer that is not JSON, raw
 * newlines and all, a failed fetch's message is quoted, and OpenRouter's prices are quoted as given. In a job's log a
 * line that starts with "::", after any spaces, is a command (::error::, ::add-mask::, ::stop-commands::), and so is
 * "##[" anywhere in a line, the runner's older form. So every control character, and the Unicode line and paragraph
 * separators, becomes a space, which keeps the line one line; a "::" that would start it becomes ": :"; and "##["
 * becomes "## [". What is left still reads as it was given. The weekly log is what each session's agent reads first
 * (AGENTS.md), and the summary on the run's page has the same lines.
 */
export function plain(line: string): string {
  return line
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/^(\s*):(?=:)/, '$1: ')
    .replace(/##\[/g, '## [');
}

/**
 * What the report says of one check: its lines, whether it flagged a figure, and whether it could not be made at all
 * (a page or list it could not read, or the report itself), which is warned of as a flag is, since a page that cannot
 * be read was not checked that week and a re-read is the only check it gets (PRICES-5).
 */
interface Section {
  flagged: boolean;
  unread?: boolean;
  lines: string[];
}

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
  const sections: Section[] = [];
  let due = false;
  try {
    const reread = rereadLine(PRICES_CHECKED, now);
    due = reread.due;
    sections.push({ flagged: false, lines: [reread.line] });
    // The model list gives today's prices only, so a row still to come is not compared with it.
    const openrouter = rowsOf('openrouter', now).filter((r) => inForce(r, now));
    const checks: Promise<Section>[] = [
      (async () => {
        let models: OpenRouterModels;
        try {
          // An answer that is not JSON is as unreadable as no answer.
          models = JSON.parse(await get(OPENROUTER_MODELS)) as OpenRouterModels;
        } catch (err) {
          return { flagged: false, unread: true, lines: [`OpenRouter: its model list could not be read (${said(err)}), so this run did not check it.`] };
        }
        return openRouterReport(models, openrouter);
      })(),
      ...pricePages(now).map(async (page) => {
        let body: string;
        try {
          body = await get(page.url);
        } catch (err) {
          return { flagged: false, unread: true, lines: [`${page.label}: ${page.url} could not be read (${said(err)}), so this run did not check it.`] };
        }
        // A script that cannot be read is left out: the rates it would show are then reported as not found.
        const scripts = page.longInScripts ? (await Promise.all(pageScripts(body, page.url).map((u) => get(u).catch(() => '')))).filter((s) => s !== '') : [];
        return pageReport(page, body, scripts);
      }),
    ];
    for (const section of await Promise.all(checks)) sections.push(section);
  } catch (err) {
    sections.push({ flagged: false, unread: true, lines: [`The price report could not be made (${said(err)}), so this run checked nothing on prices.`] });
  }
  // A page that could not be read calls for the re-read as a flag does.
  const flagged = sections.some((s) => s.flagged || s.unread);
  const lines = sections.flatMap((s) => s.lines).map(plain);
  if (flagged) lines.push(FLAGGED_NEXT);
  for (const line of lines) print(line);
  // A warning on the run's page, which blocks nothing.
  if (flagged || due) {
    const warned = sections.flatMap((s, i) => (s.flagged || s.unread || (i === 0 && due) ? s.lines.map(plain) : []));
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
