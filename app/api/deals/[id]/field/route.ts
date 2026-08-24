import { NextResponse, type NextRequest } from 'next/server';
import { getDeal, putDeal, computeDealHash } from '@/lib/deals';
import { recordAudit } from '@/lib/audit';
import { FIELD_SPECS_BY_PATH, getField, withField, type ExtractedField } from '@/shared/schema';
import { resolveAnchor } from '@/lib/extraction/anchor';
import type { Deal } from '@/shared/deal';
import { formatValue } from '@/lib/format';

export const runtime = 'nodejs';

interface EditRequest {
  path?: unknown;
  value?: unknown;
  actor?: unknown;
  /** Set when adopting an alternative, so its citation travels with its value. */
  sourceQuote?: unknown;
  sourceLocation?: unknown;
  /** True when the reviewer is accepting a flagged value exactly as it stands. */
  confirm?: unknown;
}

/**
 * A human correction. The edit is recorded with both the old and the new value,
 * and the value is promoted to high confidence — a person has now looked at the
 * document and decided. `edited` stays set so the screen never pretends the AI
 * got it right.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  if (deal.status === 'approved') {
    return NextResponse.json(
      { error: 'This deal is already approved. Reject it first if the data needs to change.' },
      { status: 409 },
    );
  }

  let body: EditRequest;
  try {
    body = (await request.json()) as EditRequest;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const path = typeof body.path === 'string' ? body.path : '';
  const spec = FIELD_SPECS_BY_PATH[path];
  if (!spec) return NextResponse.json({ error: `Unknown field "${path}".` }, { status: 400 });

  const validation = validateValue(body.value, spec.kind, spec.enumValues);
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 });

  const current = getField(deal.extraction, path);
  const previous = current?.value ?? null;
  const next = validation.value;

  const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Unnamed reviewer';

  // Confirming is a decision, not a no-op: the value does not move, but it stops
  // being something the screen is still asking about.
  if (previous === next) {
    if (body.confirm !== true || !current) {
      return NextResponse.json({ field: current, dealHash: deal.dealHash, unchanged: true });
    }

    const confirmed: ExtractedField<unknown> = { ...current, confirmed: true };
    deal.extraction = withField(deal.extraction, path, confirmed);
    await putDeal(deal);

    await recordAudit({
      dealId: deal.id,
      actor,
      action: 'field_confirmed',
      summary:
        next === null
          ? `${spec.label} confirmed as not stated in the document`
          : `${spec.label} confirmed as ${formatValue(next, spec)}`,
      details: { path, label: spec.label, value: next },
    });

    return NextResponse.json({ field: confirmed, dealHash: deal.dealHash });
  }

  // Adopting an alternative carries its citation across; a hand-typed value gets
  // none, because the passage supporting the old value does not support a new
  // one. Either way the screen never shows a quote that contradicts its value.
  const adopted = resolveAdoptedCitation(deal, body, next);

  const updated: ExtractedField<unknown> = {
    value: next,
    confidence: next === null ? 'not_found' : 'high',
    sourceQuote: adopted.sourceQuote,
    sourceLocation: adopted.sourceLocation,
    edited: true,
    confirmed: false,
    // Competing values stay available so a reviewer who changes their mind need
    // not re-read the document — minus whichever one they just adopted, since
    // offering the value already on screen would do nothing.
    alternatives: (current?.alternatives ?? []).filter((alternative) => alternative.value !== next),
  };

  deal.extraction = withField(deal.extraction, path, updated);
  deal.dealHash = computeDealHash(deal.extraction);
  await putDeal(deal);

  await recordAudit({
    dealId: deal.id,
    actor,
    action: 'field_edited',
    summary: `${spec.label} changed from ${formatValue(previous, spec)} to ${formatValue(next, spec)}`,
    details: { path, label: spec.label, from: previous, to: next },
  });

  return NextResponse.json({ field: updated, dealHash: deal.dealHash });
}

/**
 * A citation is only accepted if the quote genuinely appears in this document.
 * The request comes from the browser, so it is not trusted — otherwise a field
 * could end up displaying a source passage that does not exist.
 */
function resolveAdoptedCitation(
  deal: Deal,
  body: EditRequest,
  next: string | number | null,
): { sourceQuote: string | null; sourceLocation: string | null } {
  if (next === null) return { sourceQuote: null, sourceLocation: null };

  const quote = typeof body.sourceQuote === 'string' ? body.sourceQuote.trim() : '';
  if (!quote) return { sourceQuote: null, sourceLocation: null };

  const reported = typeof body.sourceLocation === 'string' ? body.sourceLocation : null;
  const { anchorId } = resolveAnchor(quote, reported, deal.document.paragraphs);

  return anchorId ? { sourceQuote: quote, sourceLocation: anchorId } : { sourceQuote: null, sourceLocation: null };
}

type Validation = { value: string | number | null } | { error: string };

function validateValue(raw: unknown, kind: string, enumValues?: readonly string[]): Validation {
  if (raw === null || raw === undefined || raw === '') return { value: null };

  if (kind === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(n)) return { error: 'That value is not a number.' };
    return { value: n };
  }

  const text = String(raw).trim();
  if (text.length > 2000) return { error: 'That value is too long.' };

  if (kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { error: 'Dates must be in YYYY-MM-DD form.' };
  }
  if (enumValues && !enumValues.includes(text)) {
    return { error: `Must be one of: ${enumValues.join(', ')}.` };
  }
  return { value: text };
}
