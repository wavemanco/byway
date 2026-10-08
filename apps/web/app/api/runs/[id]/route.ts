import type { NextRequest } from 'next/server';
import { HttpError } from '../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../src/server/deps.ts';
import { json } from '../../../../src/server/http.ts';
import { getRunData } from '../../../../src/server/run-data.ts';

/** What the Run screen polls: the run, its checkpoints, and the events after `after`. */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/runs/[id]'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const after = Number(request.nextUrl.searchParams.get('after') ?? 0);
    const { services } = await getDeps();
    if (!(await services.store.getRun(id))) throw new HttpError(404, 'Run not found.');
    return json(await getRunData(services, id, Number.isInteger(after) && after > 0 ? after : 0));
  });
}
