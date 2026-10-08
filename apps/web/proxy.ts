import { NextResponse, type NextRequest } from 'next/server';
import { checkRequest } from './src/server/guard.ts';

/**
 * The local guard (src/server/guard.ts): only loopback hosts (no DNS rebinding) and no cross-site writes, on every
 * request the app serves, its static files and image endpoint included.
 *
 * Under `next start` (`pnpm start`, `pnpm demo`) this is the whole guard. Under `next dev` it is not: next dev answers
 * its own internal endpoints (`/__nextjs_*`, the HMR WebSocket) before this runs, so contributor mode (`pnpm dev`)
 * runs the Next app inside a server of byway's own that applies the same guard to everything first, and is the only
 * thing listening (src/server/dev-server.ts). Never run `next dev` on its own.
 */
export function proxy(request: NextRequest) {
  const result = checkRequest({
    method: request.method,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};
