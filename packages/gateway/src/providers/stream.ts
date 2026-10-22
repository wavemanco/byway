/**
 * What the streamed chat calls share (ADR-0111): Anthropic's, OpenAI's and OpenRouter's are streamed, so a stop can close
 * them, and so each needs a bound of its own on a stream that stalls.
 */

/**
 * How long a streamed answer may go without a chunk before byway reads it as stalled: ten minutes, the request timeout
 * the OpenAI and Anthropic SDKs default to (DEFAULT_TIMEOUT, 600,000 ms, in openai 7.28.0 and @anthropic-ai/sdk 0.131.0).
 * Both SDKs clear that timeout once the response headers arrive, so without this a stream that stalls after its 200
 * waits for its step's timeout (15 minutes), and its connection stays open after the step is given up.
 * - OpenAI and OpenRouter: unstreamed, the SDK's timeout bounded the whole call at ten minutes, so this is no stricter.
 * - Anthropic: its calls were streamed, with no bound, before this. Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 leave their
 *   thinking out of the stream by default (`thinking.display` "omitted", the claude-api reference, read 2026-10-22), so
 *   a model that is thinking sends only pings, which the SDK does not pass on: a think that sends nothing for ten
 *   minutes is read as a stall. At the SDK's own planning rate (128,000 output tokens an hour, its
 *   calculateNonstreamingTimeout) ten minutes is about 21,000 tokens, more than byway's default allowance of 16,000; a
 *   call asked again at 32,000 or 64,000 after a cut-short answer could think that long.
 */
export const STREAM_IDLE_MS = 600_000;

/**
 * A streamed call's bound on stalling (STREAM_IDLE_MS). `signal` is what the SDK is handed: it aborts when the call's
 * stop does (ADR-0111), and when the stream has gone STREAM_IDLE_MS without a chunk since restart() was last called. The
 * wait starts at the first restart(), once the response has begun (until then the SDK's own timeout applies), and starts
 * again at every chunk, so only a stream that has stalled is closed, never a long one that keeps sending. end() stops it.
 */
export class StreamIdle {
  readonly signal: AbortSignal;
  private readonly idle = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(stop: AbortSignal | undefined) {
    this.signal = stop ? AbortSignal.any([stop, this.idle.signal]) : this.idle.signal;
  }

  /** Whether the bound closed the stream. A caller asks its stop first: a stop that also came is what ended the call. */
  get stalled(): boolean {
    return this.idle.signal.aborted;
  }

  /** The response began, or a chunk came: the wait starts again. */
  restart(): void {
    if (this.idle.signal.aborted) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.idle.abort(), STREAM_IDLE_MS);
  }

  end(): void {
    clearTimeout(this.timer);
  }
}

/** What a stalled stream's error says happened, after `count` chunks (OpenAI, OpenRouter) or events (Anthropic). */
export const stalledDetail = (count: number, what: 'chunk' | 'event'): string => `nothing came for ${STREAM_IDLE_MS / 60_000} minutes, after ${count} ${what}${count === 1 ? '' : 's'}`;

/**
 * A stream that ended without a whole answer, though the provider had answered 200 and may have billed what it made: one
 * that stalled (StreamIdle) and, for OpenAI and OpenRouter, an error chunk mid-stream (OpenRouter's streaming page: the
 * HTTP status stays 200 once headers are sent, and a choice finishes with "error"; the SDK raises the chunk's error) or
 * no finishing chunk at all. Stated as "may have been billed", so nothing reads it as a provider's refusal of the work,
 * and in the words billingOf's reading of an early end recognises, so the gateway sends it once more at most, as for a
 * lost answer (ADR-0091).
 */
export function streamEndedEarly(provider: string, detail: string, cause?: unknown): Error {
  return Object.assign(new Error(`${provider}'s stream ended without producing a whole answer (${detail})`, cause === undefined ? {} : { cause }), { billing: 'maybe' as const });
}
