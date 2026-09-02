/**
 * The in-memory repository.
 *
 * It backs local development and the test suite, and it exists so the feature
 * is runnable before a database is provisioned — the same reason artificer's
 * document store falls back to local JSON files when there is no blob token.
 * Deployment uses Postgres; this is the fixture standing in for it.
 */

import { identificationDeadline, today, type Buyer, type BuyerStatus } from '@/shared/buyer';
import { decorate } from './decorate';
import { seedBuyers } from './seed';
import type { BuyerQuery, BuyerRepo, BuyerRow, BuyerSearchResult, SortKey } from './types';

/**
 * Comparators mirroring the ORDER BY fragments in `queries.ts`, tiebreaker
 * included. Two implementations of one ordering is a real risk of drift, which
 * is why the tests assert the interesting cases rather than trusting the pair
 * to stay in step.
 */
const COMPARATORS: Record<SortKey, (a: Buyer, b: Buyer) => number> = {
  id: (a, b) => a.id - b.id,
  entityName: (a, b) => a.entityName.localeCompare(b.entityName) || a.id - b.id,
  // Numeric, not textual.
  equity: (a, b) => b.equity - a.equity || a.id - b.id,
  // Nulls last, matching NULLS LAST — a buyer with no clock is not "soonest".
  identifyBy: (a, b) => {
    if (a.exchangeStartedOn === b.exchangeStartedOn) return a.id - b.id;
    if (a.exchangeStartedOn === null) return 1;
    if (b.exchangeStartedOn === null) return -1;
    return a.exchangeStartedOn.localeCompare(b.exchangeStartedOn) || a.id - b.id;
  },
  addedOn: (a, b) => b.addedOn.localeCompare(a.addedOn) || a.id - b.id,
};

export class InMemoryBuyerRepo implements BuyerRepo {
  private readonly rows: Buyer[];

  constructor(rows: Buyer[] = seedBuyers()) {
    this.rows = rows;
  }

  async search(query: BuyerQuery, now: string = today()): Promise<BuyerSearchResult> {
    const matched = this.rows.filter((row) => matches(row, query, now));

    // The count comes from the filtered set, not from `this.rows`.
    const total = matched.length;
    const sorted = [...matched].sort(COMPARATORS[query.sortBy]);

    const offset = (query.page - 1) * query.limit;
    // A full page of `limit` rows.
    const results = sorted.slice(offset, offset + query.limit).map((row) => decorate(row, now));

    return {
      results,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async byId(id: number, now: string = today()): Promise<BuyerRow | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? decorate(row, now) : null;
  }

  async updateStatus(id: number, status: BuyerStatus, now: string = today()): Promise<BuyerRow | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return null;
    row.status = status;
    return decorate(row, now);
  }
}

function matches(row: Buyer, query: BuyerQuery, now: string): boolean {
  if (query.q) {
    // Case-insensitive substring, matching ILIKE. The query is already trimmed
    // by `normalizeQuery`.
    const needle = query.q.toLowerCase();
    const hit =
      row.entityName.toLowerCase().includes(needle) || row.contactName.toLowerCase().includes(needle);
    if (!hit) return false;
  }

  if (query.status && row.status !== query.status) return false;
  if (query.capitalSource && row.capitalSource !== query.capitalSource) return false;
  if (query.minGuarantor && row.minGuarantor !== query.minGuarantor) return false;
  if (query.market && !row.markets.includes(query.market)) return false;
  if (query.propertyType && !row.propertyTypes.includes(query.propertyType)) return false;
  // Inclusive.
  if (query.minEquity !== null && row.equity < query.minEquity) return false;

  if (query.identifyWithinDays !== null) {
    const deadline = identificationDeadline(row.exchangeStartedOn);
    if (!deadline) return false;
    // Between today and the horizon; a closed window is excluded.
    const horizon = addDaysTo(now, query.identifyWithinDays);
    if (deadline < now || deadline > horizon) return false;
  }

  return true;
}

function addDaysTo(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
