import { updateRenderer } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { RendererPatch } from '../../../src/server/schemas.ts';

/** Settings' Page renderer switch: the OS sandbox on or off (ADR-0105). Settings asks before it sends off. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const deps = await getDeps();
    const body = await parseBody(request, RendererPatch, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await updateRenderer(deps, body.data));
  });
}
