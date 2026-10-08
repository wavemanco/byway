import type { NextRequest } from 'next/server';
import { artifactResponse } from '../../../../src/server/api.ts';
import { getServices } from '../../../../src/services/index.ts';

/**
 * Generated media at the address the runner hands the model (spec §3.3: images are served from the artifact store at
 * `/api/artifacts/<id>`), so a generated page's images load inside its sandboxed frame and a Markdown result's images
 * load on the Result screen. Media only, with the artifact route's headers (next.config.ts leaves this path alone):
 * pages are never served here, and SVG is a download (see mediaServing).
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/artifacts/[id]'>) {
  const { id } = await ctx.params;
  // proxy.ts has already refused any Host that is not this computer's loopback address.
  const host = request.headers.get('host');
  const origin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
  return artifactResponse(await getServices(), id, request.nextUrl, origin, 'media');
}
