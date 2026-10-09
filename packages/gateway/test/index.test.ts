import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as contracts from '@byway/contracts';
import type { Gateway } from '@byway/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createGateway, PROFILES, type BudgetDetails, type BudgetError, type GatewayLedgerEntry, type ProfileStatus } from '../src/index.ts';
import { createAnthropicClient } from '../src/providers/anthropic.ts';
import { createFalClient } from '../src/providers/fal.ts';
import { createGoogleClient } from '../src/providers/google.ts';
import { createOpenAIClient } from '../src/providers/openai.ts';
import { createOpenRouterClient } from '../src/providers/openrouter.ts';
import { MemoryArtifacts } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

describe('@byway/gateway', () => {
  it('implements the Gateway contract', async () => {
    const g: Gateway = createGateway({
      ledgerPath: join(mkdtempSync(join(tmpdir(), 'byway-idx-')), 'ledger.jsonl'),
      spendBook: memorySpendBook(),
      artifacts: new MemoryArtifacts(),
      caps: { workspaceCapUsd: () => 5 },
      env: {},
    });
    expect(g.profiles().map((p) => p.id)).toEqual(['demo']);
    const status = g.profileStatus();
    expect(status.map((s) => s.profile.id)).toEqual(PROFILES.map((p) => p.id));
    expect(status.find((s) => s.profile.id === 'demo')).toMatchObject({ usable: true, missing: [], images: true, video: true, otherFamily: true });
    expect(status.find((s) => s.profile.id === 'balanced')).toMatchObject({ usable: false, missing: ['anthropic'], images: false, video: false, otherFamily: false });
    expect(await g.spend('ws')).toEqual({ workspaceId: 'ws', spentUsd: 0, capUsd: 5, byRun: {}, inFlightUsd: 0, uncertainUsd: 0 });
    expect(await g.verifyLedger()).toBeNull();
    expect(PROFILES.length).toBeGreaterThanOrEqual(3);
  });

  it('re-exports the contract types under their old names instead of keeping local copies', () => {
    expectTypeOf<BudgetDetails>().toEqualTypeOf<contracts.BudgetDetails>();
    expectTypeOf<ProfileStatus>().toEqualTypeOf<contracts.ProfileStatus>();
    expectTypeOf<GatewayLedgerEntry>().toEqualTypeOf<contracts.LedgerEntry>();
    expectTypeOf<BudgetError['budget']>().toEqualTypeOf<contracts.BudgetDetails>();
    expectTypeOf<contracts.CompletionResult['stopReason']>().toEqualTypeOf<'end' | 'max-tokens' | undefined>();
  });

  it('exports what the runner, the web app and the evaluation side read: the exposure register and the demo-mark stripper', async () => {
    const gw = await import('../src/index.ts');
    expect(typeof gw.readExposure).toBe('function');
    expect(gw.EXPOSURE_FILENAME).toBe('exposure.jsonl');
    // UX-6: the demo's revision markers never reach a person; the runner and the web strip them where text is shown.
    expect(gw.withoutMarks('Why: smaller.\n<!-- byway-demo-revision: 4 -->')).toBe('Why: smaller.\n');
    expect(gw.withoutMarks('# Memo\n\nText.\n\n[//]: # (byway-demo-revision: 2)')).toBe('# Memo\n\nText.\n\n');
  });

  it('builds the real SDK clients offline (construction makes no request)', () => {
    expect(typeof createAnthropicClient('test-key-not-real').beta.messages.stream).toBe('function');
    expect(typeof createOpenAIClient('test-key-not-real').chat.completions.create).toBe('function');
    expect(typeof createOpenRouterClient('test-key-not-real').chat.completions.create).toBe('function');
    expect(typeof createGoogleClient('test-key-not-real').models.generateContent).toBe('function');
    const fal = createFalClient('test-key-id:test-secret-not-real');
    expect([typeof fal.queue.submit, typeof fal.queue.subscribeToStatus, typeof fal.queue.result, typeof fal.storage.upload]).toEqual(['function', 'function', 'function', 'function']);
  });
});
