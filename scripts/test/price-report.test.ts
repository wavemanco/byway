/**
 * The weekly run's price report (scripts/price-report.ts; PRICE-CADENCE, block 2), at the owner's answer of 2026-10-21
 * 23:15, "Weekly report + monthly re-read + date in the app (Recommended)": "A weekly CI report (reporting only)
 * compares OpenRouter's price API exactly and checks the other providers' pages for changed figures; Claude re-reads
 * every page monthly and at once when the report flags a change". What it says is tested here on pages shaped as the
 * providers' are (a Markdown table, HTML tables, a pricing script, fal's price sentences, OpenRouter's JSON), built from
 * the price table so they hold whatever it records, and never on the network. Its step in verify.yml is in ci.test.ts.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRICES, PRICES_CHECKED, type PriceRow } from '../../packages/gateway/src/prices.ts';
import { decimal, OPENROUTER_MODELS, openRouterReport, pageScripts, pricePages, REREAD_DUE_DAYS, report, rereadLine, samePerToken, type OpenRouterModels, type PriceReportOptions } from '../price-report.ts';

const row = (provider: PriceRow['provider'], model: string, from?: string) => PRICES.find((r) => r.provider === provider && r.model === model && r.from === from)!;
const $ = (n: number) => `$${n.toFixed(Math.max(2, (String(n).split('.')[1] ?? '').length))}`;
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const CHECKED = new Date(`${PRICES_CHECKED}T12:00:00.000Z`);

/** Anthropic's page as served in Markdown: one table row per model, base input, writes, hits and output. */
function anthropicPage(rows = PRICES.filter((r) => r.provider === 'anthropic'), names = pricePages()[0]!.names!): string {
  const lines = rows.map((r) => `| ${names[r.model]} | ${$(r.inputPerMTok)} / MTok | ${$(r.cacheWritePerMTok!)} / MTok | $99 / MTok | ${$(r.cacheReadPerMTok!)} / MTok | ${$(r.outputPerMTok)} / MTok |`);
  return ['## Model pricing', '', '| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |', ...lines, '', '### Long context pricing', '', 'Claude 4.6 and later models include the full [1M token context window](https://example.test/context) at standard pricing.', ''].join('\n');
}

/**
 * How OpenAI's page prices its other processing speeds against Standard, each in a table of its own that names every
 * model again: Batch at half, Fast at twice and Ultrafast at six times (the page as read on 2026-10-23). Its pricing
 * script has a map per speed at the same ratios, and a Flex map at Batch's. So when every price of a model doubles,
 * its Batch row shows the old figures, and when every price halves, its Fast row does.
 */
const OPENAI_SPEEDS = [
  ['Standard', 1],
  ['Batch', 0.5],
  ['Fast', 2],
  ['Ultrafast', 6],
] as const;
/** A figure times a factor, as the page would print it. */
const times = (n: number, k: number) => Math.round(n * k * 1_000_000) / 1_000_000;

/**
 * OpenAI's page: the Long tab's label, a table per processing speed in the page's order, Standard first, and the
 * island that loads its pricing script. `scale` multiplies every figure of a model, in every table, as a change of its
 * prices would.
 */
function openaiPage(rows = PRICES.filter((r) => r.provider === 'openai'), scale: Readonly<Record<string, number>> = {}): string {
  const cells = (r: PriceRow, k: number) => [r.inputPerMTok, r.outputPerMTok, r.cacheReadPerMTok, r.cacheWritePerMTok].map((n) => `<td>${n === undefined ? '-' : $(times(n, k * (scale[r.model] ?? 1)))}</td>`).join('');
  const tables = OPENAI_SPEEDS.map(([speed, k]) => `<h4>${speed}</h4><table>${rows.map((r) => `<tr><td>${r.model}</td>${cells(r, k)}</tr>`).join('')}</table><p>All models</p>`).join('');
  return `<html><body><astro-island component-url="/_astro/pricing.Ab1.js?dpl=x" props="{}"></astro-island><astro-island component-url="https://elsewhere.example/_astro/x.js"></astro-island><button aria-label="Short: ≤272K input tokens">Short</button><button aria-label="Long: &gt;272K input tokens">Long</button>${tables}<script>var hidden = "gpt-6-astra $1.00";</script></body></html>`;
}

/**
 * OpenAI's pricing script: the Long table as a map per processing speed, minified object literals in the script's
 * order (ultrafast, standard, fast, batch, flex), at the page's ratios to Standard; `scale` as for the page.
 */
function openaiScript(rows = PRICES.filter((r) => r.provider === 'openai' && r.longContext), scale: Readonly<Record<string, number>> = {}): string {
  const lit = (n: number) => String(n).replace(/^0\./, '.');
  const map = (k: number) =>
    rows
      .map((r) => {
        const t = r.longContext!;
        const at = (n: number) => lit(times(n, k * (scale[r.model] ?? 1)));
        // A cached-input rate the row does not record is still in the script (gpt-6-luna's).
        return `"${r.model}":{input:${at(t.inputPerMTok)},output:${at(t.outputPerMTok)},cachedInput:${at(t.cacheReadPerMTok ?? t.inputPerMTok / 10)},cacheWrite:${at(t.cacheWritePerMTok!)}}`;
      })
      .join(',');
  return `var m={ultrafast:{${map(6)}},standard:{${map(1)}},fast:{${map(2)}},batch:{${map(0.5)}},flex:{${map(0.5)}}};export{m as default}`;
}

/** Google's page: a section per model, each with its paid-tier input and output prices, tiers where it has them. */
function googlePage(rows = PRICES.filter((r) => r.provider === 'google')): string {
  const byModel = new Map<string, PriceRow[]>();
  for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  const price = (rs: PriceRow[], pick: (r: PriceRow) => number, long?: number) =>
    long !== undefined ? `${$(pick(rs[0]!))}, prompts &lt;= 200k tokens<br>${$(long)}, prompts &gt; 200k tokens` : rs.map((r) => `${$(pick(r))} ${r.from ? `starting ${r.from}` : 'now'}.`).join(' ');
  const sections = [...byModel].map(([model, rs]) => {
    const long = rs[0]!.longContext;
    const image = rs[0]!.perImageUsd !== undefined ? ` Equivalent to ${$(rs[0]!.perImageUsd)} per 1K image.` : '';
    return `<h3>${model}</h3><table><tr><td>Input price</td><td>Not available</td><td>${price(rs, (r) => r.inputPerMTok, long?.inputPerMTok)}</td></tr><tr><td>Output price</td><td>Not available</td><td>${price(rs, (r) => r.outputPerMTok, long?.outputPerMTok)}${image}</td></tr></table>`;
  });
  return `<html><body>${sections.join('')}</body></html>`;
}

/** A fal model page: its price in one sentence. */
const falPage = (r: PriceRow) => `<html><body><p>For 5s video your request will cost $0.35. For every additional second you will be charged ${$(r.perSecondUsd!)}.</p><p>For every second of video you generated, you will be charged ${$(r.perSecondUsd!)} (audio off).</p><p>Your request will cost ${$(r.perSecondUsd!)} per second.</p></body></html>`;

/** OpenRouter's model list: the pinned models at the rates byway records, per token, and another model. */
function openrouterModels(rows = PRICES.filter((r) => r.provider === 'openrouter')): OpenRouterModels {
  const perToken = (n: number) => (n / 1_000_000).toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  return { data: [...rows.map((r) => ({ id: r.model, pricing: { prompt: perToken(r.inputPerMTok), completion: perToken(r.outputPerMTok) } })), { id: 'other/model', pricing: { prompt: '0.000001', completion: '0.000002' } }] };
}

type Fetch = NonNullable<PriceReportOptions['fetch']>;
/** The pages as above, with any of them replaced or failing; and the requests made, with their headers. */
function web(over: Record<string, string | number | Error> = {}) {
  const asked: { url: string; headers: Record<string, string> }[] = [];
  const pages: Record<string, string> = {
    [OPENROUTER_MODELS]: JSON.stringify(openrouterModels()),
    'https://platform.claude.com/docs/en/about-claude/pricing.md': anthropicPage(),
    'https://developers.openai.com/api/docs/pricing': openaiPage(),
    'https://developers.openai.com/_astro/pricing.Ab1.js?dpl=x': openaiScript(),
    'https://ai.google.dev/gemini-api/docs/pricing?hl=en': googlePage(),
    ...Object.fromEntries(PRICES.filter((r) => r.provider === 'fal').map((r) => [`https://fal.ai/models/${r.model}`, falPage(r)])),
  };
  const fetch: Fetch = async (url, init) => {
    asked.push({ url, headers: init.headers });
    const given = url in over ? over[url] : pages[url];
    if (given instanceof Error) throw given;
    if (typeof given === 'number') return { ok: false, status: given, text: async () => '' };
    if (given === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => given };
  };
  return { fetch, asked };
}

async function run(fetch: Fetch, now = CHECKED) {
  const lines: string[] = [];
  const summary = path.join(mkdtempSync(path.join(tmpdir(), 'byway-prices-')), 'summary.md');
  writeFileSync(summary, '');
  const before = process.exitCode;
  await expect(report({ fetch, now: () => now, print: (l) => lines.push(l), summary })).resolves.toBeUndefined();
  expect(process.exitCode).toBe(before);
  return { lines, warnings: lines.filter((l) => l.startsWith('::warning')), summary: readFileSync(summary, 'utf8') };
}

const NEXT = 'The agent running the next session (any model with web access, or a person) reads each flagged page again and updates prices.ts, as AGENTS.md says; until then estimates and recorded costs use the table as it is.';

describe("the weekly run's price report (PRICE-CADENCE)", () => {
  it('checks every row a provider charges for: OpenRouter in its model list, every other row on its own page', () => {
    const onPages = pricePages().flatMap((p) => p.rows);
    const paid = PRICES.filter((r) => r.provider !== 'mock');
    expect([...onPages, ...PRICES.filter((r) => r.provider === 'openrouter')].sort((a, b) => paid.indexOf(a) - paid.indexOf(b))).toEqual(paid);
    for (const page of pricePages()) for (const r of page.rows) if (r.provider === 'anthropic') expect(page.names?.[r.model], r.model).toBeDefined();
    expect(OPENROUTER_MODELS).toBe('https://openrouter.ai/api/v1/models');
  });

  it('finds every figure on pages shaped as the providers write them, and flags nothing', async () => {
    const { fetch, asked } = web();
    const out = await run(fetch);
    expect(out.lines).toEqual([
      `byway's price table was last read in full on ${PRICES_CHECKED}, 0 days ago.`,
      'OpenRouter: the prompt and completion prices of anthropic/claude-fable-5.1, anthropic/claude-opus-5.5, anthropic/claude-sonnet-5.5 match its model list exactly.',
      'Anthropic: every figure byway records was found on https://platform.claude.com/docs/en/about-claude/pricing.md.',
      'OpenAI: every figure byway records was found on https://developers.openai.com/api/docs/pricing.',
      'Google: every figure byway records was found on https://ai.google.dev/gemini-api/docs/pricing?hl=en.',
      ...PRICES.filter((r) => r.provider === 'fal').map((r) => `fal (${r.model}): every figure byway records was found on https://fal.ai/models/${r.model}.`),
    ]);
    expect(out.warnings).toEqual([]);
    expect(out.summary).toBe(`### Prices\n\n${out.lines.join('\n\n')}\n`);
    // The pages in English, each read once, with no key; the script of another site is not fetched.
    for (const a of asked) expect(a.headers, a.url).toEqual({ 'accept-language': 'en-US,en;q=0.9' });
    expect(asked.map((a) => a.url).filter((u) => u.includes('elsewhere'))).toEqual([]);
    expect(new Set(asked.map((a) => a.url)).size).toBe(asked.length);
  });

  it("flags a figure a page no longer shows after the model's name, naming the row and the figure, with one warning", async () => {
    const pro = row('google', 'gemini-3.1-pro-preview');
    const changed = googlePage().replace(`${$(pro.longContext!.inputPerMTok)}, prompts &gt; 200k tokens`, '$5.00, prompts &gt; 200k tokens');
    const out = await run(web({ 'https://ai.google.dev/gemini-api/docs/pricing?hl=en': changed }).fetch);
    const flagged = `Google gemini-3.1-pro-preview: not found after its name on the page: long-context input $${pro.longContext!.inputPerMTok}.`;
    expect(out.lines).toContain(flagged);
    expect(out.lines.filter((l) => !l.startsWith('::warning')).at(-1)).toBe(NEXT);
    expect(out.warnings).toEqual([`::warning title=Prices::${flagged} ${NEXT}`]);
    // The dated row of a model is checked too.
    const flash2027 = row('google', 'gemini-3.8-flash', '2027-01-01');
    const noLater = googlePage().replace(`${$(flash2027.outputPerMTok)} starting 2027-01-01.`, '$9.99 starting 2027-01-01.');
    expect((await run(web({ 'https://ai.google.dev/gemini-api/docs/pricing?hl=en': noLater }).fetch)).lines).toContain(`Google gemini-3.8-flash (the row from 2027-01-01): not found after its name on the page: output $${flash2027.outputPerMTok}.`);
  });

  it("reads a model's name as a whole name, and its figures only up to the next model it prices", async () => {
    // Without Claude Opus 5's own row, its figures are not read from Claude Opus 5.5's (whose name starts with it).
    const withoutOpus5 = anthropicPage(PRICES.filter((r) => r.provider === 'anthropic' && r.model !== 'claude-opus-5'));
    const opus5 = row('anthropic', 'claude-opus-5');
    expect((await run(web({ 'https://platform.claude.com/docs/en/about-claude/pricing.md': withoutOpus5 }).fetch)).lines).toContain(
      `Anthropic claude-opus-5: not found after its name on the page: input $${opus5.inputPerMTok}, output $${opus5.outputPerMTok}, cache read $${opus5.cacheReadPerMTok}, cache write $${opus5.cacheWritePerMTok}.`,
    );
    // A Markdown row is read to its end: a figure on the next line is not its own.
    const astra = row('openai', 'gpt-6-astra');
    const split = anthropicPage().replace(/(\| Claude Fable 5\.1 \| \$10\.00 \/ MTok)/, '$1 |\n| ');
    expect((await run(web({ 'https://platform.claude.com/docs/en/about-claude/pricing.md': split }).fetch)).lines.some((l) => l.startsWith('Anthropic claude-fable-5-1: not found'))).toBe(true);
    // In HTML, a model's stretch ends where the next model the page prices begins: gpt-6.1-sol's output, $10, does not
    // stand in for gpt-6-astra's input once that has changed.
    const sol = row('openai', 'gpt-6.1-sol');
    expect(sol.outputPerMTok).toBe(astra.inputPerMTok);
    const newAstraInput = openaiPage().replace(`<td>gpt-6-astra</td><td>${$(astra.inputPerMTok)}</td>`, '<td>gpt-6-astra</td><td>$11.00</td>');
    expect((await run(web({ 'https://developers.openai.com/api/docs/pricing': newAstraInput }).fetch)).lines).toContain(`OpenAI gpt-6-astra: not found after its name on the page: input $${astra.inputPerMTok}.`);
  });

  it("reads OpenAI's long-context rates from the page's own scripts, and flags them when they differ or cannot be read", async () => {
    expect(pageScripts(openaiPage(), 'https://developers.openai.com/api/docs/pricing')).toEqual(['https://developers.openai.com/_astro/pricing.Ab1.js?dpl=x']);
    const sol = row('openai', 'gpt-6.1-sol');
    const changed = openaiScript().replace(`"gpt-6.1-sol":{input:${sol.longContext!.inputPerMTok}`, '"gpt-6.1-sol":{input:4.5');
    const flagged = `OpenAI gpt-6.1-sol: the page's scripts do not give its long-context rates as byway records them (input $${sol.longContext!.inputPerMTok}, output $${sol.longContext!.outputPerMTok}).`;
    expect((await run(web({ 'https://developers.openai.com/_astro/pricing.Ab1.js?dpl=x': changed }).fetch)).lines).toEqual(expect.arrayContaining([flagged, NEXT]));
    // A script that cannot be read leaves the rates unread, which is said, for every tiered row.
    const unread = (await run(web({ 'https://developers.openai.com/_astro/pricing.Ab1.js?dpl=x': 503 }).fetch)).lines.filter((l) => !l.startsWith('::warning') && l.includes("the page's scripts do not give"));
    expect(unread.map((l) => l.split(':')[0])).toEqual(['OpenAI gpt-6-astra', 'OpenAI gpt-6.1-sol', 'OpenAI gpt-6-luna']);
  });

  it("reads OpenAI's Standard prices only: a model whose every price doubles or halves, in every table and every map, is flagged (PRICES-1)", async () => {
    for (const r of PRICES.filter((p) => p.provider === 'openai')) {
      for (const k of [2, 0.5]) {
        const pages = { 'https://developers.openai.com/api/docs/pricing': openaiPage(undefined, { [r.model]: k }), 'https://developers.openai.com/_astro/pricing.Ab1.js?dpl=x': openaiScript(undefined, { [r.model]: k }) };
        const lines = (await run(web(pages).fetch)).lines.filter((l) => l.startsWith(`OpenAI ${r.model}:`));
        const shown = [['input', r.inputPerMTok], ['output', r.outputPerMTok], ['cache read', r.cacheReadPerMTok], ['cache write', r.cacheWritePerMTok]].filter(([, n]) => n !== undefined);
        const expected = [`OpenAI ${r.model}: not found after its name on the page: ${shown.map(([what, n]) => `${what} $${n}`).join(', ')}.`];
        if (r.longContext) expected.push(`OpenAI ${r.model}: the page's scripts do not give its long-context rates as byway records them (input $${r.longContext.inputPerMTok}, output $${r.longContext.outputPerMTok}).`);
        expect(lines, `${r.model} x${k}`).toEqual(expected);
      }
    }
    // A model's stretch also ends where the page names it again, as when it ends one table and starts the next: here
    // every table holds gpt-6-astra alone, so its Standard row runs straight into its Batch row.
    const astra = row('openai', 'gpt-6-astra');
    const alone = (await run(web({ 'https://developers.openai.com/api/docs/pricing': openaiPage([astra], { [astra.model]: 2 }) }).fetch)).lines;
    expect(alone).toContain(`OpenAI gpt-6-astra: not found after its name on the page: input $${astra.inputPerMTok}, output $${astra.outputPerMTok}, cache read $${astra.cacheReadPerMTok}, cache write $${astra.cacheWritePerMTok}.`);
  });

  it("flags a sentence the table's reading of a page rests on that the page no longer carries", async () => {
    const gone = anthropicPage().replace('at standard pricing', 'at long-context pricing');
    expect((await run(web({ 'https://platform.claude.com/docs/en/about-claude/pricing.md': gone }).fetch)).lines).toContain('Anthropic: the page no longer says "include the full 1M token context window at standard pricing".');
    const noTier = openaiPage().replace('Long: &gt;272K input tokens', 'Long: &gt;300K input tokens');
    expect((await run(web({ 'https://developers.openai.com/api/docs/pricing': noTier }).fetch)).lines).toContain('OpenAI: the page no longer says "Long: >272K input tokens".');
  });

  it("compares OpenRouter's prices exactly, as decimals: any spelling of the same number matches, any other number does not", () => {
    expect(decimal('0.000004')).toEqual({ digits: '4', exp: -6 });
    expect(decimal('0.0000125')).toEqual({ digits: '125', exp: -7 });
    expect(decimal('12.50')).toEqual({ digits: '125', exp: -1 });
    for (const [perToken, perMTok] of [['0.000004', 4], ['0.0000040', 4], ['.000004', 4], ['0.00000025', 0.25], ['0.0000125', 12.5], ['0', 0]] as const) expect(samePerToken(perToken, perMTok), `${perToken} ${perMTok}`).toBe(true);
    for (const [perToken, perMTok] of [['0.0000041', 4], ['0.00004', 4], ['4e-6', 4], ['', 4], [4e-6, 4], [null, 4], ['-0.000004', 4]] as const) expect(samePerToken(perToken, perMTok), `${String(perToken)} ${perMTok}`).toBe(false);
    const rows = PRICES.filter((r) => r.provider === 'openrouter');
    const list = openrouterModels();
    list.data![1]!.pricing!.completion = '0.000021';
    list.data = list.data!.filter((m) => m.id !== rows[2]!.model);
    expect(openRouterReport(list, rows)).toEqual({
      flagged: true,
      lines: [`OpenRouter ${rows[1]!.model}: the model list gives completion "0.000021" per token; byway records $${rows[1]!.outputPerMTok} per 1M tokens.`, `OpenRouter ${rows[2]!.model}: the model list no longer has it.`],
    });
  });

  it('never fails: a page or list it cannot read is said in one line, and the others are still checked', async () => {
    const out = await run(web({ [OPENROUTER_MODELS]: new Error('getaddrinfo ENOTFOUND openrouter.ai'), 'https://ai.google.dev/gemini-api/docs/pricing?hl=en': 503, 'https://platform.claude.com/docs/en/about-claude/pricing.md': 'not a page' }).fetch);
    expect(out.lines).toContain('OpenRouter: its model list could not be read (getaddrinfo ENOTFOUND openrouter.ai), so this run says nothing of it.');
    expect(out.lines).toContain('Google: https://ai.google.dev/gemini-api/docs/pricing?hl=en could not be read (it answered 503), so this run says nothing of it.');
    expect(out.lines).toContain('OpenAI: every figure byway records was found on https://developers.openai.com/api/docs/pricing.');
    // A page that reads but shows none of its figures is flagged, not passed.
    expect(out.lines.filter((l) => l.startsWith('Anthropic claude-'))).toHaveLength(5);
    expect(out.summary).toContain(out.lines[1]!);
    // An answer that is not JSON is unreadable too.
    expect((await run(web({ [OPENROUTER_MODELS]: '<html>' }).fetch)).lines[1]).toMatch(/^OpenRouter: its model list could not be read \(.+\), so this run says nothing of it\.$/);
  });

  it(`says when the monthly re-read is due, from ${REREAD_DUE_DAYS} days after the last full read, with a warning`, async () => {
    expect(rereadLine('2026-10-22', day('2026-10-23'))).toEqual({ due: false, line: "byway's price table was last read in full on 2026-10-22, 1 day ago." });
    expect(rereadLine('2026-10-22', day('2026-11-20'))).toEqual({ due: false, line: "byway's price table was last read in full on 2026-10-22, 29 days ago." });
    expect(rereadLine('2026-10-22', day('2026-11-21'))).toEqual({ due: true, line: "byway's price table was last read in full on 2026-10-22, 30 days ago: the monthly re-read the owner chose on 2026-10-21 is due." });
    const due = new Date(CHECKED.getTime() + REREAD_DUE_DAYS * 86_400_000);
    const out = await run(web().fetch, due);
    expect(out.warnings).toEqual([`::warning title=Prices::${rereadLine(PRICES_CHECKED, due).line}`]);
    expect(out.lines).not.toContain(NEXT);
  });
});
