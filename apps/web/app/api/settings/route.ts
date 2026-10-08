import { updateSettings } from '../../../src/server/api.ts';
import { getDeps, handle } from '../../../src/server/deps.ts';
import { json, parseBody } from '../../../src/server/http.ts';
import { SettingsPatch } from '../../../src/server/schemas.ts';

/** Model profile, demo mode and the workspace budget. Keys are never read or written here. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const body = await parseBody(request, SettingsPatch);
    if (!body.ok) return body.response;
    return json(await updateSettings(await getDeps(), body.data));
  });
}
