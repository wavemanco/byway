import { resolveInRun } from '../../../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../../../src/server/deps.ts';
import { json, parseBody } from '../../../../../../src/server/http.ts';
import { ResolutionInput } from '../../../../../../src/server/schemas.ts';

/** Your turn: answer an open question of this run. */
export async function POST(request: Request, ctx: RouteContext<'/api/runs/[id]/checkpoints/[checkpointId]'>) {
  return handle(async () => {
    const { id, checkpointId } = await ctx.params;
    const deps = await getDeps();
    const body = await parseBody(request, ResolutionInput, deps.heldKeyIn);
    if (!body.ok) return body.response;
    await resolveInRun(deps, id, checkpointId, body.data);
    return json({ ok: true });
  });
}
