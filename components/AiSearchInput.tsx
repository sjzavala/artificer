'use client';

import { useState } from 'react';
import { CornerDownLeft, Loader2, Sparkles, X } from 'lucide-react';
import { AI_QUERY_MAX_LENGTH } from '@/lib/borrower-search/types';
import type { BorrowerFilters } from './BorrowerSearchBar';

/**
 * Ask in words; get filters.
 *
 * The result of a translation is the controls below moving, not a separate list
 * of names. That is the whole design: the reviewer sees which filters the model
 * chose, and can correct one without starting over.
 */

const EXAMPLES = [
  'pending applications scoring 700 or better',
  'borrowers named Smith',
  'the biggest loans in Texas',
];

export function AiSearchInput({ onFilters }: { onFilters: (filters: BorrowerFilters) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);

  async function submit(question: string) {
    const query = question.trim();
    if (!query || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/borrower-search/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Could not interpret that question.');
        setInterpretation(null);
        return;
      }

      setInterpretation(typeof body.interpretation === 'string' ? body.interpretation : null);
      onFilters(body.filters as BorrowerFilters);
    } catch {
      setError('Could not reach the server.');
      setInterpretation(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-rule bg-panel p-4 shadow-card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text);
        }}
      >
        <label htmlFor="ai-query" className="eyebrow mb-1.5 flex items-center gap-1.5">
          <Sparkles size={12} aria-hidden className="text-accent" />
          Ask in plain English
        </label>

        <div className="flex gap-2">
          <input
            id="ai-query"
            type="text"
            value={text}
            maxLength={AI_QUERY_MAX_LENGTH}
            disabled={busy}
            placeholder="e.g. pending applications in California scoring at least 700"
            onChange={(e) => setText(e.target.value)}
            className="focus-ring min-w-0 flex-1 rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint disabled:bg-sunken"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={14} aria-hidden className="animate-spin" />
            ) : (
              <CornerDownLeft size={14} aria-hidden />
            )}
            {busy ? 'Reading…' : 'Search'}
          </button>
        </div>
      </form>

      {!interpretation && !error ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-ink-faint">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={busy}
              onClick={() => {
                setText(example);
                void submit(example);
              }}
              className="focus-ring rounded-full border border-rule bg-white px-2.5 py-1 text-2xs text-ink-muted transition-colors hover:border-ink-faint hover:text-ink disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {interpretation ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-md bg-accent-soft px-3 py-2 text-xs text-accent">
          <Sparkles size={12} aria-hidden className="mt-0.5 shrink-0" />
          {/* Rendered as text. The interpretation is model output echoed back to
              the user, and it goes through JSX like any other untrusted string. */}
          <span className="flex-1">{interpretation}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setInterpretation(null)}
            className="focus-ring -m-1 rounded p-1 text-accent/60 hover:text-accent"
          >
            <X size={12} aria-hidden />
          </button>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
