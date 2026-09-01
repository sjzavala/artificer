/**
 * Query normalisation and SQL construction.
 *
 * Every planted filter defect lived in this layer in the sandbox, so this is
 * where most of the fixes are. They are marked `BUG-n fixed` against the
 * numbering in the sandbox's PLANTED-BUGS.md, because "why is this `>=`" has a
 * real answer and someone will ask.
 */

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  isBorrowerStatus,
  isSortKey,
  type BorrowerQuery,
  type SortKey,
} from './types';

/**
 * ORDER BY fragments, keyed by the API's sort values. Never user-supplied: a
 * request names a key, and an unknown key falls back to `id` rather than
 * reaching the query.
 *
 * BUG-6 fixed — `loan_amount DESC` sorts the integer column as an integer. The
 * sandbox cast it to text, which put $90,000 above $950,000 because a text
 * comparison never reaches the second digit.
 *
 * Every fragment ends in `id`. Without a unique tiebreaker, two borrowers
 * sharing a credit score can swap places between two requests, so a row is
 * shown twice on one page and skipped on the next. The fixture has exactly that
 * — ids 6 and 13 both score 700 — which makes it reproducible rather than
 * theoretical.
 */
const ORDER_BY: Record<SortKey, string> = {
  id: 'id ASC',
  lastName: 'last_name ASC, id ASC',
  creditScore: 'credit_score DESC, id ASC',
  loanAmount: 'loan_amount DESC, id ASC',
  submittedAt: 'submitted_at DESC, id ASC',
};

/** The columns the API exposes. `ssn` is truncated in SQL, so BUG-8 cannot recur. */
export const SELECT_COLUMNS = `
  id,
  first_name    AS "firstName",
  last_name     AS "lastName",
  email,
  right(ssn, 4) AS "ssnLast4",
  credit_score  AS "creditScore",
  loan_amount   AS "loanAmount",
  state,
  status,
  to_char(submitted_at, 'YYYY-MM-DD') AS "submittedAt"
`;

/**
 * Turns raw request parameters into a query the repositories can trust.
 *
 * Anything unparseable becomes "no filter" rather than an error. This is a
 * search box: a stray character in the credit-score field should widen the
 * results, not produce a 400 that the table has no way to render.
 */
export function normalizeQuery(params: URLSearchParams): BorrowerQuery {
  // BUG-2 fixed — the query is trimmed. In the sandbox "Smith " matched nothing,
  // and trailing whitespace is what you get from a paste or a phone keyboard.
  const q = (params.get('q') ?? '').trim();

  const rawStatus = params.get('status');
  const status = isBorrowerStatus(rawStatus) ? rawStatus : null;

  const rawState = (params.get('state') ?? '').trim().toUpperCase();
  const state = /^[A-Z]{2}$/.test(rawState) ? rawState : null;

  const minScore = toInt(params.get('minScore'));

  const rawSort = params.get('sortBy');
  const sortBy: SortKey = isSortKey(rawSort) ? rawSort : 'id';

  const page = Math.max(1, toInt(params.get('page')) ?? 1);
  const limit = clamp(toInt(params.get('limit')) ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

  return { q, status, state, minScore, sortBy, page, limit };
}

/**
 * A borrower id from a URL segment, or null if it is not one.
 *
 * Strict digits rather than `Number(id)`, which happily accepts `1e3`, ` 7 `,
 * `0x2a` and the empty string. A path that is not an id should 404 rather than
 * quietly resolve to some other borrower.
 */
export function parseBorrowerId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function toInt(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

export interface SearchSql {
  rowsSql: string;
  countSql: string;
  /** Filter parameters, shared by both statements. */
  filterParams: unknown[];
  /** Filter parameters plus limit and offset, for the rows statement. */
  rowsParams: unknown[];
}

/**
 * Builds the pair of statements a search needs.
 *
 * BUG-4 fixed — the count carries the same WHERE clause and the same
 * parameters as the rows. The sandbox counted the whole table, so searching
 * "Smith" showed three rows under a heading that claimed sixty, with six pages
 * of pagination, five of them empty.
 */
export function buildSearchSql(query: BorrowerQuery): SearchSql {
  const where: string[] = [];
  const filterParams: unknown[] = [];

  if (query.q) {
    // BUG-1 fixed — ILIKE. Postgres `LIKE` is case-sensitive, so the sandbox
    // returned nothing for "smith" and three rows for "Smith". People type
    // lowercase.
    filterParams.push(`%${escapeLike(query.q)}%`);
    const p = `$${filterParams.length}`;
    where.push(`(last_name ILIKE ${p} ESCAPE '\\' OR first_name ILIKE ${p} ESCAPE '\\')`);
  }

  if (query.status) {
    filterParams.push(query.status);
    where.push(`status = $${filterParams.length}`);
  }

  if (query.state) {
    filterParams.push(query.state);
    where.push(`state = $${filterParams.length}`);
  }

  if (query.minScore !== null) {
    // BUG-5 fixed — inclusive. `>` dropped the two borrowers scoring exactly
    // 700, which is the number a lender filtering at a policy threshold would
    // most expect to see.
    filterParams.push(query.minScore);
    where.push(`credit_score >= $${filterParams.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.limit;

  // BUG-3 fixed — the page returns `limit` rows. The sandbox asked for
  // `limit - 1` while advancing the offset by `limit`, so borrowers 10, 20, 30,
  // 40, 50 and 60 could not be reached through the UI at all.
  const rowsParams = [...filterParams, query.limit, offset];

  return {
    rowsSql: `
      SELECT ${SELECT_COLUMNS}
      FROM borrowers
      ${whereSql}
      ORDER BY ${ORDER_BY[query.sortBy]}
      LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}
    `,
    countSql: `SELECT count(*)::int AS total FROM borrowers ${whereSql}`,
    filterParams,
    rowsParams,
  };
}

/**
 * Escapes the LIKE metacharacters.
 *
 * Without this, a search for `%` matches every borrower and `_` matches any
 * single character — the search box quietly accepting a pattern language the
 * user did not know they were writing. Not one of the planted ten; it arrives
 * with ILIKE.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
