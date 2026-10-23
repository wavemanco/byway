/**
 * The whole-call deadline of a call that is answered whole rather than streamed (the waits design of 2026-10-22,
 * section 2): a Google text call, and every OpenAI and Google image. Its model's wait covers the whole answer, so the
 * gateway hands each send of the call a Deadline at that wait (ProviderCompletionRequest.deadline,
 * ProviderImageRequest.deadline), and the adapter hands its signal to the SDK (Google's config.abortSignal, OpenAI's
 * request signal). When it aborts, the call is not sent again (waited.ts).
 *
 * It never carries the run's stop (section 5): it is not joined with SpendContext.operation.stop, as a stream's bound is
 * (StreamIdle), because ADR-0111 hands these calls no stop: a call cut off is still billed in full ("You will still be
 * charged usage", Google's SDK of an aborted call), and byway would only lose its cost. A Cancel leaves them running.
 */
export class Deadline {
  readonly signal: AbortSignal;
  /** How long the call may take in all: its model's wait. */
  readonly afterMs: number;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(afterMs: number) {
    const reached = new AbortController();
    this.signal = reached.signal;
    this.afterMs = afterMs;
    this.timer = setTimeout(() => reached.abort(), afterMs);
  }

  /** Whether the wait ran out before the call ended. */
  get expired(): boolean {
    return this.signal.aborted;
  }

  /** The call ended: the deadline is not needed any more. */
  end(): void {
    clearTimeout(this.timer);
  }
}
