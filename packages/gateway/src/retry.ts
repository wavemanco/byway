import { GatewayError } from '@byway/contracts';

export interface RetryOptions {
  /** Total attempts, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
  /** Injected for deterministic tests; Math.random in production. */
  random: () => number;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/**
 * Run `fn`, retrying retryable GatewayErrors (429, 5xx, timeouts) with exponential backoff and full jitter, so a burst
 * of parallel candidates does not retry in lockstep. A provider's retry-after hint replaces the backoff, capped.
 * The SDKs' own retries are switched off when the gateway builds their clients, so there is one retry policy.
 */
export async function withRetries<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const retryable = err instanceof GatewayError && err.retryable;
      if (!retryable || attempt + 1 >= opts.maxAttempts) throw err;
      const hint = (err as GatewayError & { retryAfterMs?: number }).retryAfterMs;
      const backoff = Math.floor(opts.random() * opts.baseDelayMs * 2 ** attempt);
      await opts.sleep(Math.min(opts.maxDelayMs, hint ?? backoff));
    }
  }
}
