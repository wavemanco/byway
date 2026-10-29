import type { NextRequest } from 'next/server';
import { HttpError, questionCosts, unusedAnswersOf } from '../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../src/server/deps.ts';
import { json } from '../../../../src/server/http.ts';
import { getRunData } from '../../../../src/server/run-data.ts';

/**
 * What the Run screen polls: the run, its checkpoints, the events after `after`, what its open questions would cost, and
 * once it has finished, the answers of yours it left unused (F01 (a)).
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/runs/[id]'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const after = Number(request.nextUrl.searchParams.get('after') ?? 0);
    const deps = await getDeps();
    if (!(await deps.services.store.getRun(id))) throw new HttpError(404, 'Run not found.');
    return json(await getRunData(deps.services, id, Number.isInteger(after) && after > 0 ? after : 0, (run, cps) => questionCosts(deps, run, cps), (run) => unusedAnswersOf(deps, run)));
  });
}
