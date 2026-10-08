/**
 * The Run screen's (and Nav's) refresh sequencer (F15, ADR-0082): only the latest-issued request may apply a snapshot
 * or set the connection state, polls never overlap, and a request that never answers counts as lost. Driven with
 * promises the test settles by hand, so every arrival order is exact.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRefresher, type Connection } from '../src/view/refresh.ts';

interface Pending {
  signal: AbortSignal;
  resolve(value: string): void;
  reject(err: unknown): void;
}

function harness(timeoutMs?: number) {
  const requests: Pending[] = [];
  const applied: string[] = [];
  const statuses: Connection[] = [];
  const refresher = createRefresher<string>({
    fetch: (signal) =>
      new Promise<string>((resolve, reject) => {
        requests.push({ signal, resolve, reject });
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    apply: (data) => applied.push(data),
    status: (c) => statuses.push(c),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  return { refresher, requests, applied, statuses };
}

/** Lets the fetch microtask run, so the request exists before the test settles it. */
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('refresh sequencing (F15)', () => {
  it('applies only the newer snapshot when an older one arrives after it', async () => {
    const { refresher, requests, applied, statuses } = harness();
    const older = refresher.now();
    await tick();
    const newer = refresher.now();
    await tick();
    expect(requests).toHaveLength(2);
    requests[1]!.resolve('newer');
    await newer;
    // The older request was superseded; even if its server answer arrives, it is never applied.
    requests[0]!.resolve('older');
    await older;
    expect(applied).toEqual(['newer']);
    expect(statuses).toEqual(['ok']);
  });

  it('a late failure of an older request leaves the connection ok', async () => {
    const { refresher, requests, statuses } = harness();
    const older = refresher.now();
    await tick();
    const newer = refresher.now();
    await tick();
    requests[1]!.resolve('newer');
    await newer;
    requests[0]!.reject(new Error('network down'));
    await older;
    expect(statuses).toEqual(['ok']);
  });

  it('aborts the older request when a newer one is issued, and that abort never sets the connection state', async () => {
    const { refresher, requests, statuses } = harness();
    const older = refresher.now();
    await tick();
    void refresher.now();
    await tick();
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(requests[1]!.signal.aborted).toBe(false);
    await older;
    expect(statuses).toEqual([]);
  });

  it('joins an in-flight request instead of starting another poll', async () => {
    const { refresher, requests, applied } = harness();
    const first = refresher.poll();
    const second = refresher.poll();
    await tick();
    expect(requests).toHaveLength(1);
    requests[0]!.resolve('one');
    await Promise.all([first, second]);
    expect(applied).toEqual(['one']);
    // Once settled, the next poll starts a new request.
    void refresher.poll();
    await tick();
    expect(requests).toHaveLength(2);
  });

  it('marks the connection lost when the latest request fails, and ok again when a later one succeeds', async () => {
    const { refresher, requests, statuses } = harness();
    const failing = refresher.now();
    await tick();
    requests[0]!.reject(new Error('500'));
    await failing;
    expect(statuses).toEqual(['lost']);
    const next = refresher.poll();
    await tick();
    requests[1]!.resolve('back');
    await next;
    expect(statuses).toEqual(['lost', 'ok']);
  });

  it('applies nothing after dispose, and a new instance for the same run applies normally (StrictMode remount)', async () => {
    const first = harness();
    const pending = first.refresher.now();
    await tick();
    first.refresher.dispose();
    expect(first.requests[0]!.signal.aborted).toBe(true);
    await pending;
    expect(first.applied).toEqual([]);
    expect(first.statuses).toEqual([]);
    await first.refresher.now();
    expect(first.requests).toHaveLength(1);

    const second = harness();
    const again = second.refresher.now();
    await tick();
    second.requests[0]!.resolve('fresh');
    await again;
    expect(second.applied).toEqual(['fresh']);
  });

  it('gives up on a request that never answers, so polling carries on and the person is told (residual: stalled request)', async () => {
    vi.useFakeTimers();
    const { refresher, requests, statuses } = harness(5_000);
    const stalled = refresher.poll();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await stalled;
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(statuses).toEqual(['lost']);
    // The poll settled, so the next one is a new request rather than a join of the stalled one.
    void refresher.poll();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(2);
  });

  it('a synchronous throw from fetch is a failed request, not a stuck one', async () => {
    const statuses: Connection[] = [];
    let calls = 0;
    const refresher = createRefresher<string>({
      fetch: () => {
        calls++;
        throw new Error('bad url');
      },
      apply: () => undefined,
      status: (c) => statuses.push(c),
    });
    await refresher.poll();
    await refresher.poll();
    expect(calls).toBe(2);
    expect(statuses).toEqual(['lost', 'lost']);
  });
});
