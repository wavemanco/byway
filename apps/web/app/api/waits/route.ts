import { updateAnswerWait } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { AnswerWaitPatch } from '../../../src/server/schemas.ts';

/** Settings' "How long to wait for an answer": one model's wait, checked against the minutes its kind offers. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const deps = await getDeps();
    const body = await parseBody(request, AnswerWaitPatch, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await updateAnswerWait(deps, body.data));
  });
}
