import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionRequest, ModelRef } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { PRICES, priceFor } from '../src/prices.ts';
import { PROFILES, profileStatus } from '../src/profiles.ts';
import { fakeOpenAI, MemoryArtifacts } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

/**
 * Contracts v5, convention C3 (FID-1): each profile names a big model of another provider family for critics whose
 * family knob is 'other', and ProfileStatus.otherFamily says whether it can be used with the keys present.
 */
const byId = (id: string) => {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`no profile ${id}`);
  return p;
};
const today = new Date('2026-10-07T12:00:00Z');
const ANTHROPIC = { ANTHROPIC_API_KEY: 'sk-ant-test-key-123456' };
const OPENAI = { OPENAI_API_KEY: 'sk-test-not-a-real-openai-key-0000000' };
const GEMINI = { GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' };

/** The provider family a model belongs to: its provider, or the upstream named in an OpenRouter model id. */
const familyOf = (ref: ModelRef) => (ref.provider === 'openrouter' ? ref.model.split('/')[0] : ref.provider);

describe('other-family critic models (C3)', () => {
  it('gives balanced and best a big model from another provider family than their judge', () => {
    for (const id of ['balanced', 'best']) {
      const p = byId(id);
      expect(p.otherFamily, id).toBeDefined();
      expect(familyOf(p.otherFamily!), id).not.toBe(familyOf(p.tiers.big));
    }
  });

  it('gives the OpenAI and Google profiles a Claude reviewer, and the demo a mock one', () => {
    expect(byId('openai').otherFamily?.provider).toBe('anthropic');
    expect(byId('google').otherFamily?.provider).toBe('anthropic');
    expect(byId('demo').otherFamily).toEqual({ provider: 'mock', model: 'mock-other' });
  });

  it('keeps the planned held-out judge lines (GPT Sol, Gemini 3.1 Pro) off critic duty on the Claude profiles (CR12)', () => {
    for (const id of ['balanced', 'best']) {
      const model = byId(id).otherFamily!.model;
      expect(model, id).not.toMatch(/sol/i);
      expect(model, id).not.toMatch(/gemini-3\.1-pro/i);
    }
  });

  it('prices every other-family model', () => {
    for (const p of PROFILES) {
      if (!p.otherFamily) continue;
      expect(priceFor(PRICES, p.otherFamily.provider, p.otherFamily.model, today), `${p.id}: ${p.otherFamily.model}`).toBeDefined();
    }
  });

  it('reports otherFamily only when the profile has one and its provider has a key', () => {
    const of = (env: Record<string, string>, id: string) => profileStatus(PROFILES, env).find((s) => s.profile.id === id);
    expect(of(ANTHROPIC, 'balanced')).toMatchObject({ usable: true, otherFamily: false });
    expect(of({ ...ANTHROPIC, ...OPENAI }, 'balanced')).toMatchObject({ usable: true, otherFamily: true });
    expect(of({ ...ANTHROPIC, ...OPENAI }, 'best')).toMatchObject({ otherFamily: true });
    expect(of(OPENAI, 'openai')).toMatchObject({ usable: true, otherFamily: false });
    expect(of({ ...OPENAI, ...ANTHROPIC }, 'openai')).toMatchObject({ otherFamily: true });
    expect(of({ ...GEMINI, ...ANTHROPIC }, 'google')).toMatchObject({ otherFamily: true });
    // A profile without one never reports it.
    expect(of({ OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000', ...OPENAI }, 'openrouter')).toMatchObject({ otherFamily: false });
    expect(of({}, 'demo')).toMatchObject({ otherFamily: true });
  });
});

describe('gateway: other-family calls', () => {
  const setup = (over: Partial<GatewayOptions> = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'byway-gw-family-'));
    return createGateway({
      ledgerPath: join(dir, 'ledger.jsonl'),
      spendBook: memorySpendBook(),
      artifacts: new MemoryArtifacts(),
      caps: { workspaceCapUsd: () => 100 },
      env: {},
      retry: { sleep: async () => {}, random: () => 0.5 },
      now: () => today,
      ...over,
    });
  };
  const critic = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
    workspaceId: 'ws-1',
    runId: 'run-1',
    stepId: 'critic',
    purpose: 'critic:prose',
    profileId: 'balanced',
    tier: 'big',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Rank these.' }] }],
    maxOutputTokens: 500,
    ...over,
  });

  it('calls the other-family model when the runner passes it as the model', async () => {
    const { client, calls } = fakeOpenAI();
    const g = setup({ env: { ...ANTHROPIC, ...OPENAI }, clients: { openai: client } });
    const res = await g.complete(critic({ model: byId('balanced').otherFamily! }));
    expect(res.provider).toBe('openai');
    expect(calls[0]).toMatchObject({ model: byId('balanced').otherFamily!.model });
  });

  it("in demo mode, serves the demo profile's mock other-family model when it is asked for", async () => {
    const g = setup({ demo: true });
    const res = await g.complete(critic({ profileId: 'demo', model: byId('demo').otherFamily! }));
    expect([res.provider, res.servedModel]).toEqual(['mock', 'mock-other']);
    // A real model asked for in demo mode still goes to the mock's tier model: demo mode never calls a provider.
    const real = await g.complete(critic({ model: byId('balanced').otherFamily! }));
    expect([real.provider, real.servedModel]).toEqual(['mock', 'mock-big']);
  });
});
