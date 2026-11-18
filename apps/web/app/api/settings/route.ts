import { updateSettings } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { SettingsPatch } from '../../../src/server/schemas.ts';

/**
 * The Store preferences as they are now, and byway's mode ('demo' while the mock answers every call), for a screen that
 * reads them again: the single-key shortcuts switch (B-188) and the demo banner (B-199).
 */
export async function GET() {
  return handle(async () => {
    const deps = await getDeps();
    return json({ ...(await deps.services.store.getPreferences(deps.workspaceId)), mode: deps.services.mode });
  });
}

/** Model profile, demo mode and the workspace budget. Keys are never read or written here. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const deps = await getDeps();
    const body = await parseBody(request, SettingsPatch, deps.heldKeyIn);
    if (!body.ok) return body.response;
    return json(await updateSettings(deps, body.data));
  });
}
