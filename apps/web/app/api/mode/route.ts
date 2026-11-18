import { runUsesRealModels } from '../../../src/server/api.ts';
import { handle } from '../../../src/server/deps.ts';
import { json } from '../../../src/server/http.ts';
import { getContext } from '../../../src/services/index.ts';

/**
 * byway's mode as it is now: 'demo' while the mock answers every call (demo mode on, no keys, or pnpm demo), 'live'
 * otherwise. The demo banner reads it again on each screen and while the tab is in view (B-199). With `?run=<id>`, as
 * on a run's screen, it also says whether that run uses real models although demo mode is on (runUsesRealModels).
 */
export async function GET(request: Request) {
  return handle(async () => {
    const context = await getContext();
    const runId = new URL(request.url).searchParams.get('run');
    if (!runId) return json({ mode: context.services.mode });
    return json({ mode: context.services.mode, runUsesRealModels: runUsesRealModels(context, await context.services.store.getRun(runId)) });
  });
}
