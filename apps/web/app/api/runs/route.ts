import { startRun } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { StartInput } from '../../../src/server/schemas.ts';

/** Start a run of a library or composed recipe with a budget. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseBody(request, StartInput);
    if (!body.ok) return body.response;
    return json(await startRun(await getDeps(), body.data), 201);
  });
}
