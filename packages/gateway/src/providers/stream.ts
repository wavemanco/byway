/**
 * What the streamed chat calls share (ADR-0111): Anthropic's, OpenAI's and OpenRouter's are streamed, so a stop can close
 * them, and so each needs a bound of its own on a stream that stalls.
 */

/**
 * How long a streamed answer may go without a chunk before byway reads it as stalled: fifteen minutes, a model step's
 * own limit. The owner chose it on 2026-10-22, "In Block 2, 15 meanwhile (Recommended)", until block 2 lets each model
 * have its own wait, chosen in Settings, and raises the steps' limits so the chosen wait governs (ADR-0111's Later
 * notes). A call in a step whose own limit is longer (an image or video step's 45 minutes: an ASSET step's briefs and
 * integrate calls, a relay link's call) waits that long instead (SpendContext.operation.stepLimitMs; B1R2-CODE-3, the
 * re-check of block 1's second fix round), as the owner chose on 2026-10-22, "45 minutes for calls in media steps
 * (Recommended)", until block 2's per-model waits replace both. The OpenAI and Anthropic SDKs clear their own request
 * timeout (DEFAULT_TIMEOUT, ten minutes, in openai 7.28.0 and @anthropic-ai/sdk 0.131.0) once the response headers
 * arrive, so without this bound a stream that stalls after its 200 keeps its connection open after its step is given up.
 * - Anthropic: Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 leave their thinking out of the stream by default
 *   (`thinking.display` "omitted", the claude-api reference, read 2026-10-22), so a model that is thinking sends only
 *   pings, which the SDK does not pass on. Since a call waits at least its step's own limit, no think is cut off before
 *   its step would end.
 * - OpenAI and OpenRouter: unstreamed, the SDK's timeout bounded the whole call at ten minutes; streamed, a stretch of
 *   up to fifteen minutes with nothing arriving (45 in a media step) is allowed, and the whole call is bounded by its
 *   step.
 */
export const STREAM_IDLE_MS = 900_000;

/**
 * A streamed call's bound on stalling: `afterMs`, the request's own (ProviderCompletionRequest.streamIdleMs: the longer
 * of STREAM_IDLE_MS and its step's limit), or STREAM_IDLE_MS when it gives none. `signal` is what the SDK is handed: it
 * aborts when the call's stop does (ADR-0111), and when the stream has gone `afterMs` without a chunk since restart() was
 * last called. The wait starts at the first restart(), once the response has begun (until then the SDK's own timeout
 * applies), and starts again at every chunk, so only a stream that has stalled is closed, never a long one that keeps
 * sending. end() stops it.
 */
export class StreamIdle {
  readonly signal: AbortSignal;
  /** How long the stream may go without a chunk before it is closed as stalled. */
  readonly afterMs: number;
  private readonly idle = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(stop: AbortSignal | undefined, afterMs: number = STREAM_IDLE_MS) {
    this.signal = stop ? AbortSignal.any([stop, this.idle.signal]) : this.idle.signal;
    this.afterMs = afterMs;
  }

  /** Whether the bound closed the stream. A caller asks its stop first: a stop that also came is what ended the call. */
  get stalled(): boolean {
    return this.idle.signal.aborted;
  }

  /** The response began, or a chunk came: the wait starts again. */
  restart(): void {
    if (this.idle.signal.aborted) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.idle.abort(), this.afterMs);
  }

  end(): void {
    clearTimeout(this.timer);
  }
}

/**
 * What a stalled stream's error says happened: the bound its StreamIdle used (`afterMs`, so a call in a media step says
 * "nothing came for 45 minutes"), after `count` chunks (OpenAI, OpenRouter) or events (Anthropic).
 */
export const stalledDetail = (count: number, what: 'chunk' | 'event', afterMs: number): string => `nothing came for ${afterMs / 60_000} minutes, after ${count} ${what}${count === 1 ? '' : 's'}`;

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
