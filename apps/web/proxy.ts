import { NextResponse, type NextRequest } from 'next/server';
import { checkRequest } from './src/server/guard.ts';

/**
 * Every request passes the local guard first: only loopback hosts (no DNS rebinding) and no cross-site
 * writes. See src/server/guard.ts.
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
