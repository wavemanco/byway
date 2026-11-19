/**
 * The route handlers' wiring (src/server/deps.ts): a run is explained by the advisor of byway's services as started,
 * which Settings' demo switch does not change (ADR-0121 item 5), not by the request's own. The services are stand-ins.
 */
import { describe, expect, it, vi } from 'vitest';

const asStarted = { name: 'byway as started' };
const forRequest = { name: 'this request, under the demo switch' };
vi.mock('../src/services/index.ts', () => ({
  getContext: async () => ({ services: { advisor: forRequest }, workspaceId: 'ws', profileId: 'balanced', heldKeyIn: () => undefined, questionEstimates: () => ({}), pricesCheckedOn: '2026-11-16', modelWaits: () => [] }),
  getServices: async () => ({ advisor: asStarted }),
}));

const { getDeps } = await import('../src/server/deps.ts');

describe('getDeps', () => {
  it('hands a run the advisor of byway as started, and the request its own (ADR-0121)', async () => {
    const deps = await getDeps();
    expect(deps.runAdvisor).toBe(asStarted);
    expect(deps.services.advisor).toBe(forRequest);
  });
});
