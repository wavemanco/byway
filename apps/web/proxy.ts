import { NextResponse, type NextRequest } from 'next/server';
import { checkAccess, checkRequest } from './src/server/guard.ts';
import { refusalPage } from './src/server/refusal-page.ts';

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
  // Then the per-start secret (B-188): the start link sets the access cookie, and every other request must carry it.
  const access = checkAccess({
    path: request.nextUrl.pathname,
    linkKey: request.nextUrl.searchParams.get('key'),
    cookieHeader: request.headers.get('cookie'),
    key: process.env.BYWAY_ACCESS_KEY,
  });
  if (access.ok === 'open') {
    const res = NextResponse.redirect(new URL(access.location, request.url), 303);
    res.headers.append('Set-Cookie', access.setCookie);
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer');
    return res;
  }
  if (!access.ok) {
    if ((request.headers.get('accept') ?? '').includes('text/html')) {
      return new NextResponse(refusalPage(access.message), { status: access.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: access.message }, { status: access.status, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};
