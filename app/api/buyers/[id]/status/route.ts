import { NextResponse } from 'next/server';
import { getBuyerRepo } from '@/lib/buyers/db';
import { parseBuyerId } from '@/lib/buyers/queries';
import { repositoryFailure } from '@/lib/buyers/errors';
import { recordAudit } from '@/lib/audit';
import { BUYER_STATUSES, isBuyerStatus } from '@/shared/buyer';

export const runtime = 'nodejs';

/**
 * Move a buyer through the pipeline — the one write in this feature.
 *
 * It is recorded in the audit log, which is not decoration. Artificer's claim
 * is that every action has a name and a timestamp against it, and a feature
 * that quietly exempted itself would make that claim false rather than
 * partial. Marking a buyer `closed` is exactly the sort of thing someone asks
 * about a month later.
 *
 * The entry carries `dealId: null`: this concerns a buyer, not a deal. The
 * audit log admits subjects other than deals precisely so a second feature does
 * not have to invent its own log.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buyerId = parseBuyerId(id);
  if (buyerId === null) {
    return NextResponse.json({ error: 'Buyer not found.' }, { status: 404 });
  }

  let body: { status?: unknown; actor?: unknown };
  try {
    body = (await request.json()) as { status?: unknown; actor?: unknown };
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (!isBuyerStatus(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${BUYER_STATUSES.join(', ')}.` },
      { status: 400 },
    );
  }

  const actor =
    typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Unnamed reviewer';

  try {
    const repo = getBuyerRepo();

    // Read first, so the log can say what the status changed *from*. An entry
    // recording only the new value cannot answer "who moved this off active",
    // which is the question people actually ask.
    const before = await repo.byId(buyerId);
    if (!before) return NextResponse.json({ error: 'Buyer not found.' }, { status: 404 });

    if (before.status === body.status) {
      return NextResponse.json({ buyer: before, unchanged: true });
    }

    const updated = await repo.updateStatus(buyerId, body.status);
    if (!updated) return NextResponse.json({ error: 'Buyer not found.' }, { status: 404 });

    await recordAudit({
      dealId: null,
      actor,
      action: 'buyer_status_changed',
      summary: `${updated.entityName} moved from ${before.status} to ${updated.status}`,
      details: {
        buyerId: updated.id,
        entityName: updated.entityName,
        from: before.status,
        to: updated.status,
      },
    });

    return NextResponse.json({ buyer: updated });
  } catch (error) {
    return repositoryFailure(error);
  }
}
