/**
 * The configuration chooser as data (product spec §4). Its order is read back from the flowchart in
 * 03-configurations "Choosing a configuration", so the data cannot drift from the protocol text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHOOSER, CHOOSER_FALLBACK, PROTOCOL_CONFIGS } from '../src/index.ts';

const CONFIGURATIONS = resolve(import.meta.dirname, '../../../protocol/03-configurations.md');

/** The flowchart's "yes" targets in order, and its final "no" target, as recipe ids. */
function flowchart(): { yes: string[]; fallback: string } {
  const text = readFileSync(CONFIGURATIONS, 'utf8');
  const section = text.slice(text.indexOf('## Choosing a configuration'));
  const chart = section.slice(section.indexOf('```mermaid'), section.indexOf('```', section.indexOf('```mermaid') + 3));
  const target = /-->\s*\w+\["(C\d+a?)\s/;
  const yes: string[] = [];
  let fallback = '';
  for (const line of chart.split('\n')) {
    const m = target.exec(line);
    if (!m) continue;
    if (line.includes('-- yes -->')) yes.push(m[1]!.toLowerCase());
    else if (line.includes('-- no -->')) fallback = m[1]!.toLowerCase();
  }
  return { yes, fallback };
}

describe('configuration chooser', () => {
  it('reads the 03 flowchart: seven questions, then a default', () => {
    const { yes, fallback } = flowchart();
    expect(yes).toEqual(['c2', 'c7', 'c5', 'c1', 'c6a', 'c3', 'c6']);
    expect(fallback).toBe('c4');
  });

  it('asks the seven questions of 03 in order; the first yes decides', () => {
    expect(CHOOSER).toHaveLength(7);
    expect(CHOOSER.map((q) => q.routesTo)).toEqual(flowchart().yes);
    expect(CHOOSER_FALLBACK).toBe(flowchart().fallback);
  });

  it('routes only to protocol recipes, and reaches every one of the eight', () => {
    const ids = PROTOCOL_CONFIGS.map((r) => r.id);
    for (const q of CHOOSER) expect(ids, q.id).toContain(q.routesTo);
    expect(ids).toContain(CHOOSER_FALLBACK);
    expect(new Set([...CHOOSER.map((q) => q.routesTo), CHOOSER_FALLBACK])).toEqual(new Set(ids));
  });

  it('has stable, distinct ids and plain questions with help', () => {
    expect(new Set(CHOOSER.map((q) => q.id)).size).toBe(CHOOSER.length);
    for (const q of CHOOSER) {
      expect(q.id).toMatch(/^[a-z][a-z-]*$/);
      expect(q.text, q.id).toMatch(/^[A-Z].*\?$/);
      expect(q.help, q.id).toMatch(/^[A-Z].*\.$/s);
      for (const text of [q.text, q.help]) {
        expect(text, q.id).not.toMatch(/\b(SEED|VISION|CRITIC|ASSET|RELAY|CUT|TELLS|VOICE|D[123]|C[1-7]a?)\b/);
        expect(text, q.id).not.toMatch(/research[- ]backed|proven|studies show|outperform/i);
      }
    }
  });
});
