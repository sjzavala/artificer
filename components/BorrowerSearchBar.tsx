'use client';

import { Search } from 'lucide-react';
import { BORROWER_STATUSES, type BorrowerStatus, type SortKey } from '@/lib/borrower-search/types';

/**
 * The filter controls.
 *
 * Every control routes through one `onChange`, and the page resets to 1 on any
 * of them. In the sandbox each control reset the page individually and the
 * search input was the one that forgot — BUG-10. Making the reset a property of
 * *changing a filter* rather than of each handler is what stops that class of
 * bug returning when a seventh control is added.
 */

export interface BorrowerFilters {
  q: string;
  status: BorrowerStatus | '';
  state: string;
  minScore: string;
  sortBy: SortKey;
}

/** The states present in the fixture, so the menu offers nothing that returns nothing. */
const STATES = ['AZ', 'CA', 'CO', 'FL', 'GA', 'IL', 'NC', 'NY', 'TX', 'WA'];

const SORT_LABELS: Record<SortKey, string> = {
  id: 'Default',
  lastName: 'Last name (A–Z)',
  creditScore: 'Credit score (high to low)',
  loanAmount: 'Loan amount (high to low)',
  submittedAt: 'Most recently submitted',
};

export function BorrowerSearchBar({
  filters,
  onChange,
}: {
  filters: BorrowerFilters;
  onChange: (next: Partial<BorrowerFilters>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
      <Field label="Search borrowers" htmlFor="borrower-q">
        <div className="relative">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            id="borrower-q"
            type="search"
            autoComplete="off"
            placeholder="Name"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            className="focus-ring w-full rounded-md border border-rule bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>
      </Field>

      <Field label="Status" htmlFor="borrower-status">
        <Select
          id="borrower-status"
          value={filters.status}
          onChange={(value) => onChange({ status: value as BorrowerStatus | '' })}
        >
          <option value="">All statuses</option>
          {BORROWER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="State" htmlFor="borrower-state">
        <Select
          id="borrower-state"
          value={filters.state}
          onChange={(value) => onChange({ state: value })}
        >
          <option value="">All states</option>
          {STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Min. credit score" htmlFor="borrower-min-score">
        <input
          id="borrower-min-score"
          type="number"
          inputMode="numeric"
          min={300}
          max={850}
          placeholder="e.g. 700"
          value={filters.minScore}
          onChange={(e) => onChange({ minScore: e.target.value })}
          className="focus-ring w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
      </Field>

      <Field label="Sort by" htmlFor="borrower-sort">
        <Select
          id="borrower-sort"
          value={filters.sortBy}
          onChange={(value) => onChange({ sortBy: value as SortKey })}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink"
    >
      {children}
    </select>
  );
}
