import type { NextRequest } from 'next/server';
import { artifactResponse } from '../../../src/server/api.ts';
import { getServices } from '../../../src/services/index.ts';

/**
 * The artifact route. Generated pages are served from here with a strict CSP that sandboxes them: inert (no scripts,
 * an opaque origin) unless one of the app's own frames asks for `?scripts=1` after the person turned scripts on for
 * that page, which the request's Fetch Metadata shows (src/server/artifacts.ts, F05). The app opens pages for people
 * at /view/<id>, never here.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/artifacts/[id]'>) {
  const { id } = await ctx.params;
  // proxy.ts has already refused any Host that is not this computer's loopback address.
  const host = request.headers.get('host');
  const origin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
  return artifactResponse(await getServices(), id, request.nextUrl, origin, 'artifacts', request.headers);
}
