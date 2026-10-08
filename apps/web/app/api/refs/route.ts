import { addRef } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { RefInput } from '../../../src/server/schemas.ts';

/** "Examples you admire": store one pasted text or image before a run starts (ADR-0071). */
export async function POST(request: Request) {
  return handle(async () => {
    const deps = await getDeps();
    const body = await parseBody(request, RefInput, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await addRef(deps, body.data), 201);
  });
}
