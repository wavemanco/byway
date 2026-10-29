// Refuter probe (not part of byway): OpenAI's page as it is served, with Standard, Batch (half) and Fast (twice)
// tables, and its script's standard, batch and fast maps. A model whose every price doubles or halves must be flagged.
import { describe, expect, it } from 'vitest';
import { PRICES, type PriceRow } from '../../packages/gateway/src/prices.ts';
import { pageReport, pricePages } from '../price-report.ts';

const openai = PRICES.filter((r) => r.provider === 'openai' && r.longContext);
const $ = (n: number) => `$${n.toFixed(Math.max(2, (String(n).split('.')[1] ?? '').length))}`;
const page = (k: Record<string, number>) => {
  const table = (m: number) => `<table>${openai.map((r) => `<tr><td>${r.model}</td>${[r.inputPerMTok, r.outputPerMTok, r.cacheReadPerMTok ?? r.inputPerMTok / 10, r.cacheWritePerMTok!].map((n) => `<td>${$(n * m * (k[r.model] ?? 1))}</td>`).join('')}</tr>`).join('')}</table>`;
  return `<html><body><button aria-label="Long: &gt;272K input tokens">Long</button><p>Standard</p>${table(1)}<p>All models Batch</p>${table(0.5)}<p>All models Fast</p>${table(2)}</body></html>`;
};
const script = (k: Record<string, number>) => {
  const map = (m: number) => openai.map((r) => { const t = r.longContext!; const f = m * (k[r.model] ?? 1); return `"${r.model}":{input:${t.inputPerMTok * f},output:${t.outputPerMTok * f},cachedInput:${(t.cacheReadPerMTok ?? t.inputPerMTok / 10) * f},cacheWrite:${t.cacheWritePerMTok! * f}}`; }).join(',');
  return `var m={standard:{${map(1)}},fast:{${map(2)}},batch:{${map(0.5)}},flex:{${map(0.5)}}};`;
};
const OPENAI = { ...pricePages().find((p) => p.label === 'OpenAI')!, rows: openai as readonly PriceRow[] };

describe('OpenAI prices scaled in every table', () => {
  it('passes the page as it is', () => expect(pageReport(OPENAI, page({}), [script({})]).flagged).toBe(false));
  for (const r of openai) for (const f of [2, 0.5]) {
    it(`flags ${r.model} x${f}`, () => {
      const out = pageReport(OPENAI, page({ [r.model]: f }), [script({ [r.model]: f })]);
      expect(out.lines.join('\n')).toContain(`OpenAI ${r.model}`);
    });
  }
});
