import { NextResponse, type NextRequest } from 'next/server';
import { getDeal } from '@/lib/deals';
import { askDocument, AskError } from '@/lib/ask/client';
import { QUESTION_MAX_LENGTH } from '@/lib/ask/types';
import { rateLimit } from '@/lib/rate-limit';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Ask a question of a deal's document.
 *
 * Deliberately not recorded in the audit log. The log is the record of what was
 * *done* to a deal, and a question changes nothing — logging every one would
 * bury the eight entries that represent decisions under a hundred that do not.
 * The token accounting goes to the server log instead.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // This route spends API tokens per call, and a long document makes each one
  // expensive. The gate keeps strangers out; this keeps one session from
  // emptying the budget.
  const session = request.cookies.get(SESSION_COOKIE)?.value ?? 'anonymous';
  const limit = rateLimit(`ask:${session}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many questions in a row. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const deal = await getDeal(id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  let body: { question?: unknown };
  try {
    body = (await request.json()) as { question?: unknown };
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'Ask a question about the document.' }, { status: 400 });
  }
  if (question.length > QUESTION_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Keep the question under ${QUESTION_MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  if (deal.document.paragraphs.length === 0) {
    return NextResponse.json(
      { error: 'This document has no extractable text to read.' },
      { status: 422 },
    );
  }

  try {
    const outcome = await askDocument(question, deal.document.paragraphs, {
      fileName: deal.document.fileName,
    });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof AskError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[artificer] ask failed', error);
    return NextResponse.json({ error: 'Could not answer that question.' }, { status: 502 });
  }
}
