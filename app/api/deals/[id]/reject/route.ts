import { NextResponse, type NextRequest } from 'next/server';
import { getDeal, putDeal } from '@/lib/deals';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { actor?: string; reason?: string };
  const reason = body.reason?.trim() ?? '';
  const actor = body.actor?.trim() || 'Unnamed reviewer';

  // A rejection without a reason is not an audit trail, it is a dead end.
  if (reason.length < 3) {
    return NextResponse.json({ error: 'Give a reason for the rejection.' }, { status: 400 });
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: 'That reason is too long.' }, { status: 400 });
  }

  deal.status = 'rejected';
  deal.rejection = { reason, by: actor, at: new Date().toISOString() };
  await putDeal(deal);

  await recordAudit({
    dealId: deal.id,
    actor,
    action: 'deal_rejected',
    summary: `Rejected: ${reason}`,
    details: { reason },
  });

  return NextResponse.json({ rejection: deal.rejection });
}
