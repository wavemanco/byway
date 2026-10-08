import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Gateway } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { createGateway, PROFILES } from '../src/index.ts';
import { createAnthropicClient } from '../src/providers/anthropic.ts';
import { createGoogleClient } from '../src/providers/google.ts';
import { createOpenAIClient } from '../src/providers/openai.ts';
import { createOpenRouterClient } from '../src/providers/openrouter.ts';
import { MemoryArtifacts } from './fakes.ts';

describe('@byway/gateway', () => {
  it('implements the Gateway contract', async () => {
    const g: Gateway = createGateway({
      ledgerPath: join(mkdtempSync(join(tmpdir(), 'byway-idx-')), 'ledger.jsonl'),
      artifacts: new MemoryArtifacts(),
      caps: { workspaceCapUsd: () => 5 },
      env: {},
    });
    expect(g.profiles().map((p) => p.id)).toEqual(['demo']);
    expect(await g.spend('ws')).toEqual({ workspaceId: 'ws', spentUsd: 0, capUsd: 5, byRun: {} });
    expect(await g.verifyLedger()).toBeNull();
    expect(PROFILES.length).toBeGreaterThanOrEqual(3);
  });

  it('builds the real SDK clients offline (construction makes no request)', () => {
    expect(typeof createAnthropicClient('test-key-not-real').beta.messages.stream).toBe('function');
    expect(typeof createOpenAIClient('test-key-not-real').chat.completions.create).toBe('function');
    expect(typeof createOpenRouterClient('test-key-not-real').chat.completions.create).toBe('function');
    expect(typeof createGoogleClient('test-key-not-real').models.generateContent).toBe('function');
  });
});
