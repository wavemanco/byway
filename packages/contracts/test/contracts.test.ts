import { describe, expect, it } from 'vitest';
import { GatewayError, ledgerEntryProblem, MEDIA, MEDIUM_FORMAT, RESOLVE_UPDATE, TASK_QUEUE } from '../src/index.ts';

/** A ledger entry as the gateway writes one, for the checks below. */
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  seq: 1,
  at: '2026-10-09T10:00:00.000Z',
  prevHash: `sha256:${'0'.repeat(64)}`,
  hash: `sha256:${'1'.repeat(64)}`,
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'draft',
  purpose: 'build:prose',
  kind: 'completion',
  provider: 'anthropic',
  requestedModel: 'm',
  servedModel: 'm',
  requestSha256: `sha256:${'a'.repeat(64)}`,
  responseSha256: `sha256:${'b'.repeat(64)}`,
  usage: { inputTokens: 1, outputTokens: 1 },
  costUsd: 0.01,
  latencyMs: 1,
  ...over,
});

describe('ledgerEntryProblem (ADR-0095 decision 6)', () => {
  it('accepts an entry with a run and a step, and one with neither', () => {
    expect(ledgerEntryProblem(entry())).toBeUndefined();
    const { runId: _run, stepId: _step, ...advisor } = entry();
    expect(ledgerEntryProblem(advisor)).toBeUndefined();
  });

  it('refuses an empty run or step: a hand-edited line would record spend under run ""', () => {
    expect(ledgerEntryProblem(entry({ runId: '' }))).toBe('its "runId" is empty or not text');
    expect(ledgerEntryProblem(entry({ stepId: '' }))).toBe('its "stepId" is empty or not text');
    expect(ledgerEntryProblem(entry({ runId: 7 }))).toBe('its "runId" is empty or not text');
  });
});

describe('contracts', () => {
  it('defines a format for every medium', () => {
    for (const m of MEDIA) expect(MEDIUM_FORMAT[m].artifactMediaType.length).toBeGreaterThan(0);
  });

  it('carries gateway error codes and retryability', () => {
    const e = new GatewayError('rate-limited', 'slow down', true);
    expect(e).toBeInstanceOf(Error);
    expect([e.name, e.code, e.retryable]).toEqual(['GatewayError', 'rate-limited', true]);
  });

  it('names the Temporal coordinates', () => {
    expect([TASK_QUEUE, RESOLVE_UPDATE]).toEqual(['byway-runs', 'resolveCheckpoint']);
  });
});
