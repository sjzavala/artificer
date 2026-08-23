import { NextResponse, type NextRequest } from 'next/server';
import { accessCodeMatches, createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const limit = rateLimit(`gate:${ip}`, { limit: 8, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute and try again.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  let code = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === 'string' ? body.code : '';
  } catch {
    code = '';
  }

  if (!process.env.ARTIFICER_ACCESS_CODE) {
    console.error('[artificer] ARTIFICER_ACCESS_CODE is not set; refusing all access.');
    return NextResponse.json({ error: 'Access is not configured on this deployment.' }, { status: 503 });
  }

  if (!accessCodeMatches(code)) {
    // No hints: same message for empty, wrong length, and near-miss.
    return NextResponse.json({ error: 'That code was not accepted.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}
