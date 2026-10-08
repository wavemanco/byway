import { composeIntake } from '../../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../../src/server/deps.ts';
import { json } from '../../../../../src/server/http.ts';

/** "Build my own": compose a recipe for the problem (design time only, ADR-0058). */
export async function POST(_request: Request, ctx: RouteContext<'/api/intakes/[id]/compose'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json(await composeIntake(await getDeps(), id));
  });
}
