import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

/**
 * The gate. Every page and every API route is behind it except the gate itself
 * and Next's own static assets — a public URL that can spend API tokens has to
 * default to closed.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isGatePage = pathname === '/gate';
  const isGateApi = pathname === '/api/gate';
  if (isGateApi) return NextResponse.next();

  const authorised = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (authorised) {
    // A signed-in visitor has no reason to sit on the gate.
    if (isGatePage) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  if (isGatePage) return NextResponse.next();

  // API callers get a status they can act on; humans get the gate.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Access code required.' }, { status: 401 });
  }

  const gate = new URL('/gate', request.url);
  if (pathname !== '/') gate.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(gate);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
