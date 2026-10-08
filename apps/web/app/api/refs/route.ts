import { addRef } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { RefInput } from '../../../src/server/schemas.ts';

/** "Examples you admire": store one pasted text or image before a run starts (ADR-0071). */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseBody(request, RefInput);
    if (!body.ok) return body.response;
    return json(await addRef(await getDeps(), body.data), 201);
  });
}
