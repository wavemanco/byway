import { controlRun } from '../../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../../src/server/deps.ts';
import { json, parseBody } from '../../../../../src/server/http.ts';
import { ControlInput } from '../../../../../src/server/schemas.ts';

/** Pause, resume or cancel a run. */
export async function POST(request: Request, ctx: RouteContext<'/api/runs/[id]/control'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await parseBody(request, ControlInput);
    if (!body.ok) return body.response;
    await controlRun(await getDeps(), id, body.data.action);
    return json({ ok: true });
  });
}
