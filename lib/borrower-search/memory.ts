/**
 * The in-memory repository.
 *
 * It backs local development and the test suite, and it exists so the feature
 * is runnable before a database is provisioned — the same reason artificer's
 * document store falls back to local JSON files when there is no blob token.
 *
 * It is not the flattened-JSON production store the integration plan ruled out.
 * Deployment uses Postgres; this is the fixture standing in for it, and it
 * answers every question with the semantics `queries.ts` describes so a test
 * written against it stays true against SQL.
 */

import { seedBorrowers } from './seed';
import {
  toBorrower,
  type Borrower,
  type BorrowerQuery,
  type BorrowerRecord,
  type BorrowerRepo,
  type BorrowerSearchResult,
  type BorrowerStatus,
  type SortKey,
} from './types';

/**
 * Comparators mirroring the ORDER BY fragments in `queries.ts`, tiebreaker
 * included. Two implementations of one ordering is a real risk of drift, which
 * is why `tests/borrower-search.test.ts` asserts the interesting cases against
 * both rather than trusting the pair to stay in step.
 */
const COMPARATORS: Record<SortKey, (a: BorrowerRecord, b: BorrowerRecord) => number> = {
  id: (a, b) => a.id - b.id,
  lastName: (a, b) => a.lastName.localeCompare(b.lastName) || a.id - b.id,
  // Numeric, not textual — BUG-6 stays fixed on this side too.
  creditScore: (a, b) => b.creditScore - a.creditScore || a.id - b.id,
  loanAmount: (a, b) => b.loanAmount - a.loanAmount || a.id - b.id,
  submittedAt: (a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id - b.id,
};

export class InMemoryBorrowerRepo implements BorrowerRepo {
  private readonly rows: BorrowerRecord[];

  constructor(rows: BorrowerRecord[] = seedBorrowers()) {
    this.rows = rows;
  }

  async search(query: BorrowerQuery): Promise<BorrowerSearchResult> {
    const matched = this.rows.filter((row) => matches(row, query));

    // The count comes from the filtered set, not from `this.rows` — BUG-4.
    const total = matched.length;
    const sorted = [...matched].sort(COMPARATORS[query.sortBy]);

    const offset = (query.page - 1) * query.limit;
    // A full page of `limit` rows, not `limit - 1` — BUG-3.
    const results = sorted.slice(offset, offset + query.limit).map(toBorrower);

    return {
      results,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async byId(id: number): Promise<Borrower | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? toBorrower(row) : null;
  }

  async updateStatus(id: number, status: BorrowerStatus): Promise<Borrower | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return null;
    row.status = status;
    return toBorrower(row);
  }
}

function matches(row: BorrowerRecord, query: BorrowerQuery): boolean {
  if (query.q) {
    // Case-insensitive substring, matching ILIKE — BUG-1. The query is already
    // trimmed by `normalizeQuery` — BUG-2.
    const needle = query.q.toLowerCase();
    const hit =
      row.lastName.toLowerCase().includes(needle) || row.firstName.toLowerCase().includes(needle);
    if (!hit) return false;
  }

  if (query.status && row.status !== query.status) return false;
  if (query.state && row.state !== query.state) return false;
  // Inclusive — BUG-5.
  if (query.minScore !== null && row.creditScore < query.minScore) return false;

  return true;
}
