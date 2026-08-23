import { NextResponse, type NextRequest } from 'next/server';
import { parsePdf } from '@/lib/extraction/pdf';
import { describeApiError, extractDeal, ExtractionError } from '@/lib/extraction/client';
import { computeDealHash, putDeal } from '@/lib/deals';
import { recordAudit } from '@/lib/audit';
import { newId } from '@/lib/ids';
import type { Deal } from '@/shared/deal';

export const runtime = 'nodejs';
// Extraction of a long offering memo is a multi-call, multi-second operation;
// the platform default would cut it off mid-document.
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload.' }, { status: 400 });
  }

  const file = form.get('file');
  const actor = String(form.get('actor') ?? '').trim() || 'Unnamed reviewer';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is larger than 20 MB.' }, { status: 413 });
  }
  if (!isPdf(file)) {
    return NextResponse.json({ error: 'Artificer reads PDF deal documents. Upload a PDF.' }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parsePdf(buffer);
  } catch (err) {
    console.error('[artificer] pdf parse failed', err);
    return NextResponse.json({ error: 'That PDF could not be read. It may be corrupt or password protected.' }, { status: 422 });
  }

  if (parsed.paragraphs.length === 0 || parsed.charCount < 200) {
    // Almost always a scanned document. Saying so beats a generic failure.
    return NextResponse.json(
      { error: 'No selectable text was found in that PDF. Scanned documents need OCR before Artificer can read them.' },
      { status: 422 },
    );
  }

  const dealId = newId('d_');

  try {
    const { extraction, meta, anchors } = await extractDeal(parsed.paragraphs, { fileName: file.name });

    const now = new Date().toISOString();
    const deal: Deal = {
      id: dealId,
      createdAt: now,
      updatedAt: now,
      status: 'extracted',
      dealHash: computeDealHash(extraction),
      document: {
        fileName: file.name,
        byteSize: file.size,
        pageCount: parsed.pageCount,
        charCount: parsed.charCount,
        paragraphs: parsed.paragraphs,
      },
      extraction,
      originalExtraction: structuredClone(extraction),
      extractionMeta: meta,
    };

    await putDeal(deal);

    await recordAudit({
      dealId,
      actor,
      action: 'document_uploaded',
      summary: `Uploaded ${file.name} (${parsed.pageCount} page${parsed.pageCount === 1 ? '' : 's'})`,
      details: { fileName: file.name, byteSize: file.size, pageCount: parsed.pageCount },
    });

    await recordAudit({
      dealId,
      actor,
      action: 'extraction_completed',
      summary: 'Extraction completed by Artificer',
      details: {
        engine: 'Artificer',
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        durationMs: meta.durationMs,
        attempts: meta.attempts,
        chunks: meta.chunks,
        citationsResolved: `${anchors.resolved}/${anchors.cited}`,
        citationsUnresolvable: anchors.unresolvable,
      },
    });

    return NextResponse.json({ id: dealId });
  } catch (err) {
    const message =
      err instanceof ExtractionError
        ? err.message
        : describeApiError(err) ?? 'Extraction failed unexpectedly. Check the server logs.';
    console.error('[artificer] extraction failed', err);

    await recordAudit({
      dealId,
      actor,
      action: 'extraction_failed',
      summary: `Extraction failed for ${file.name}`,
      details: { error: message },
    }).catch(() => undefined);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
