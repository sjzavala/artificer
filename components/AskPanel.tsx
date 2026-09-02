'use client';

import { useState } from 'react';
import { CornerDownLeft, Loader2, MessageCircleQuestion, TriangleAlert } from 'lucide-react';
import { QUESTION_MAX_LENGTH, type AskOutcome, type Citation } from '@/lib/ask/types';

/**
 * Ask the document a question.
 *
 * The citations are the product, not a footnote. Each `[n]` in the answer is a
 * button that drives the document pane to the passage it came from — the same
 * pane, the same highlight and the same pulse a field's citation uses, because
 * a claim from the assistant should be checkable exactly as cheaply as a claim
 * from the extractor.
 */

const EXAMPLES = [
  'What are the rent escalations?',
  'Who is responsible for roof and structure?',
  'Are there any early termination rights?',
];

export function AskPanel({
  dealId,
  onCite,
}: {
  dealId: string;
  /** Focuses the document pane on a verified passage. */
  onCite: (anchorId: string, quote: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskOutcome | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  async function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/deals/${dealId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Could not answer that question.');
        setResult(null);
        return;
      }

      setResult(body as AskOutcome);
      setAsked(q);
    } catch {
      setError('Could not reach the server.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-rule bg-panel p-3.5 shadow-card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
      >
        <label htmlFor="ask" className="eyebrow mb-1.5 flex items-center gap-1.5">
          <MessageCircleQuestion size={12} aria-hidden className="text-accent" />
          Ask this document
        </label>

        <div className="flex gap-2">
          <input
            id="ask"
            type="text"
            value={question}
            maxLength={QUESTION_MAX_LENGTH}
            disabled={busy}
            placeholder="e.g. who pays for roof and structure?"
            onChange={(e) => setQuestion(e.target.value)}
            className="focus-ring min-w-0 flex-1 rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint disabled:bg-sunken"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <CornerDownLeft size={14} aria-hidden />}
            {busy ? 'Reading…' : 'Ask'}
          </button>
        </div>
      </form>

      {!result && !error && !busy ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuestion(example);
                void submit(example);
              }}
              className="focus-ring rounded-full border border-rule bg-white px-2.5 py-1 text-2xs text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 border-t border-rule pt-3">
          {asked ? <p className="mb-1.5 text-2xs text-ink-faint">{asked}</p> : null}

          {/* Rendered as text with the markers turned into buttons — never as
              HTML. The answer is model output. */}
          <p className="text-sm leading-relaxed text-ink">
            <AnswerText text={result.answer} citations={result.citations} onCite={onCite} />
          </p>

          {!result.answered ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-sunken px-2 py-1 text-2xs text-ink-muted">
              The document does not state this.
            </p>
          ) : null}

          {result.unsupported ? (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-2xs text-red-800"
            >
              <TriangleAlert size={12} aria-hidden className="mt-px shrink-0" />
              <span>
                None of the passages offered for this answer appear in the document. Treat it as
                unverified and read the source yourself.
              </span>
            </p>
          ) : null}

          {result.citations.length > 0 ? (
            <ol className="mt-2.5 space-y-1.5">
              {result.citations.map((citation) => (
                <li key={citation.marker}>
                  <button
                    type="button"
                    onClick={() => onCite(citation.sourceLocation, citation.quote)}
                    className="focus-ring group flex w-full gap-2 rounded-md border border-rule bg-sunken/50 px-2.5 py-1.5 text-left transition-colors hover:border-accent-ring hover:bg-accent-soft"
                  >
                    <span className="mt-px font-mono text-2xs text-ink-faint">[{citation.marker}]</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs italic leading-snug text-ink-soft">
                        “{truncate(citation.quote)}”
                      </span>
                      <span className="mt-0.5 block text-2xs text-ink-faint group-hover:text-accent">
                        {citation.page ? `page ${citation.page}` : 'in the document'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          {result.droppedCitations > 0 && !result.unsupported ? (
            <p className="mt-2 text-2xs text-amber-800">
              {result.droppedCitations} passage{result.droppedCitations === 1 ? '' : 's'} could not be
              found in the document and {result.droppedCitations === 1 ? 'was' : 'were'} discarded.
            </p>
          ) : null}

          <p className="mt-2.5 text-2xs text-ink-faint">
            Answered in {(result.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Splits the answer on `[n]` and renders each marker as a button.
 *
 * A marker with no matching citation cannot happen — the server strips those
 * before sending — but it is rendered as plain text rather than a dead button
 * if one ever does.
 */
function AnswerText({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (anchorId: string, quote: string) => void;
}) {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  const parts = text.split(/(\[\d+\])/g);

  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const citation = match ? byMarker.get(Number(match[1])) : undefined;

        if (!citation) return <span key={i}>{part}</span>;

        return (
          <button
            key={i}
            type="button"
            title={citation.quote}
            onClick={() => onCite(citation.sourceLocation, citation.quote)}
            className="focus-ring mx-0.5 rounded bg-accent-soft px-1 align-baseline font-mono text-2xs text-accent ring-1 ring-inset ring-accent-ring transition-colors hover:bg-accent hover:text-white"
          >
            {citation.marker}
          </button>
        );
      })}
    </>
  );
}

function truncate(quote: string, max = 180): string {
  return quote.length <= max ? quote : `${quote.slice(0, max).trimEnd()}…`;
}
