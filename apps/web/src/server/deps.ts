/** Wiring for route handlers and server components: the services and the request's workspace and profile. */
import { isEngineUnavailable } from '../services/engine-runner.ts';
import { getContext } from '../services/index.ts';
import { HttpError, type Deps } from './api.ts';
import { fail, json } from './http.ts';

export async function getDeps(): Promise<Deps> {
  const { services, workspaceId, profileId, heldKeyIn, questionEstimates, pricesCheckedOn, modelWaits } = await getContext();
  return { services, workspaceId, profileId, heldKeyIn, questionEstimates, pricesCheckedOn, modelWaits };
}

/**
 * Runs a handler body; HttpErrors become their status, an unreachable run engine a 503 that says how to start it, and
 * anything else a 500 that reveals no internals.
 */
export async function handle(body: () => Promise<Response>): Promise<Response> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof HttpError) return err.body ? json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...err.body }, err.status) : fail(err.status, err.message, err.code);
    if (isEngineUnavailable(err)) return fail(503, (err as Error).message);
    console.error(err);
    return fail(500, 'Something went wrong inside byway. Try again.');
  }
}
