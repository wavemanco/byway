import type { NextRequest } from 'next/server';
import { artifactResponse } from '../../../src/server/api.ts';
import { getServices } from '../../../src/services/index.ts';

/**
 * The artifact route. Generated pages are served from here with a strict CSP that sandboxes them (scripts
 * run, but in an opaque origin), and the app shows them in iframes with sandbox="allow-scripts" only.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/artifacts/[id]'>) {
  const { id } = await ctx.params;
  return artifactResponse(getServices(), id, request.nextUrl);
}
