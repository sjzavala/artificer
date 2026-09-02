'use client';

import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Loader2, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { FactotumToolRun } from './FactotumToolRun';
import { Markdown } from './Markdown';
import {
  QUESTION_MAX_LENGTH,
  type FactotumEvent,
  type FactotumTurn,
  type ToolRun,
} from '@/lib/factotum/types';

/**
 * The factotum conversation.
 *
 * The transcript lives here and is replayed to the server with each question —
 * the assistant is read-only, so there is nothing worth persisting, and keeping
 * it client-side means no second copy of deal data sitting in a store.
 */

/**
 * One question and everything that has arrived for it so far.
 *
 * Built up from the stream rather than assigned once at the end: `toolRuns`
 * grows as lookups land, `answer` grows as the model writes, and `durationMs`
 * is only known when it is over.
 */
interface Exchange {
  question: string;
  toolRuns: ToolRun[];
  answer: string;
  durationMs: number | null;
  truncated: boolean;
  error: string | null;
}

const EXAMPLES = [
  'Who should I call about the Dollar General deal?',
  'Which exchange buyers are running out of time, and is there anything in the pipeline for them?',
  'Who carries roof and structure on the Dollar General, and does that rule any buyers out?',
];

export function Factotum() {
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
    setExchanges((prev) => [
      ...prev,
      { question: q, toolRuns: [], answer: '', durationMs: null, truncated: false, error: null },
    ]);

    // Only answered exchanges are replayed: a turn that failed has no assistant
    // answer, and sending the question without one would leave two user turns
    // in a row describing a question that was never answered.
    const history: FactotumTurn[] = exchanges
      .filter((e) => e.answer && !e.error)
      .flatMap((e) => [
        { role: 'user' as const, content: e.question },
        { role: 'assistant' as const, content: e.answer },
      ]);

    /** Applies an update to the exchange this run is filling in — always the last. */
    const patch = (fn: (e: Exchange) => void) =>
      setExchanges((prev) => {
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        fn(last);
        next[next.length - 1] = last;
        return next;
      });

    try {
      const response = await fetch('/api/factotum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      });

      // A failure before the stream opens still arrives as ordinary JSON.
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        patch((e) => {
          e.error = typeof body?.error === 'string' ? body.error : 'Could not answer that question.';
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Newline-delimited JSON: a chunk can split a line anywhere, so whatever
      // follows the last newline is held over until the rest of it arrives.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: FactotumEvent;
          try {
            event = JSON.parse(line) as FactotumEvent;
          } catch {
            continue; // A malformed line is not worth ending the answer over.
          }

          switch (event.type) {
            case 'tool':
              patch((e) => {
                e.toolRuns = [...e.toolRuns, event.run];
              });
              break;
            case 'text':
              patch((e) => {
                e.answer += event.delta;
              });
              break;
            case 'reset_text':
              // What was written was a preamble to the lookup that just ran.
              patch((e) => {
                e.answer = '';
              });
              break;
            case 'done':
              patch((e) => {
                e.durationMs = event.durationMs;
                e.truncated = event.truncated;
              });
              break;
            case 'error':
              patch((e) => {
                e.error = event.error;
              });
              break;
          }
        }
      }
    } catch {
      patch((e) => {
        if (!e.answer) e.error = 'Could not reach the server.';
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
            <p className="mt-3 text-sm text-ink">Ask about your deals, your buyers, the market.</p>
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

              {exchange.toolRuns.length > 0 || exchange.answer ? (
                <div className="mt-2.5">
                  {/* Each card appears the moment its lookup lands, so a
                      four-lookup answer shows work happening rather than a
                      blank panel until the end. */}
                  {exchange.toolRuns.length > 0 ? (
                    <div className="mb-2.5 space-y-1">
                      {exchange.toolRuns.map((run: ToolRun, j: number) => (
                        <FactotumToolRun key={j} run={run} />
                      ))}
                    </div>
                  ) : null}

                  {/* The model writes markdown — bold runs, the occasional
                      comparison table — and rendering it as preformatted text
                      put literal asterisks and pipe characters on screen. This
                      is the same small renderer the OM draft uses: it emits text
                      nodes only, so nothing the model writes can inject markup.
                      It re-renders on every delta, which is cheap at this size
                      and keeps a half-written table from looking like debris. */}
                  {exchange.answer ? (
                    <div className="text-sm leading-relaxed text-ink">
                      <Markdown source={exchange.answer} />
                    </div>
                  ) : null}

                  {exchange.truncated ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-2xs text-amber-900">
                      <TriangleAlert size={11} aria-hidden className="mt-px shrink-0" />
                      <span>
                        It ran out of lookups before finishing. Try a narrower question — one deal,
                        or one thing about the pipeline.
                      </span>
                    </p>
                  ) : null}

                  {/* Only once it is over. Token counts are engineering
                      telemetry and belong in the server log, not in front of
                      someone deciding who to call. */}
                  {exchange.durationMs !== null ? (
                    <p className="mt-2 text-2xs text-ink-faint">
                      Answered in {(exchange.durationMs / 1000).toFixed(1)}s
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        {/* Shown until the answer starts arriving, not until the first tool
            card does. Between the last lookup landing and the first word being
            written there is a real pause — measured at five seconds on a
            four-lookup question — and leaving the cards sitting there with no
            indicator reads as finished-but-wrong. Once text is flowing it is
            its own progress and the spinner goes. */}
        {busy && !exchanges[exchanges.length - 1]?.answer ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
            <Loader2 size={13} aria-hidden className="animate-spin" />
            {exchanges[exchanges.length - 1]?.toolRuns.length ? 'Working it out…' : 'Looking it up…'}
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
            aria-label="Ask the factotum"
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
