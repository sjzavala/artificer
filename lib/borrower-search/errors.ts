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
  console.error(`[artificer] borrower search failed: ${message}`);

  if (/relation "borrowers" does not exist/i.test(message)) {
    return NextResponse.json(
      { error: 'The borrower table has not been created yet. Run `npm run seed-borrowers`.' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: 'Could not reach the borrower database. Check DATABASE_URL on the server.' },
    { status: 503 },
  );
}
