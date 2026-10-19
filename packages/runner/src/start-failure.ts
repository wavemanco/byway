/**
 * Why a run could not start, in plain words (OPS-2). The RunRecord is written before the workflow starts, so a start
 * that fails leaves a failed run in History; its error should say what happened, not quote a gRPC status. When the
 * engine was not reachable, nothing ran and nothing was spent, and the person is told so.
 *
 * A start can also fail after Temporal accepted it (B1, ADR-0109): its reply timed out (gRPC 4, DEADLINE_EXCEEDED), or
 * another delivery of the same Start got there first. So the client asks Temporal for the workflow before it marks the
 * run failed (client.ts), and
 * says here what that found: Temporal has no such workflow ('absent'), or byway could not ask ('unknown'). A timeout is
 * not read as the engine being down: with no answer from Temporal, byway cannot say the run did not start, or that
 * nothing was spent.
 *
 * Client-safe: no worker, test server or Node-only engine code. apps/web keeps its own copy of the transport check
 * (services/engine-runner.ts) because it loads engine packages only at run time, outside its bundle.
 */

/** The run's error when the workflow could not be started because byway's engine was not there. */
export const ENGINE_DOWN_AT_START = "byway's run engine was not running, so this run did not start. Nothing was spent. Restart byway and start it again.";

/** The run's error when the start timed out and Temporal has no workflow for it: it never started. */
export const ENGINE_SLOW_AT_START = "byway's run engine did not answer in time, so this run did not start. Nothing was spent. Start it again.";

/**
 * What follows "byway cannot tell whether this run started". The run is marked failed, so the gateway refuses its next
 * calls (liveness.ts), and spend that lands after that still shows on the run.
 */
const UNCONFIRMED = 'It makes no new AI calls now. One already under way may still be charged, and its cost shows on this run. Start it again.';

/** The run's error when the start timed out and byway could not ask Temporal whether its workflow exists. */
export const ENGINE_SLOW_UNCONFIRMED = `byway's run engine did not answer in time, so byway cannot tell whether this run started. ${UNCONFIRMED}`;

/** What Temporal said when asked for the run's workflow after its start failed (client.ts): none, or no answer. */
export type WorkflowAfterFailedStart = 'absent' | 'unknown';

/** gRPC status codes that mean the server was not there: 14 UNAVAILABLE. */
const TRANSPORT_CODES: ReadonlySet<number> = new Set([14]);
const TRANSPORT_TEXT = /\bECONNREFUSED\b|\bECONNRESET\b|\b14 UNAVAILABLE\b|No connection established/;
/** gRPC 4 DEADLINE_EXCEEDED: the call ran out of time, which says nothing about whether the server did what it asked. */
const TIMEOUT_CODE = 4;
const TIMEOUT_TEXT = /\b4 DEADLINE_EXCEEDED\b/;

/** The error and its causes, outermost first, at most 8 deep. */
function* chain(err: unknown): Generator<Error> {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 8; e = e.cause, depth++) yield e;
}

/** True when an error, or anything in its cause chain, says the engine could not be reached. */
export function isTransportFailure(err: unknown): boolean {
  for (const e of chain(err)) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'number' && TRANSPORT_CODES.has(code)) return true;
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return true;
    if (TRANSPORT_TEXT.test(e.message)) return true;
  }
  return false;
}

/** True when an error, or anything in its cause chain, is a gRPC timeout (4 DEADLINE_EXCEEDED). */
export function isTimeout(err: unknown): boolean {
  for (const e of chain(err)) {
    if ((e as { code?: unknown }).code === TIMEOUT_CODE || TIMEOUT_TEXT.test(e.message)) return true;
  }
  return false;
}

export function startFailureMessage(err: unknown, workflow: WorkflowAfterFailedStart): string {
  if (isTransportFailure(err)) return ENGINE_DOWN_AT_START;
  if (isTimeout(err)) return workflow === 'absent' ? ENGINE_SLOW_AT_START : ENGINE_SLOW_UNCONFIRMED;
  const detail = err instanceof Error ? err.message : String(err);
  if (workflow === 'absent') return `The run could not be started: ${detail}`;
  return `The run's start failed (${detail}), so byway cannot tell whether this run started. ${UNCONFIRMED}`;
}
