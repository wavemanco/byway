import { recommendCommand } from '../../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../../src/server/deps.ts';
import { json, parseBody } from '../../../../../src/server/http.ts';
import { RecommendInput } from '../../../../../src/server/schemas.ts';

/**
 * The Recommendation screen's two recommend commands (ADR-0082): `{ answers }` re-runs routing with the chooser answers
 * as the person left them; `{ ensure: true }` is "Try again", which returns the stored recommendation or makes the
 * first one. Both answer with `{ recommendation, remainingUsd }`, everything the screen shows that they change.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/intakes/[id]/recommend'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deps = await getDeps();
    const body = await parseBody(request, RecommendInput, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await recommendCommand(deps, id, body.data));
  });
}
