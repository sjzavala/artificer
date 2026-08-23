import { NextResponse, type NextRequest } from 'next/server';
import { getDeal, putDeal } from '@/lib/deals';
import { recordAudit } from '@/lib/audit';
import { generateOmDraft } from '@/lib/om-draft';
import { describeApiError } from '@/lib/extraction/client';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Drafts an OM summary from an approved deal. Approval is required, not
 * incidental: the draft is generated from the reviewed record, so there has to
 * be a reviewed record.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { dealId?: string; actor?: string };
  const dealId = typeof body.dealId === 'string' ? body.dealId : '';
  const actor = body.actor?.trim() || 'Unnamed reviewer';

  const deal = await getDeal(dealId);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  if (deal.status !== 'approved') {
    return NextResponse.json(
      { error: 'Approve the deal before drafting a summary — the draft is written from the approved record.' },
      { status: 409 },
    );
  }

  try {
    const draft = await generateOmDraft(deal);

    deal.omDraft = {
      markdown: draft.markdown,
      generatedAt: new Date().toISOString(),
      model: draft.model,
      inputTokens: draft.inputTokens,
      outputTokens: draft.outputTokens,
    };
    await putDeal(deal);

    await recordAudit({
      dealId: deal.id,
      actor,
      action: 'om_draft_generated',
      summary: `OM summary drafted with ${draft.model}`,
      details: {
        model: draft.model,
        inputTokens: draft.inputTokens,
        outputTokens: draft.outputTokens,
        characters: draft.markdown.length,
      },
    });

    return NextResponse.json({ draft: deal.omDraft });
  } catch (err) {
    console.error('[artificer] om draft failed', err);
    return NextResponse.json(
      { error: describeApiError(err) ?? 'The draft could not be generated. Check the server logs.' },
      { status: 502 },
    );
  }
}
