'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import { BuyerAiSearch } from './BuyerAiSearch';
import { BuyerFilters, type BuyerFilterState } from './BuyerFilters';
import { BuyerTable } from './BuyerTable';
import { requireReviewerName } from '@/lib/reviewer';
import { DEFAULT_LIMIT, type BuyerSearchResult } from '@/lib/buyers/types';
import type { BuyerStatus } from '@/shared/buyer';

const EMPTY_FILTERS: BuyerFilterState = {
  q: '',
  status: '',
  capitalSource: '',
  market: '',
  propertyType: '',
  minGuarantor: '',
  minEquity: '',
  identifyWithinDays: '',
  sortBy: 'id',
};

/** Long enough to swallow a burst of typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 200;

export function BuyerPipeline() {
  const [filters, setFilters] = useState<BuyerFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<BuyerSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  /** Bumped by a status write, to re-run the search against what was stored. */
  const [dataVersion, setDataVersion] = useState(0);

  /**
   * Only the newest request may write to state.
   *
   * Three things enforce it, and the redundancy is deliberate because the
   * failure is intermittent and reads as "cannot reproduce": the input is
   * debounced, each request aborts the one before it, and a monotonic sequence
   * number discards a late response even if its abort did not take. Without
   * this, typing a name can leave the box showing one query and the table
   * showing results for a shorter one.
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
    if (filters.capitalSource) params.set('capitalSource', filters.capitalSource);
    if (filters.market) params.set('market', filters.market);
    if (filters.propertyType) params.set('propertyType', filters.propertyType);
    if (filters.minGuarantor) params.set('minGuarantor', filters.minGuarantor);
    if (filters.minEquity) params.set('minEquity', filters.minEquity);
    if (filters.identifyWithinDays) params.set('identifyWithinDays', filters.identifyWithinDays);

    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/buyers?${params}`, { signal: controller.signal });
        const body = await response.json();

        if (requestId !== latestRequest.current) return;

        if (!response.ok) {
          setError(typeof body?.error === 'string' ? body.error : `Request failed (${response.status}).`);
          setData(null);
        } else {
          setData(body as BuyerSearchResult);
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
   * Changing any filter returns to page 1. Routing every change through here
   * makes that structural rather than something each new control has to
   * remember — the omission that stranded people on an empty page 3.
   */
  const updateFilters = useCallback((next: Partial<BuyerFilterState>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  /**
   * A translated question replaces the filters outright rather than merging.
   * Merging would leave a filter from a previous question silently narrowing
   * the new one, and the controls would no longer show the whole truth about
   * what is being searched.
   */
  const applyAiFilters = useCallback((next: BuyerFilterState) => {
    setFilters({ ...EMPTY_FILTERS, ...next });
    setPage(1);
  }, []);

  async function changeStatus(id: number, status: BuyerStatus) {
    setPendingId(id);
    try {
      const response = await fetch(`/api/buyers/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The audit entry needs a name against it, and this is the same
        // browser-local reviewer the deal workflow records.
        body: JSON.stringify({ status, actor: requireReviewerName() }),
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
  const isFiltered = Object.entries(filters).some(
    ([key, value]) => key !== 'sortBy' && value !== '',
  );

  return (
    <div>
      <BuyerAiSearch onFilters={applyAiFilters} />

      <div className="mt-5">
        <BuyerFilters filters={filters} onChange={updateFilters} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-b border-rule pb-2.5">
        <p className="flex items-center gap-2 text-sm text-ink-muted" aria-live="polite">
          <Users size={14} aria-hidden className="text-ink-faint" />
          {/* The count reflects the filters, so it can be trusted as the size of
              the result set rather than of the pipeline. */}
          <span>
            <strong className="font-medium text-ink">{total}</strong> buyer{total === 1 ? '' : 's'}
            {isFiltered ? ' match these filters' : ' in the pipeline'}
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
          <BuyerTable buyers={results} onStatusChange={changeStatus} pendingId={pendingId} />
        </div>
      ) : null}

      {!error && !loading && results.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-rule-strong bg-panel px-6 py-12 text-center">
          {/* Rendered as a child, so React escapes it. Building this line as raw
              HTML with the query interpolated is a reflected-XSS hole. */}
          <p className="text-sm text-ink-muted">
            {filters.q ? <>No buyers match “{filters.q}”.</> : 'No buyers match these filters.'}
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
