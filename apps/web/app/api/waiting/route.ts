import { getDeps, handle } from '../../../src/server/deps.ts';
import { json } from '../../../src/server/http.ts';
import { waitingRunCount } from '../../../src/view/run.ts';

/** How many runs are waiting for you, for the History badge in the header. */
export async function GET() {
  return handle(async () => {
    const { services, workspaceId } = await getDeps();
    return json({ count: waitingRunCount(await services.store.openCheckpoints(workspaceId)) });
  });
}
