import { NextResponse } from 'next/server';
import { getBorrowerRepo } from '@/lib/borrower-search/db';
import { repositoryFailure } from '@/lib/borrower-search/errors';
import { parseBorrowerId } from '@/lib/borrower-search/queries';

export const runtime = 'nodejs';

/** One borrower. Replaces `GET /api/borrowers/:id`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const borrowerId = parseBorrowerId(id);
  if (borrowerId === null) {
    return NextResponse.json({ error: 'Borrower not found.' }, { status: 404 });
  }

  try {
    const borrower = await getBorrowerRepo().byId(borrowerId);
    if (!borrower) return NextResponse.json({ error: 'Borrower not found.' }, { status: 404 });
    return NextResponse.json(borrower);
  } catch (error) {
    return repositoryFailure(error);
  }
}
