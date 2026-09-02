'use client';

import { Search } from 'lucide-react';
import { BUYER_STATUSES, CAPITAL_SOURCES, type BuyerStatus, type CapitalSource } from '@/shared/buyer';
import { GUARANTOR_TYPES, PROPERTY_TYPES, type GuarantorType, type PropertyType } from '@/shared/schema';
import type { SortKey } from '@/lib/buyers/types';

/**
 * The filter controls.
 *
 * Every control routes through one `onChange`, and the page resets to page 1 on
 * any of them. Making the reset a property of *changing a filter* rather than
 * of each handler is what stops the "searched from page 3, got an empty page 3"
 * class of bug returning when an eighth control is added.
 */

export interface BuyerFilterState {
  q: string;
  status: BuyerStatus | '';
  capitalSource: CapitalSource | '';
  market: string;
  propertyType: PropertyType | '';
  minGuarantor: GuarantorType | '';
  minEquity: string;
  identifyWithinDays: string;
  sortBy: SortKey;
}

/** The states present in the fixture, so the menu offers nothing that returns nothing. */
const MARKETS = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'FL', 'GA', 'IA', 'ID', 'IL', 'IN', 'MD', 'MI',
  'MO', 'NC', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'SC', 'TN', 'TX', 'UT',
  'VA', 'WA', 'WI',
];

const SORT_LABELS: Record<SortKey, string> = {
  id: 'Default',
  entityName: 'Entity name (A–Z)',
  equity: 'Equity (high to low)',
  identifyBy: 'Deadline (soonest first)',
  addedOn: 'Recently added',
};

const DEADLINE_WINDOWS = [
  { value: '7', label: 'Within 7 days' },
  { value: '14', label: 'Within 14 days' },
  { value: '30', label: 'Within 30 days' },
  { value: '60', label: 'Within 60 days' },
];

const GUARANTOR_LABELS: Record<GuarantorType, string> = {
  corporate: 'Corporate only',
  franchisee: 'Franchisee ok',
  personal: 'Personal ok',
  none: 'Unguaranteed ok',
};

export function BuyerFilters({
  filters,
  onChange,
}: {
  filters: BuyerFilterState;
  onChange: (next: Partial<BuyerFilterState>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <Field label="Search buyers" htmlFor="buyer-q" className="sm:col-span-2 xl:col-span-1">
        <div className="relative">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            id="buyer-q"
            type="search"
            autoComplete="off"
            placeholder="Entity or contact"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            className="focus-ring w-full rounded-md border border-rule bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>
      </Field>

      <Field label="Status" htmlFor="buyer-status">
        <Select id="buyer-status" value={filters.status} onChange={(v) => onChange({ status: v as BuyerStatus | '' })}>
          <option value="">Any status</option>
          {BUYER_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Capital source" htmlFor="buyer-source">
        <Select
          id="buyer-source"
          value={filters.capitalSource}
          onChange={(v) => onChange({ capitalSource: v as CapitalSource | '' })}
        >
          <option value="">Any source</option>
          {CAPITAL_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Market" htmlFor="buyer-market">
        <Select id="buyer-market" value={filters.market} onChange={(v) => onChange({ market: v })}>
          <option value="">Any market</option>
          {MARKETS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Asset class" htmlFor="buyer-type">
        <Select
          id="buyer-type"
          value={filters.propertyType}
          onChange={(v) => onChange({ propertyType: v as PropertyType | '' })}
        >
          <option value="">Any class</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Accepts guaranty" htmlFor="buyer-guarantor">
        <Select
          id="buyer-guarantor"
          value={filters.minGuarantor}
          onChange={(v) => onChange({ minGuarantor: v as GuarantorType | '' })}
        >
          <option value="">Any guaranty</option>
          {GUARANTOR_TYPES.map((g) => (
            <option key={g} value={g}>
              {GUARANTOR_LABELS[g]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Min. equity (USD)" htmlFor="buyer-equity">
        <input
          id="buyer-equity"
          type="number"
          inputMode="numeric"
          min={0}
          step={250000}
          placeholder="e.g. 2000000"
          value={filters.minEquity}
          onChange={(e) => onChange({ minEquity: e.target.value })}
          className="focus-ring w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
      </Field>

      <Field label="1031 deadline" htmlFor="buyer-deadline">
        <Select
          id="buyer-deadline"
          value={filters.identifyWithinDays}
          onChange={(v) => onChange({ identifyWithinDays: v })}
        >
          <option value="">Any deadline</option>
          {DEADLINE_WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Sort by" htmlFor="buyer-sort">
        <Select id="buyer-sort" value={filters.sortBy} onChange={(v) => onChange({ sortBy: v as SortKey })}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
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
  className = '',
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
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
      className="focus-ring w-full rounded-md border border-rule bg-white px-3 py-2 text-sm capitalize text-ink"
    >
      {children}
    </select>
  );
}
