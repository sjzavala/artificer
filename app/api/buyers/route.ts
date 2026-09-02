import { NextResponse, type NextRequest } from 'next/server';
import { getBuyerRepo } from '@/lib/buyers/db';
import { normalizeQuery } from '@/lib/buyers/queries';
import { repositoryFailure } from '@/lib/buyers/errors';

export const runtime = 'nodejs';

/**
 * Search and filter the buyer pipeline.
 *
 * Access is artificer's gate, applied in middleware — a buyer's equity and
 * contact details are commercially sensitive, and this is the same boundary the
 * deal workflow sits behind.
 */
export async function GET(request: NextRequest) {
  const query = normalizeQuery(request.nextUrl.searchParams);

  try {
    return NextResponse.json(await getBuyerRepo().search(query));
  } catch (error) {
    return repositoryFailure(error);
  }
}
