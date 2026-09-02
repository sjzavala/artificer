/**
 * Query normalisation and SQL construction.
 *
 * Several properties here were paid for once already, in the borrower-search
 * port this feature replaced: case-insensitive and trimmed name matching,
 * inclusive numeric bounds, a page that returns a full page, a count that
 * respects the filters, numeric sorting of money, a unique tiebreaker, and
 * escaped LIKE metacharacters. They are carried across deliberately rather than
 * rediscovered, and the tests that named them came with them.
 */

import {
  IDENTIFICATION_DAYS,
  isBuyerStatus,
  isCapitalSource,
  isGuarantorType,
  isPropertyType,
} from '@/shared/buyer';
import { DEFAULT_LIMIT, MAX_LIMIT, isSortKey, type BuyerQuery, type SortKey } from './types';

/**
 * ORDER BY fragments, keyed by the API's sort values. Never user-supplied: a
 * request names a key, and an unknown key falls back to `id`.
 *
 * `equity` sorts as the integer it is. Sorting money as text is the defect that
 * put $90,000 above $950,000 in the feature this replaced.
 *
 * Ordering by `identifyBy` is ordering by `exchange_started_on` — the deadline
 * is a fixed offset from it, so the two orderings are identical and the cheaper
 * one uses the column's own index. NULLS LAST keeps the buyers with no clock
 * out of the way of the ones running out of time.
 *
 * Every fragment ends in `id`. Without a unique tiebreaker two buyers sharing
 * an equity figure can swap places between requests, so one row shows twice and
 * another never shows at all — and the fixture has exactly that, with two
 * buyers at $2,000,000.
 */
const ORDER_BY: Record<SortKey, string> = {
  id: 'id ASC',
  entityName: 'entity_name ASC, id ASC',
  equity: 'equity DESC, id ASC',
  identifyBy: 'exchange_started_on ASC NULLS LAST, id ASC',
  addedOn: 'added_on DESC, id ASC',
};

/**
 * The stored columns. The exchange deadlines are deliberately absent: they are
 * derived in `shared/buyer.ts` from `exchangeStartedOn`, so there is one
 * implementation of the 45- and 180-day rules rather than one here and another
 * in the in-memory repository that could quietly disagree.
 *
 * The cap rates and equity are cast to float8 because `numeric` and `bigint`
 * both come back from the driver as strings — deliberately, since neither fits
 * JavaScript's number type in general. Money here tops out in the tens of
 * millions, far inside float64's exact-integer range, so the cast is safe and
 * the alternative is worse: without it this repository returns a string where
 * the in-memory one returns a number, and the same field has two types
 * depending on which backend answered. Comparisons survive that by coercion.
 * Formatting does not — `toLocaleString` on a string returns it unchanged, so
 * $3,600,000 renders as $3600000 and nobody notices for a while.
 */
export const SELECT_COLUMNS = `
  id,
  entity_name  AS "entityName",
  contact_name AS "contactName",
  email,
  capital_source AS "capitalSource",
  equity::float8 AS equity,
  target_cap_rate_min::float8 AS "targetCapRateMin",
  target_cap_rate_max::float8 AS "targetCapRateMax",
  property_types AS "propertyTypes",
  min_guarantor  AS "minGuarantor",
  markets,
  status,
  to_char(exchange_started_on, 'YYYY-MM-DD') AS "exchangeStartedOn",
  to_char(added_on, 'YYYY-MM-DD')            AS "addedOn"
`;

/**
 * Turns raw request parameters into a query the repositories can trust.
 *
 * Anything unparseable becomes "no filter" rather than an error. This is a
 * search box: a stray character in the equity field should widen the results,
 * not produce a 400 the table has no way to render.
 */
export function normalizeQuery(params: URLSearchParams): BuyerQuery {
  const q = (params.get('q') ?? '').trim();

  const rawStatus = params.get('status');
  const rawSource = params.get('capitalSource');
  const rawType = params.get('propertyType');
  const rawGuarantor = params.get('minGuarantor');

  const rawMarket = (params.get('market') ?? '').trim().toUpperCase();
  const market = /^[A-Z]{2}$/.test(rawMarket) ? rawMarket : null;

  const rawSort = params.get('sortBy');

  return {
    q,
    status: isBuyerStatus(rawStatus) ? rawStatus : null,
    capitalSource: isCapitalSource(rawSource) ? rawSource : null,
    market,
    propertyType: isPropertyType(rawType) ? rawType : null,
    minGuarantor: isGuarantorType(rawGuarantor) ? rawGuarantor : null,
    minEquity: nonNegative(toInt(params.get('minEquity'))),
    identifyWithinDays: nonNegative(toInt(params.get('identifyWithinDays'))),
    sortBy: isSortKey(rawSort) ? rawSort : 'id',
    page: Math.max(1, toInt(params.get('page')) ?? 1),
    limit: clamp(toInt(params.get('limit')) ?? DEFAULT_LIMIT, 1, MAX_LIMIT),
  };
}

function toInt(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** A negative equity floor or deadline window is not a filter anyone meant. */
function nonNegative(n: number | null): number | null {
  return n === null || n < 0 ? null : n;
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

/**
 * A buyer id from a URL segment, or null if it is not one.
 *
 * Strict digits rather than `Number(id)`, which happily accepts `1e3`, ` 7 `,
 * `0x2a` and the empty string.
 */
export function parseBuyerId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export interface SearchSql {
  rowsSql: string;
  countSql: string;
  filterParams: unknown[];
  rowsParams: unknown[];
}

/**
 * Builds the pair of statements a search needs.
 *
 * The count carries the same WHERE clause and the same parameters as the rows.
 * Counting the whole table instead is what made a three-result search claim
 * sixty and offer five empty pages.
 */
export function buildSearchSql(query: BuyerQuery, now: string): SearchSql {
  const where: string[] = [];
  const filterParams: unknown[] = [];

  if (query.q) {
    // ILIKE, not LIKE: Postgres `LIKE` is case-sensitive, and people type
    // lowercase. Both the entity and the person are searched, because a broker
    // remembers one or the other.
    filterParams.push(`%${escapeLike(query.q)}%`);
    const p = `$${filterParams.length}`;
    where.push(`(entity_name ILIKE ${p} ESCAPE '\\' OR contact_name ILIKE ${p} ESCAPE '\\')`);
  }

  for (const [column, value] of [
    ['status', query.status],
    ['capital_source', query.capitalSource],
    ['min_guarantor', query.minGuarantor],
  ] as const) {
    if (value) {
      filterParams.push(value);
      where.push(`${column} = $${filterParams.length}`);
    }
  }

  // A buyer holds a list of markets and a list of asset classes; the filter
  // names one and asks whether it is in the list.
  if (query.market) {
    filterParams.push(query.market);
    where.push(`$${filterParams.length} = ANY(markets)`);
  }
  if (query.propertyType) {
    filterParams.push(query.propertyType);
    where.push(`$${filterParams.length} = ANY(property_types)`);
  }

  if (query.minEquity !== null) {
    // Inclusive. A buyer with exactly $2,000,000 is a buyer with $2M — dropping
    // them from a "$2M and up" search is the kind of quiet exclusion nobody
    // notices until a deal is lost.
    filterParams.push(query.minEquity);
    where.push(`equity >= $${filterParams.length}`);
  }

  if (query.identifyWithinDays !== null) {
    // Between today and the horizon: a window that has already closed is not
    // urgent, it is over, and showing it under "closing soon" would be wrong.
    // `date + integer` adds days in Postgres, so no interval arithmetic.
    filterParams.push(now);
    const today = `$${filterParams.length}::date`;
    filterParams.push(query.identifyWithinDays);
    // `::int` is load-bearing. An untyped parameter leaves Postgres unable to
    // choose between `date + integer` and `date + interval`, and it refuses
    // with "operator is not unique: date + unknown" rather than guessing.
    const horizon = `$${filterParams.length}::int`;
    where.push(
      `exchange_started_on IS NOT NULL AND ` +
        `exchange_started_on + ${IDENTIFICATION_DAYS} BETWEEN ${today} AND ${today} + ${horizon}`,
    );
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.limit;

  // A full page of `limit` rows. Asking for `limit - 1` while advancing the
  // offset by `limit` is what made every tenth record unreachable.
  const rowsParams = [...filterParams, query.limit, offset];

  return {
    rowsSql: `
      SELECT ${SELECT_COLUMNS}
      FROM buyers
      ${whereSql}
      ORDER BY ${ORDER_BY[query.sortBy]}
      LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}
    `,
    countSql: `SELECT count(*)::int AS total FROM buyers ${whereSql}`,
    filterParams,
    rowsParams,
  };
}

/**
 * Escapes the LIKE metacharacters.
 *
 * Without this a search for `%` matches every buyer and `_` matches any single
 * character — a pattern language the user did not know they were writing.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
