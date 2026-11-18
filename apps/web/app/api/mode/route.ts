import { getDeps, handle } from '../../../src/server/deps.ts';
import { json } from '../../../src/server/http.ts';

/**
 * byway's mode as it is now: 'demo' while the mock answers every call (demo mode on, no keys, or pnpm demo), 'live'
 * otherwise. The demo banner reads it again on each screen and while the tab is in view (B-199).
 */
export async function GET() {
  return handle(async () => {
    const deps = await getDeps();
    return json({ mode: deps.services.mode });
  });
}
