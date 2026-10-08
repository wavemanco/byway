/**
 * Why a run could not start, in plain words (OPS-2). The RunRecord is written before the workflow starts, so a start
 * that fails leaves a failed run in History; its error should say what happened, not quote a gRPC status. When the
 * engine was not reachable, nothing ran and nothing was spent, and the person is told so.
 *
 * Client-safe: no worker, test server or Node-only engine code. apps/web keeps its own copy of the transport check
 * (services/engine-runner.ts) because it loads engine packages only at run time, outside its bundle.
 */

/** The run's error when the workflow could not be started because byway's engine was not there. */
export const ENGINE_DOWN_AT_START = "byway's run engine was not running, so this run did not start. Nothing was spent. Restart byway and start it again.";

/** gRPC status codes that mean the server was not there: 14 UNAVAILABLE, 4 DEADLINE_EXCEEDED. */
const TRANSPORT_CODES: ReadonlySet<number> = new Set([14, 4]);
const TRANSPORT_TEXT = /\bECONNREFUSED\b|\bECONNRESET\b|\b14 UNAVAILABLE\b|No connection established/;

/** True when an error, or anything in its cause chain, says the engine could not be reached. */
export function isTransportFailure(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 8; e = e.cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'number' && TRANSPORT_CODES.has(code)) return true;
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return true;
    if (TRANSPORT_TEXT.test(e.message)) return true;
  }
  return false;
}

export function startFailureMessage(err: unknown): string {
  if (isTransportFailure(err)) return ENGINE_DOWN_AT_START;
  return `The run could not be started: ${err instanceof Error ? err.message : String(err)}`;
}
