import { describe, expect, it } from 'vitest';
import { GatewayError, MEDIA, MEDIUM_FORMAT, RESOLVE_UPDATE, TASK_QUEUE } from '../src/index.ts';

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
