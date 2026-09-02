import { NextResponse } from 'next/server';

/**
 * Turns a repository failure into something an operator can act on.
 *
 * An unreachable database and an unseeded one both surface as an opaque 500
 * otherwise, and "something went wrong" sends people to the wrong place. The
 * detail goes to the server log; the client gets one actionable sentence.
 */
export function repositoryFailure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[artificer] buyer pipeline failed: ${message}`);

  if (/relation "buyers" does not exist/i.test(message)) {
    return NextResponse.json(
      { error: 'The buyer table has not been created yet. Run `npm run seed-buyers`.' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: 'Could not reach the buyer database. Check DATABASE_URL on the server.' },
    { status: 503 },
  );
}
