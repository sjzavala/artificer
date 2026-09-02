'use client';

import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Loader2, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { CopilotToolRun } from './CopilotToolRun';
import { QUESTION_MAX_LENGTH, type CopilotReply, type CopilotTurn, type ToolRun } from '@/lib/copilot/types';

/**
 * The copilot conversation.
 *
 * The transcript lives here and is replayed to the server with each question —
 * the assistant is read-only, so there is nothing worth persisting, and keeping
 * it client-side means no second copy of deal data sitting in a store.
 */

interface Exchange {
  question: string;
  reply: CopilotReply | null;
  error: string | null;
}

const EXAMPLES = [
  'Who should I call about the Dollar General deal?',
  'Which exchange buyers are running out of time, and is there anything in the pipeline for them?',
  'Who carries roof and structure on the Dollar General, and does that rule any buyers out?',
];

export function Copilot() {
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [exchanges, busy]);

  async function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    setQuestion('');
    setBusy(true);
    setExchanges((prev) => [...prev, { question: q, reply: null, error: null }]);

    // Only settled exchanges are replayed: a turn that failed has no assistant
    // answer, and sending the question without one would leave two user turns
    // in a row describing a question that was never answered.
    const history: CopilotTurn[] = exchanges
      .filter((e) => e.reply)
      .flatMap((e) => [
        { role: 'user' as const, content: e.question },
        { role: 'assistant' as const, content: e.reply!.answer },
      ]);

    try {
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      });
      const body = await response.json();

      setExchanges((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!response.ok) {
          last.error = typeof body?.error === 'string' ? body.error : 'Could not answer that question.';
        } else {
          last.reply = body as CopilotReply;
        }
        return next;
      });
    } catch {
      setExchanges((prev) => {
        const next = [...prev];
        next[next.length - 1].error = 'Could not reach the server.';
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-pane min-h-0 flex-1 overflow-y-auto pr-1">
        {exchanges.length === 0 ? (
          <div className="rounded-lg border border-dashed border-rule-strong bg-panel px-6 py-10 text-center">
            <Sparkles size={18} aria-hidden className="mx-auto text-accent" />
            <p className="mt-3 text-sm text-ink">Ask about your deals and your buyers.</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-muted">
              It reads your pipeline and your documents and shows the lookups behind every answer.
              It cannot change anything — every write in Artificer is still a person clicking a
              button.
            </p>
            <div className="mt-4 flex flex-col items-center gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void submit(example)}
                  className="focus-ring max-w-full rounded-full border border-rule bg-white px-3 py-1.5 text-2xs text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <ol className="space-y-5">
          {exchanges.map((exchange, i) => (
            <li key={i}>
              <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-chrome px-3 py-2 text-sm text-white">
                {exchange.question}
              </p>

              {exchange.error ? (
                <p role="alert" className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {exchange.error}
                </p>
              ) : null}

              {exchange.reply ? (
                <div className="mt-2.5">
                  {exchange.reply.toolRuns.length > 0 ? (
                    <div className="mb-2.5 space-y-1">
                      {exchange.reply.toolRuns.map((run: ToolRun, j: number) => (
                        <CopilotToolRun key={j} run={run} />
                      ))}
                    </div>
                  ) : null}

                  {/* Model output, rendered as text. */}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {exchange.reply.answer}
                  </div>

                  {exchange.reply.truncated ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-2xs text-amber-900">
                      <TriangleAlert size={11} aria-hidden className="mt-px shrink-0" />
                      <span>
                        It ran out of lookups before finishing. Try a narrower question — one deal,
                        or one thing about the pipeline.
                      </span>
                    </p>
                  ) : null}

                  <p className="mt-2 font-mono text-2xs text-ink-faint">
                    {(exchange.reply.durationMs / 1000).toFixed(1)}s · {exchange.reply.inputTokens} in /{' '}
                    {exchange.reply.outputTokens} out
                    {exchange.reply.cacheReadTokens > 0
                      ? ` · ${exchange.reply.cacheReadTokens} cached`
                      : null}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        {busy ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
            <Loader2 size={13} aria-hidden className="animate-spin" />
            Looking it up…
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
        className="mt-4 border-t border-rule pt-4"
      >
        <div className="flex gap-2">
          <input
            aria-label="Ask the copilot"
            type="text"
            value={question}
            maxLength={QUESTION_MAX_LENGTH}
            disabled={busy}
            placeholder="Who should I call about the Dollar General deal?"
            onChange={(e) => setQuestion(e.target.value)}
            className="focus-ring min-w-0 flex-1 rounded-md border border-rule bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint disabled:bg-sunken"
          />
          {exchanges.length > 0 ? (
            <button
              type="button"
              onClick={() => setExchanges([])}
              disabled={busy}
              title="Start over"
              aria-label="Start a new conversation"
              className="focus-ring inline-flex shrink-0 items-center rounded-md border border-rule bg-white px-3 text-ink-muted transition-colors hover:border-ink-faint hover:text-ink disabled:opacity-40"
            >
              <RotateCcw size={14} aria-hidden />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <CornerDownLeft size={14} aria-hidden />}
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}
