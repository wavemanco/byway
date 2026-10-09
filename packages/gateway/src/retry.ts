import { GatewayError } from '@byway/contracts';
import type { ClassifiedError } from './errors.ts';

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
 * What a round trip may cost if it is sent again (ADR-0091): how many times an attempt that may have been billed
 * (billingOf 'maybe') is sent again. Every call site states its kind, so a new billable path cannot inherit blind retries.
 */
export interface RetryPolicy {
  maybeResends: number;
}

/** A completion or an image: a 'maybe' attempt is sent once more, so one reset does not fail the step. */
export const BILLABLE_CALL: RetryPolicy = { maybeResends: 1 };
/** A queue job submission (a fal clip, a frame extraction): never sent again after a 'maybe'; a second job is billed twice. */
export const BILLABLE_JOB: RetryPolicy = { maybeResends: 0 };
/** A read that bills nothing (a status poll, a result, an upload, a media download): retried whatever its billing. */
export const FREE_READ: RetryPolicy = { maybeResends: Number.POSITIVE_INFINITY };

/**
 * Run `fn`, retrying retryable GatewayErrors (429, 5xx, timeouts, network failures) with exponential backoff and full
 * jitter, so a burst of parallel candidates does not retry in lockstep. A provider's retry-after hint replaces the
 * backoff, capped. An attempt that may have been billed is sent again only as often as `policy` allows.
 * This is the gateway's one retry policy where it can be: the Anthropic, OpenAI and OpenRouter SDKs are built with their
 * retries off, and Google's SDK retries only when asked to. fal's SDK cannot be told: each of its queue calls passes its
 * own retry setting, which overrides the client's, so job submissions do not go through it at all (providers/fal.ts),
 * and its status, result and upload reads keep their own retries, which only repeat free reads.
 */
export async function withRetries<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions, policy: RetryPolicy): Promise<T> {
  let maybes = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const retryable = err instanceof GatewayError && err.retryable;
      if (!retryable || attempt + 1 >= opts.maxAttempts) throw err;
      if ((err as ClassifiedError).billing === 'maybe' && ++maybes > policy.maybeResends) throw err;
      const hint = (err as ClassifiedError).retryAfterMs;
      const backoff = Math.floor(opts.random() * opts.baseDelayMs * 2 ** attempt);
      await opts.sleep(Math.min(opts.maxDelayMs, hint ?? backoff));
    }
  }
}
