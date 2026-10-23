import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { EXPOSURE_FILENAME, exposurePath, isJudgingPurpose, readExposure } from '../src/exposure.ts';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { fakeAnthropic, fakeGoogle, fakeOpenAI, MemoryArtifacts } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

/**
 * CR12-1 and convention C3: every non-Anthropic-family judging call (critic, judge, check, rerank and gate purposes) is
 * recorded in an append-only exposure register beside the ledger, so the evaluation side's lineage check (ADR-0055) can
 * retire an exposed family as a held-out judge.
 */
const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-test-key-123456', OPENAI_API_KEY: 'sk-test-not-a-real-openai-key-0000000', GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-gw-exposure-'));
});

let clock = new Date('2026-10-07T12:00:00Z');
function gateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    spendBook: memorySpendBook(),
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => 100 },
    env: KEYS,
    clients: { anthropic: fakeAnthropic().client, openai: fakeOpenAI().client, google: fakeGoogle().client },
    retry: { sleep: async () => {}, random: () => 0.5 },
    now: () => clock,
    ...over,
  });
}

const call = (over: Partial<CompletionRequest>): CompletionRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'critic',
  purpose: 'critic:prose',
  profileId: 'openai',
  tier: 'big',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Judge this.' }] }],
  maxOutputTokens: 500,
  ...over,
});

const registerLines = () => readFileSync(join(dir, EXPOSURE_FILENAME), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

describe('exposure register', () => {
  it('lives beside the ledger', () => {
    expect(exposurePath(join(dir, 'ledger.jsonl'))).toBe(join(dir, 'exposure.jsonl'));
  });

  it('records a non-Anthropic critic once per model, role and workspace, with the date it was first used', async () => {
    clock = new Date('2026-10-07T12:00:00Z');
    const g = gateway();
    await g.complete(call({}));
    clock = new Date('2026-10-09T08:00:00Z');
    await g.complete(call({}));
    expect(registerLines()).toEqual([{ provider: 'openai', family: 'openai', model: 'gpt-6-astra', role: 'critic', workspaceId: 'ws-1', firstUsedOn: '2026-10-07' }]);
    // Another role, another workspace and another family are each new exposures.
    await g.complete(call({ purpose: 'judge:web-page' }));
    await g.complete(call({ workspaceId: 'ws-2' }));
    await g.complete(call({ profileId: 'google' }));
    expect(registerLines().map((e) => [e.model, e.role, e.workspaceId, e.firstUsedOn])).toEqual([
      ['gpt-6-astra', 'critic', 'ws-1', '2026-10-07'],
      ['gpt-6-astra', 'judge', 'ws-1', '2026-10-09'],
      ['gpt-6-astra', 'critic', 'ws-2', '2026-10-09'],
      ['gemini-3.1-pro-preview', 'critic', 'ws-1', '2026-10-09'],
    ]);
  });

  it('records the other-family critic a Claude profile calls (C3), and nothing for Claude itself', async () => {
    const g = gateway();
    await g.complete(call({ profileId: 'balanced' }));
    expect(existsSync(join(dir, EXPOSURE_FILENAME))).toBe(false);
    await g.complete(call({ profileId: 'balanced', model: { provider: 'openai', model: 'gpt-6-astra' } }));
    expect(registerLines()).toEqual([expect.objectContaining({ provider: 'openai', model: 'gpt-6-astra', role: 'critic' })]);
  });

  it('records only judging purposes: building, cutting or sweeping on another family is not recorded here', async () => {
    const g = gateway();
    for (const purpose of ['build:prose', 'fix:prose', 'seed:web-page', 'cut:prose', 'vision:web-page', 'advisor.intake']) {
      await g.complete(call({ purpose, tier: 'mid' }));
    }
    expect(existsSync(join(dir, EXPOSURE_FILENAME))).toBe(false);
    for (const role of ['critic', 'judge', 'select', 'rerank', 'check', 'tells-compare', 'gate']) expect(isJudgingPurpose(`${role}:prose`), role).toBe(true);
    for (const role of ['build', 'fix', 'seed', 'cut', 'vision', 'tells-sweep', 'dedupe', 'overlap', 'asset.briefs', 'asset.integrate', 'advisor.compose']) {
      expect(isJudgingPurpose(`${role}:prose`), role).toBe(false);
    }
  });

  it('records nothing in demo mode: the mock is not a model family', async () => {
    const g = gateway({ demo: true });
    await g.complete(call({ profileId: 'demo', model: { provider: 'mock', model: 'mock-other' } }));
    expect(existsSync(join(dir, EXPOSURE_FILENAME))).toBe(false);
  });

  it('records an OpenRouter call by the family named in its model id', async () => {
    const g = gateway({ env: { ...KEYS, OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000' }, clients: { openrouter: fakeOpenAI().client } });
    await g.complete(call({ profileId: 'openrouter' }));
    expect(existsSync(join(dir, EXPOSURE_FILENAME))).toBe(false);
  });

  it('is recorded before the provider is called, so a failed or refused call still counts as exposure', async () => {
    const failing = fakeOpenAI([Object.assign(new Error('bad request'), { status: 400 })]);
    const g = gateway({ clients: { openai: failing.client } });
    await expect(g.complete(call({}))).rejects.toMatchObject({ code: 'invalid-request' });
    expect(registerLines()).toHaveLength(1);
  });

  it('is not recorded for a call the budget refuses before it is made', async () => {
    const g = gateway({ caps: { workspaceCapUsd: () => 0 } });
    await expect(g.complete(call({}))).rejects.toMatchObject({ code: 'budget-exceeded' });
    expect(existsSync(join(dir, EXPOSURE_FILENAME))).toBe(false);
  });

  it('reads back for the evaluation side as one entry per key, with the earliest date when two processes raced', async () => {
    const path = join(dir, EXPOSURE_FILENAME);
    const line = (firstUsedOn: string, role = 'critic') => JSON.stringify({ provider: 'google', family: 'google', model: 'gemini-3.1-pro-preview', role, workspaceId: 'ws', firstUsedOn });
    writeFileSync(path, `${line('2026-10-09')}\n${line('2026-10-08')}\nnot json\n${line('2026-10-10', 'judge')}\n`);
    expect(await readExposure(path)).toEqual([
      { provider: 'google', family: 'google', model: 'gemini-3.1-pro-preview', role: 'critic', workspaceId: 'ws', firstUsedOn: '2026-10-08' },
      { provider: 'google', family: 'google', model: 'gemini-3.1-pro-preview', role: 'judge', workspaceId: 'ws', firstUsedOn: '2026-10-10' },
    ]);
    expect(await readExposure(join(dir, 'missing.jsonl'))).toEqual([]);
  });

  it('does not write a second line for a key another gateway on the same directory already recorded', async () => {
    await gateway().complete(call({}));
    await gateway().complete(call({}));
    expect(registerLines()).toHaveLength(1);
  });
});
