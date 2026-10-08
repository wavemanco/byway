import { createIntake } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { ProblemInput } from '../../../src/server/schemas.ts';

/** Start: keep the problem and return an id for the Recommendation screen. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseBody(request, ProblemInput);
    if (!body.ok) return body.response;
    return json(await createIntake(await getDeps(), body.data), 201);
  });
}
