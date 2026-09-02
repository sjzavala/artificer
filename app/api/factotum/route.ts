import { NextResponse, type NextRequest } from 'next/server';
import { streamFactotum, FactotumError } from '@/lib/factotum/agent';
import { MAX_HISTORY_TURNS, QUESTION_MAX_LENGTH, type FactotumTurn } from '@/lib/factotum/types';
import { rateLimit } from '@/lib/rate-limit';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
/** A tool loop over a long document can take a while; the default 10s would cut it off. */
export const maxDuration = 120;

/**
 * The broker factotum.
 *
 * Stateless: the client replays the conversation, the server holds nothing. A
 * read-only assistant has no state worth persisting, and not storing the
 * transcript means there is no second copy of deal data to look after.
 */
export async function POST(request: NextRequest) {
  // A single question can fan out into several tool calls, one of which reads a
  // whole document. This is the most expensive route in the app.
  const session = request.cookies.get(SESSION_COOKIE)?.value ?? 'anonymous';
  const limit = rateLimit(`factotum:${session}`, { limit: 15, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many questions in a row. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: { question?: unknown; history?: unknown };
  try {
    body = (await request.json()) as { question?: unknown; history?: unknown };
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  }
  if (question.length > QUESTION_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Keep the question under ${QUESTION_MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const history = normalizeHistory(body.history);

  /**
   * Newline-delimited JSON rather than server-sent events.
   *
   * One object per line, which a browser can read with a TextDecoder and a
   * split — no event-type parsing, no reconnection semantics we would not use,
   * and nothing between the two ends that has to agree on a wire format beyond
   * "a line is a JSON object".
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        for await (const event of streamFactotum(history, question)) {
          send(event);
        }
      } catch (error) {
        // The status code is long gone — a 200 went out with the first byte —
        // so a failure has to arrive as an event the client can render.
        const message =
          error instanceof FactotumError ? error.message : 'Could not answer that question.';
        if (!(error instanceof FactotumError)) console.error('[artificer] factotum failed', error);
        send({ type: 'error', error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Without this some proxies buffer the whole response and hand it over at
      // the end, which is exactly the behaviour being fixed.
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * The history arrives from the browser, so it is input rather than state.
 *
 * It is trimmed to the most recent turns and stripped to role and text: a
 * client that sent a thousand turns, or tool results it invented, gets neither
 * into the prompt.
 */
function normalizeHistory(raw: unknown): FactotumTurn[] {
  if (!Array.isArray(raw)) return [];

  const turns: FactotumTurn[] = [];
  for (const entry of raw) {
    const turn = entry as { role?: unknown; content?: unknown };
    const role = turn.role === 'assistant' ? 'assistant' : turn.role === 'user' ? 'user' : null;
    const content = typeof turn.content === 'string' ? turn.content.trim() : '';
    if (!role || !content) continue;
    turns.push({ role, content: content.slice(0, 4_000) });
  }

  // The Messages API requires the first turn to be a user one, and a history
  // trimmed mid-exchange can easily start on an assistant turn.
  const recent = turns.slice(-MAX_HISTORY_TURNS);
  while (recent.length > 0 && recent[0].role !== 'user') recent.shift();
  return recent;
}
