import { NextResponse } from 'next/server';
import { getDeal } from '@/lib/deals';
import { getBuyerRepo } from '@/lib/buyers/db';
import { repositoryFailure } from '@/lib/buyers/errors';
import { dealProfile, matchBuyers } from '@/lib/copilot/match';
import { MAX_LIMIT } from '@/lib/buyers/types';

export const runtime = 'nodejs';

/**
 * Who could take this deal.
 *
 * The same matching the copilot reaches for, on its own route so the review
 * screen can ask directly. It was only reachable by opening a chat and
 * phrasing a question, which meant the one thing the brokerage actually needs —
 * who do I call — depended on knowing the assistant existed.
 *
 * No model involved. Five comparisons in TypeScript, the same ones the copilot
 * gets back when it calls the tool.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const deal = await getDeal(id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const includeUnderContract = new URL(request.url).searchParams.get('includeUnderContract') === 'true';

  try {
    // The whole book: a match is a comparison against every buyer, and a near
    // miss is only visible if the buyer was scored in the first place.
    const { results } = await getBuyerRepo().search({
      q: '',
      status: null,
      capitalSource: null,
      market: null,
      propertyType: null,
      minGuarantor: null,
      minEquity: null,
      identifyWithinDays: null,
      sortBy: 'id',
      page: 1,
      limit: MAX_LIMIT,
    });

    return NextResponse.json(matchBuyers(dealProfile(deal), results, { includeUnderContract }));
  } catch (error) {
    return repositoryFailure(error);
  }
}
