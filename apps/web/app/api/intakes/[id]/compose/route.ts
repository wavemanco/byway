import { composeCommand } from '../../../../../src/server/api.ts';
import { getDeps, handle } from '../../../../../src/server/deps.ts';
import { json, parseBody } from '../../../../../src/server/http.ts';
import { ComposeInput } from '../../../../../src/server/schemas.ts';

/**
 * "Build my own": compose a recipe for the problem (design time only, ADR-0058). Answers with `{ composed,
 * remainingUsd }`, everything the Recommendation screen shows that it changes (ADR-0082). Its body is the mode the
 * screen showed, `{ demo }`, which byway checks is still its own (B-199).
 */
export async function POST(request: Request, ctx: RouteContext<'/api/intakes/[id]/compose'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deps = await getDeps();
    const body = await parseBody(request, ComposeInput, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await composeCommand(deps, id, body.data));
  });
}
