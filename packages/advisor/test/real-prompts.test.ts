import { PROTOCOL_CONFIGS } from '@byway/catalog';
import type { LedgerEntry } from '@byway/contracts';
import type { Responder } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { validate } from '@byway/validator';
import { describe, expect, it } from 'vitest';
import { createAdvisor } from '../src/index.ts';
import { demoGateway, fencedJson, recording, tempLedger, WS } from './helpers.ts';

/**
 * Agreement tests (spec §3.3: prompts, the gateway's mock and the advisor's parsers must agree): the advisor with the
 * REAL templates (`createPromptRenderer()`) and the REAL gateway in demo mode, its mock answering every call. Every
 * render must succeed (the renderer is strict about slots), every answer must parse on the first try, and every ledger
 * entry must name the template behind it.
 */

const library = createPromptRenderer();

function realAdvisor(responders?: Record<string, Responder>) {
  const ledger = tempLedger();
  const inner = demoGateway({ ledgerPath: ledger.ledgerPath, ...(responders ? { mockResponders: responders } : {}) });
  const gateway = recording(inner);
  return { advisor: createAdvisor({ gateway, prompts: library }), gateway, ledger: ledger.entries, verify: () => inner.verifyLedger() };
}

/** The ledger's provenance for a call: the template whose id is the call's purpose (advisor ids equal their purposes). */
function expectProvenance(entries: LedgerEntry[]) {
  expect(entries.length).toBeGreaterThan(0);
  for (const e of entries) {
    const t = library.info(e.purpose);
    expect(e.prompt, e.purpose).toEqual({ id: e.purpose, version: t.version, hash: t.hash, fidelity: t.fidelity });
  }
}

/** One representative problem per configuration, as a person would write it. */
const PROBLEMS: [string, string][] = [
  ['c1', 'A landing page for my neighborhood bakery'],
  ['c2', 'Strategy options for entering the Brazilian market'],
  ['c3', 'A weekly newsletter series about urban gardening'],
  ['c4', 'A status memo to leadership about the billing migration'],
  ['c5', 'A 30-second video ad for our trail running shoes'],
  ['c6', 'My cover letter for a museum curator job'],
  ['c6a', 'A short story about a lighthouse keeper who stops answering letters'],
  ['c7', 'Trim this agent-written code change before it goes to review'],
];

describe('real templates, real demo gateway: recommend', () => {
  it.each(PROBLEMS)('%s: "%s" renders, parses on the first answer and records provenance', async (expected, text) => {
    const { advisor, gateway, ledger, verify } = realAdvisor();
    const rec = await advisor.recommend({ text, audience: 'Whoever reads it', constraints: ['Plain words'], attachments: [{ name: 'notes.md', text: 'Some ```fenced``` notes.' }] }, WS);
    expect(rec.recipeId).toBe(expected);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake']);
    expect(rec.answers.every((a) => a.setBy === 'intake')).toBe(true);
    expectProvenance(await ledger());
    expect(await verify()).toBeNull();
  });
});

describe('real templates, real demo gateway: compose', () => {
  it.each(PROBLEMS)('near %s: the demo composer derives a recipe that validates, on the first answer', async (expected, text) => {
    const { advisor, gateway, ledger } = realAdvisor();
    const result = await advisor.compose({ text }, WS);
    expect(result.nearestRecipeId).toBe(expected);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(validate(result.recipe).ok).toBe(true);
    expect(result.recipe).toMatchObject({ kind: 'composed', channel: 'workspace', family: PROTOCOL_CONFIGS.find((r) => r.id === expected)!.family });
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.compose']);
    // The smallest valid change, so the composition is never the nearest recipe unchanged.
    expect(result.diff).toHaveLength(1);
    expect(result.diff[0]).toMatch(/^Changed: the repeat|^Removed: /);
    expectProvenance(await ledger());
  });

  it('repairs through the real repair template: the mock reads the nearest recipe out of it and answers a valid recipe', async () => {
    // Only the first composer answer is replaced (it drops your VOICE step); the repair is the real mock's answer.
    const broken = (() => {
      const c4 = PROTOCOL_CONFIGS.find((r) => r.id === 'c4')!;
      const copy = JSON.parse(JSON.stringify(c4)) as { stages: { stage: string; body: { op: string; steps?: { id?: string; role?: string }[] } }[] };
      const d3 = copy.stages.find((s) => s.stage === 'D3')!.body;
      d3.steps = d3.steps?.filter((s) => s.role !== 'voice');
      return copy;
    })();
    const { advisor, gateway, ledger, verify } = realAdvisor({ 'advisor.compose': () => fencedJson(broken) });
    const result = await advisor.compose({ text: 'A status memo to leadership about the billing migration' }, WS);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.compose', 'advisor.compose.repair']);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    const repair = gateway.calls[2]!;
    const sent = repair.messages[0]!.content[0];
    expect(sent?.type === 'text' && sent.text).toMatch(/COMPOSED-VOICE/);
    expectProvenance(await ledger());
    expect(await verify()).toBeNull();
  });
});
