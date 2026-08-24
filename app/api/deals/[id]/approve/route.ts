import { NextResponse, type NextRequest } from 'next/server';
import { getDeal, putDeal, computeDealHash } from '@/lib/deals';
import { recordAudit } from '@/lib/audit';
import { buildPayloads, getSalesforceAdapter, payloadFieldCounts } from '@/lib/salesforce';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The only path by which data reaches Salesforce. There is no automatic write
 * anywhere in this application — reaching this handler requires a person to have
 * clicked through the confirmation modal.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { actor?: string };
  const actor = body.actor?.trim() || 'Unnamed reviewer';

  // Recomputed rather than trusted: the hash is what makes the write idempotent,
  // so it must reflect the values being written right now.
  deal.dealHash = computeDealHash(deal.extraction);

  const payloads = buildPayloads(deal);
  const adapter = getSalesforceAdapter();

  let result;
  try {
    result = await adapter.write({
      dealId: deal.id,
      dealHash: deal.dealHash,
      approvedBy: actor,
      payloads,
    });
  } catch (err) {
    console.error('[artificer] salesforce write failed', err);
    return NextResponse.json(
      { error: `The Salesforce write failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  deal.status = 'approved';
  deal.salesforce = result;
  delete deal.rejection;
  await putDeal(deal);

  await recordAudit({
    dealId: deal.id,
    actor,
    action: 'deal_approved',
    summary: result.updated
      ? `Approved — existing ${result.mode} Salesforce records updated`
      : `Approved — ${result.mode} Salesforce records created`,
    details: {
      mode: result.mode,
      updated: result.updated,
      dealHash: deal.dealHash,
      recordIds: result.ids,
      fieldCounts: payloadFieldCounts(payloads),
    },
  });

  return NextResponse.json({ salesforce: result });
}
