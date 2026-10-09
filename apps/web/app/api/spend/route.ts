import { spendAction, spendRecords } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { SpendAction } from '../../../src/server/schemas.ts';

/** Settings' "Spending records" (ADR-0095): what the spend book holds that needs the person's attention. */
export async function GET() {
  return handle(async () => json(await spendRecords(await getDeps())));
}

/** Clear calls that may have been billed, or acknowledge a line of the ledger the spend book could not read. */
export async function POST(request: Request) {
  return handle(async () => {
    const deps = await getDeps();
    const body = await parseBody(request, SpendAction, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await spendAction(deps, body.data));
  });
}
