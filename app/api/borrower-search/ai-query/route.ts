import { NextResponse, type NextRequest } from 'next/server';
import { getBorrowerRepo } from '@/lib/borrower-search/db';
import { repositoryFailure } from '@/lib/borrower-search/errors';
import { AiQueryError, AI_QUERY_MAX_LENGTH, translateQuery } from '@/lib/borrower-search/ai';
import { rateLimit } from '@/lib/rate-limit';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Natural language search.
 *
 * Returns the filters the model chose alongside the results they produce, so
 * the page can populate its own controls with them. The filters are the point:
 * a lender should be able to see that "above 700" became `minScore = 700` and
 * correct it, rather than trusting a list of names that arrived from nowhere.
 */
export async function POST(request: NextRequest) {
  // This route spends API tokens on request, which the rest of the search does
  // not. The gate already keeps strangers out; this keeps one session from
  // running up a bill by holding down a key.
  const session = request.cookies.get(SESSION_COOKIE)?.value ?? 'anonymous';
  const limit = rateLimit(`ai-query:${session}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many searches in a row. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: { query?: unknown };
  try {
    body = (await request.json()) as { query?: unknown };
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const text = typeof body.query === 'string' ? body.query.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Describe what you are looking for.' }, { status: 400 });
  }
  if (text.length > AI_QUERY_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Keep the question under ${AI_QUERY_MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  let translation;
  try {
    translation = await translateQuery(text);
  } catch (error) {
    if (error instanceof AiQueryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[artificer] ai-query failed', error);
    return NextResponse.json({ error: 'Could not interpret that question.' }, { status: 502 });
  }

  const { query, interpretation, model, inputTokens, outputTokens } = translation;

  console.log(
    `[artificer] ai-query model=${model} in=${inputTokens} out=${outputTokens} ` +
      `q="${query.q}" status=${query.status ?? '-'} state=${query.state ?? '-'} ` +
      `minScore=${query.minScore ?? '-'} sortBy=${query.sortBy}`,
  );

  try {
    const results = await getBorrowerRepo().search(query);
    return NextResponse.json({
      // What the page puts into its controls. Strings, because that is what the
      // form fields hold.
      filters: {
        q: query.q,
        status: query.status ?? '',
        state: query.state ?? '',
        minScore: query.minScore === null ? '' : String(query.minScore),
        sortBy: query.sortBy,
      },
      interpretation,
      results,
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}
