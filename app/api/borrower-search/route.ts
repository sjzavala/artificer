import { NextResponse, type NextRequest } from 'next/server';
import { getBorrowerRepo } from '@/lib/borrower-search/db';
import { normalizeQuery } from '@/lib/borrower-search/queries';
import { repositoryFailure } from '@/lib/borrower-search/errors';

export const runtime = 'nodejs';

/**
 * Search, filter and page the borrower book.
 *
 * Replaces `GET /api/borrowers` from the Express sandbox. Access is artificer's
 * gate, applied in middleware — there is no per-role authorisation here, which
 * is the deliberate simplification the integration made: one gate, and everyone
 * through it sees the same thing.
 *
 * The sandbox delayed this response on a curve that made shorter queries
 * *slower*, so an earlier request could land after a later one. That delay was
 * load-bearing scaffolding for a flake demo in another repository; here it is
 * simply gone, and the client guards its own request ordering besides.
 */
export async function GET(request: NextRequest) {
  const query = normalizeQuery(request.nextUrl.searchParams);

  try {
    return NextResponse.json(await getBorrowerRepo().search(query));
  } catch (error) {
    return repositoryFailure(error);
  }
}
