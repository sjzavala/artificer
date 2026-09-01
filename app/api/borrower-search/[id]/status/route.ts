import { NextResponse } from 'next/server';
import { getBorrowerRepo } from '@/lib/borrower-search/db';
import { repositoryFailure } from '@/lib/borrower-search/errors';
import { parseBorrowerId } from '@/lib/borrower-search/queries';
import { BORROWER_STATUSES, isBorrowerStatus } from '@/lib/borrower-search/types';

export const runtime = 'nodejs';

/**
 * Change a borrower's status — the one write in the feature.
 *
 * In the sandbox this was the only role-gated endpoint: an analyst got a
 * read-only table, an underwriter got a working control. Dropping roles in
 * favour of artificer's single gate means anyone through the gate can write
 * here. That is a real reduction in privilege separation, and it is the
 * documented trade of the integration rather than an oversight.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const borrowerId = parseBorrowerId(id);
  if (borrowerId === null) {
    return NextResponse.json({ error: 'Borrower not found.' }, { status: 404 });
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (!isBorrowerStatus(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${BORROWER_STATUSES.join(', ')}.` },
      { status: 400 },
    );
  }

  try {
    const updated = await getBorrowerRepo().updateStatus(borrowerId, body.status);
    if (!updated) return NextResponse.json({ error: 'Borrower not found.' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return repositoryFailure(error);
  }
}
