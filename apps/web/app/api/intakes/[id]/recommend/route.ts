import { recommendIntake } from '../../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../../src/server/deps.ts';
import { json, parseBody } from '../../../../../src/server/http.ts';
import { AnswersInput } from '../../../../../src/server/schemas.ts';

/** Re-run routing with the chooser answers as the person left them. */
export async function POST(request: Request, ctx: RouteContext<'/api/intakes/[id]/recommend'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deps = await getDeps();
    const body = await parseBody(request, AnswersInput, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await recommendIntake(deps, id, body.data.answers));
  });
}
