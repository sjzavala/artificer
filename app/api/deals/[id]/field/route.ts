import { NextResponse, type NextRequest } from 'next/server';
import { getDeal, putDeal, computeDealHash } from '@/lib/deals';
import { recordAudit } from '@/lib/audit';
import { FIELD_SPECS_BY_PATH, getField, withField, type ExtractedField } from '@/shared/schema';
import { formatValue } from '@/lib/format';

export const runtime = 'nodejs';

interface EditRequest {
  path?: unknown;
  value?: unknown;
  actor?: unknown;
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

  if (previous === next) {
    return NextResponse.json({ field: current, dealHash: deal.dealHash, unchanged: true });
  }

  const updated: ExtractedField<unknown> = {
    value: next,
    confidence: next === null ? 'not_found' : 'high',
    // The citation belonged to the AI's value; a human-entered value inherits it
    // only when the value itself is unchanged, which it is not here.
    sourceQuote: next === null ? null : current?.sourceQuote ?? null,
    sourceLocation: next === null ? null : current?.sourceLocation ?? null,
    edited: true,
  };

  deal.extraction = withField(deal.extraction, path, updated);
  deal.dealHash = computeDealHash(deal.extraction);
  await putDeal(deal);

  const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Unnamed reviewer';
  await recordAudit({
    dealId: deal.id,
    actor,
    action: 'field_edited',
    summary: `${spec.label} changed from ${formatValue(previous, spec)} to ${formatValue(next, spec)}`,
    details: { path, label: spec.label, from: previous, to: next },
  });

  return NextResponse.json({ field: updated, dealHash: deal.dealHash });
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
