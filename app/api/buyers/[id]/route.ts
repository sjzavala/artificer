import { NextResponse } from 'next/server';
import { getBuyerRepo } from '@/lib/buyers/db';
import { parseBuyerId } from '@/lib/buyers/queries';
import { repositoryFailure } from '@/lib/buyers/errors';

export const runtime = 'nodejs';

/** One buyer. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buyerId = parseBuyerId(id);
  if (buyerId === null) {
    return NextResponse.json({ error: 'Buyer not found.' }, { status: 404 });
  }

  try {
    const buyer = await getBuyerRepo().byId(buyerId);
    if (!buyer) return NextResponse.json({ error: 'Buyer not found.' }, { status: 404 });
    return NextResponse.json(buyer);
  } catch (error) {
    return repositoryFailure(error);
  }
}
