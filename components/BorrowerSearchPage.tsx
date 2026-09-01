'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import { AiSearchInput } from './AiSearchInput';
import { BorrowerSearchBar, type BorrowerFilters } from './BorrowerSearchBar';
import { BorrowerTable } from './BorrowerTable';
import { DEFAULT_LIMIT, type BorrowerSearchResult, type BorrowerStatus } from '@/lib/borrower-search/types';

const EMPTY_FILTERS: BorrowerFilters = { q: '', status: '', state: '', minScore: '', sortBy: 'id' };

/** Long enough to swallow a burst of typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 200;

export function BorrowerSearchPage() {
  const [filters, setFilters] = useState<BorrowerFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<BorrowerSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  /** Bumped by a status write, to re-run the search against what was stored. */
  const [dataVersion, setDataVersion] = useState(0);

  /**
   * BUG-9. The sandbox fired a request per keystroke with no abort and no
   * ordering guard, against an API whose broader queries were deliberately
   * slower — so the response for "s" could land after the response for "smith"
   * and overwrite it. The box said "smith"; the table showed results for "s".
   *
   * Three things prevent it here, and the redundancy is deliberate because the
   * failure is intermittent and reads as "cannot reproduce": the input is
   * debounced, each request aborts the one before it, and a monotonic sequence
   * number means a response that arrives late is discarded even if its abort
   * did not take. Only the newest request may write to state.
   */
  const latestRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(DEFAULT_LIMIT),
      sortBy: filters.sortBy,
    });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.state) params.set('state', filters.state);
    if (filters.minScore) params.set('minScore', filters.minScore);

    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/borrower-search?${params}`, { signal: controller.signal });
        const body = await response.json();

        if (requestId !== latestRequest.current) return;

        if (!response.ok) {
          setError(typeof body?.error === 'string' ? body.error : `Request failed (${response.status}).`);
          setData(null);
        } else {
          setData(body as BorrowerSearchResult);
          setError(null);
        }
      } catch (err) {
        // An abort is this effect being superseded, not a failure to report.
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        setError(err instanceof Error ? err.message : 'Could not reach the server.');
        setData(null);
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, dataVersion]);

  /**
   * BUG-10. Changing any filter returns to page 1. The sandbox reset the page in
   * each control's handler and the search input was the one that forgot, so
   * searching from page 3 landed you on page 3 of a shorter result set — empty,
   * with nothing on screen to explain why. Routing every filter change through
   * here makes the reset structural rather than something each new control has
   * to remember.
   */
  const updateFilters = useCallback((next: Partial<BorrowerFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  async function changeStatus(id: number, status: BorrowerStatus) {
    setPendingId(id);
    try {
      const response = await fetch(`/api/borrower-search/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : `Could not update status (${response.status}).`);
        return;
      }
      // Refetch rather than patching the row locally, so the table always shows
      // what the API actually stored.
      setDataVersion((v) => v + 1);
    } catch {
      setError('Could not update status.');
    } finally {
      setPendingId(null);
    }
  }

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const isFiltered = Boolean(filters.q || filters.status || filters.state || filters.minScore);

  /**
   * A translated question replaces the filters outright rather than merging
   * into them. Merging would leave a filter from a previous question silently
   * narrowing the new one, and the controls would no longer show the whole
   * truth about what is being searched.
   */
  const applyAiFilters = useCallback((next: BorrowerFilters) => {
    setFilters({ ...EMPTY_FILTERS, ...next });
    setPage(1);
  }, []);

  return (
    <div>
      <AiSearchInput onFilters={applyAiFilters} />

      <div className="mt-5">
        <BorrowerSearchBar filters={filters} onChange={updateFilters} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-b border-rule pb-2.5">
        <p className="flex items-center gap-2 text-sm text-ink-muted" aria-live="polite">
          <Users size={14} aria-hidden className="text-ink-faint" />
          {/* The count reflects the filters — BUG-4 — so it can be trusted as
              the size of the result set rather than of the table. */}
          <span>
            <strong className="font-medium text-ink">{total}</strong> borrower{total === 1 ? '' : 's'}
            {isFiltered ? ' match these filters' : ''}
          </span>
          {loading ? <Loader2 size={13} aria-hidden className="animate-spin text-ink-faint" /> : null}
          <span className="sr-only">{loading ? 'Loading results' : 'Results updated'}</span>
        </p>

        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
            className="focus-ring rounded-md px-2 py-1 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!error && results.length > 0 ? (
        <div className="mt-5">
          <BorrowerTable borrowers={results} onStatusChange={changeStatus} pendingId={pendingId} />
        </div>
      ) : null}

      {!error && !loading && results.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-rule-strong bg-panel px-6 py-12 text-center">
          {/* BUG-7. The sandbox built this line with dangerouslySetInnerHTML and
              interpolated the raw query, so searching `<img src=x onerror=…>`
              executed it. Rendered as a child, React escapes it and the same
              input is displayed as the text it is. */}
          <p className="text-sm text-ink-muted">
            {filters.q ? <>No borrowers match “{filters.q}”.</> : 'No borrowers match these filters.'}
          </p>
          <p className="mt-1 text-xs text-ink-faint">Try widening the filters.</p>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-between" aria-label="Pagination">
          <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft size={14} aria-hidden />
            Previous
          </PageButton>

          <span className="text-xs text-ink-muted">
            Page {page} of {totalPages}
          </span>

          <PageButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
            <ChevronRight size={14} aria-hidden />
          </PageButton>
        </nav>
      ) : null}
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rule"
    >
      {children}
    </button>
  );
}
