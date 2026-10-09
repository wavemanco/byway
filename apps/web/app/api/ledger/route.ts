import { checkLedger } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json } from '../../../src/server/http.ts';

/** Settings' "Check the spend ledger": whether the ledger's hash chain and head are intact, in words (ADR-0091). */
export async function GET() {
  return handle(async () => json(await checkLedger(await getDeps())));
}
