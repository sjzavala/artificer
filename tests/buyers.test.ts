import { describe, expect, it } from 'vitest';
import { InMemoryBuyerRepo } from '@/lib/buyers/memory';
import { buildSearchSql, normalizeQuery, parseBuyerId } from '@/lib/buyers/queries';
import { seedBuyers, BUYER_COUNT } from '@/lib/buyers/seed';
import { DEFAULT_LIMIT, MAX_LIMIT, type BuyerQuery } from '@/lib/buyers/types';
import {
  addDays,
  closingDeadline,
  daysBetween,
  identificationDeadline,
  identificationUrgency,
  capRateFits,
} from '@/shared/buyer';

/**
 * Two groups of tests here.
 *
 * The first covers the exchange deadline rules, which are the domain logic this
 * feature exists to surface — a wrong 45-day date is worse than no date.
 *
 * The second carries over the correctness properties established by the
 * borrower-search port this replaced. Those were paid for once; a test named
 * after each is how they stay paid for.
 */

/** A fixed "today", so a deadline assertion means the same thing next month. */
const NOW = '2026-09-01';

const repo = () => new InMemoryBuyerRepo(seedBuyers({ baseDate: NOW }));

function query(overrides: Partial<BuyerQuery> = {}): BuyerQuery {
  return {
    q: '',
    status: null,
    capitalSource: null,
    market: null,
    propertyType: null,
    minGuarantor: null,
    minEquity: null,
    identifyWithinDays: null,
    sortBy: 'id',
    page: 1,
    limit: DEFAULT_LIMIT,
    ...overrides,
  };
}

const params = (search: string) => normalizeQuery(new URLSearchParams(search));

// ---------------------------------------------------------------------------
// The 1031 clock
// ---------------------------------------------------------------------------

describe('exchange deadlines', () => {
  it('counts 45 and 180 calendar days from the sale closing', () => {
    expect(identificationDeadline('2026-01-01')).toBe('2026-02-15');
    expect(closingDeadline('2026-01-01')).toBe('2026-06-30');
  });

  it('counts calendar days, not business days, across a month boundary', () => {
    // 45 days from 31 Jan lands in March, not "six weeks of weekdays" later.
    expect(identificationDeadline('2026-01-31')).toBe('2026-03-17');
  });

  it('handles a leap year without drifting a day', () => {
    // 2028 is a leap year: 45 days from 1 Feb crosses 29 Feb.
    expect(identificationDeadline('2028-02-01')).toBe('2028-03-17');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('has no deadline for a buyer who is not in an exchange', () => {
    expect(identificationDeadline(null)).toBeNull();
    expect(closingDeadline(null)).toBeNull();
  });

  it('grades urgency the way a broker would talk about it', () => {
    const on = (daysAgo: number) => identificationUrgency(addDays(NOW, -daysAgo), NOW);

    expect(on(0).urgency).toBe('comfortable'); // 45 days out
    expect(on(30).urgency).toBe('comfortable'); // 15 days out
    expect(on(31).urgency).toBe('soon'); // 14 days — inside two weeks
    expect(on(38).urgency).toBe('critical'); // 7 days — inside a week
    expect(on(45).urgency).toBe('critical'); // due today
    expect(on(46).urgency).toBe('passed'); // yesterday; there is no grace period
  });

  it('reports days left, negative once the window has closed', () => {
    expect(identificationUrgency(addDays(NOW, -45), NOW).daysLeft).toBe(0);
    expect(identificationUrgency(addDays(NOW, -50), NOW).daysLeft).toBe(-5);
    expect(daysBetween('2026-09-01', '2026-09-15')).toBe(14);
  });

  it('is inclusive at both ends of a cap rate band', () => {
    const buyer = { targetCapRateMin: 6, targetCapRateMax: 7 };
    expect(capRateFits(buyer, 6)).toBe(true);
    expect(capRateFits(buyer, 7)).toBe(true);
    expect(capRateFits(buyer, 5.99)).toBe(false);
    expect(capRateFits(buyer, 7.01)).toBe(false);
  });
});

describe('the fixture', () => {
  const rows = seedBuyers({ baseDate: NOW });

  it('is sixty buyers', () => {
    expect(rows).toHaveLength(BUYER_COUNT);
  });

  it('keeps the anchors the tests below assert on', () => {
    expect(rows.filter((r) => r.entityName.startsWith('Ridgeline'))).toHaveLength(3);
    expect(rows.filter((r) => r.equity === 2_000_000).map((r) => r.id)).toEqual([6, 13]);
    // One buyer due today and one a week out, so urgency is never all one colour.
    expect(rows.find((r) => r.id === 9)?.exchangeStartedOn).toBe(addDays(NOW, -45));
    expect(rows.find((r) => r.id === 17)?.exchangeStartedOn).toBe(addDays(NOW, -38));
  });

  it('gives an exchange clock only to exchange buyers', () => {
    for (const row of rows) {
      const hasClock = row.exchangeStartedOn !== null;
      expect(hasClock, `buyer ${row.id} (${row.capitalSource})`).toBe(row.capitalSource === '1031 exchange');
    }
  });

  it('never produces an inverted cap rate band or an empty list', () => {
    for (const row of rows) {
      expect(row.targetCapRateMax).toBeGreaterThanOrEqual(row.targetCapRateMin);
      expect(row.propertyTypes.length).toBeGreaterThan(0);
      expect(row.markets.length).toBeGreaterThan(0);
    }
  });

  it('hands out a fresh copy each call, so a status edit cannot leak between tests', async () => {
    const first = repo();
    await first.updateStatus(1, 'closed', NOW);
    expect((await repo().byId(1, NOW))?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// The deadline filter — the reason this feature has an AI search at all
// ---------------------------------------------------------------------------

describe('identifyWithinDays', () => {
  it('returns only buyers whose window closes inside the horizon', async () => {
    const { results } = await repo().search(query({ identifyWithinDays: 14, limit: MAX_LIMIT }), NOW);
    for (const row of results) {
      expect(row.daysToIdentify).not.toBeNull();
      expect(row.daysToIdentify!).toBeGreaterThanOrEqual(0);
      expect(row.daysToIdentify!).toBeLessThanOrEqual(14);
    }
    expect(results.map((r) => r.id)).toContain(9); // due today
    expect(results.map((r) => r.id)).toContain(17); // seven days out
  });

  it('excludes a window that has already closed', async () => {
    const { results } = await repo().search(query({ identifyWithinDays: 60, limit: MAX_LIMIT }), NOW);
    // A passed deadline is not urgent, it is over.
    expect(results.every((r) => (r.daysToIdentify ?? -1) >= 0)).toBe(true);
  });

  it('excludes buyers with no exchange at all', async () => {
    const { results } = await repo().search(query({ identifyWithinDays: 365, limit: MAX_LIMIT }), NOW);
    expect(results.every((r) => r.capitalSource === '1031 exchange')).toBe(true);
  });

  it('widens as the horizon grows', async () => {
    const counts = await Promise.all(
      [7, 14, 30, 60].map(async (d) => (await repo().search(query({ identifyWithinDays: d }), NOW)).total),
    );
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts.at(-1)!).toBeGreaterThan(counts[0]);
  });

  it('emits a bounded BETWEEN rather than an open-ended comparison', () => {
    const { rowsSql } = buildSearchSql(query({ identifyWithinDays: 14 }), NOW);
    expect(rowsSql).toMatch(/exchange_started_on IS NOT NULL/);
    expect(rowsSql).toMatch(/exchange_started_on \+ 45 BETWEEN/);
  });
});

describe('sorting by deadline', () => {
  it('puts the soonest first and the buyers with no clock last', async () => {
    const { results } = await repo().search(query({ sortBy: 'identifyBy', limit: MAX_LIMIT }), NOW);
    const withClock = results.filter((r) => r.identifyBy !== null);
    const without = results.filter((r) => r.identifyBy === null);

    expect(results.slice(0, withClock.length).every((r) => r.identifyBy !== null)).toBe(true);
    expect(without.length).toBeGreaterThan(0);

    const dates = withClock.map((r) => r.identifyBy!);
    expect(dates).toEqual([...dates].sort());
  });

  it('declares NULLS LAST in SQL, so the two backends agree', () => {
    const { rowsSql } = buildSearchSql(query({ sortBy: 'identifyBy' }), NOW);
    expect(rowsSql).toMatch(/ORDER BY exchange_started_on ASC NULLS LAST, id ASC/);
  });
});

// ---------------------------------------------------------------------------
// Properties carried over from the borrower-search port
// ---------------------------------------------------------------------------

describe('name search is case-insensitive and trimmed', () => {
  it('finds the Ridgelines however the name is typed', async () => {
    for (const term of ['Ridgeline', 'ridgeline', 'RIDGELINE', 'rIdGeLiNe']) {
      const { total } = await repo().search(query({ q: term }), NOW);
      expect(total, `searching "${term}"`).toBe(3);
    }
  });

  it('ignores surrounding whitespace', async () => {
    expect((await repo().search(query({ q: params('q=+++Ridgeline+++').q }), NOW)).total).toBe(3);
    expect(params('q=+++').q).toBe('');
  });

  it('searches the contact as well as the entity', async () => {
    const [first] = (await repo().search(query({ limit: 1 }), NOW)).results;
    const surname = first.contactName.split(' ').at(-1)!;
    const { total } = await repo().search(query({ q: surname.toLowerCase(), limit: MAX_LIMIT }), NOW);
    expect(total).toBeGreaterThan(0);
  });

  it('emits ILIKE rather than LIKE', () => {
    const { rowsSql } = buildSearchSql(query({ q: 'ridgeline' }), NOW);
    expect(rowsSql).toMatch(/ILIKE/);
    expect(rowsSql).not.toMatch(/[^I]LIKE/);
  });
});

describe('a page returns a full page', () => {
  it('returns `limit` rows, not `limit - 1`', async () => {
    expect((await repo().search(query({ limit: 10 }), NOW)).results).toHaveLength(10);
  });

  it('leaves no buyer unreachable through pagination', async () => {
    const seen: number[] = [];
    for (let page = 1; page <= 6; page += 1) {
      seen.push(...(await repo().search(query({ page, limit: 10 }), NOW)).results.map((r) => r.id));
    }
    expect(seen).toHaveLength(BUYER_COUNT);
    expect(new Set(seen).size).toBe(BUYER_COUNT);
  });

  it('passes the real limit to SQL', () => {
    const { rowsParams } = buildSearchSql(query({ page: 2, limit: 10 }), NOW);
    expect(rowsParams.slice(-2)).toEqual([10, 10]);
  });
});

describe('the total respects the filters', () => {
  it('counts matches, not the whole pipeline', async () => {
    const { total, totalPages } = await repo().search(query({ q: 'Ridgeline' }), NOW);
    expect(total).toBe(3);
    expect(totalPages).toBe(1);
  });

  it('gives the count query the same WHERE and parameters as the rows query', () => {
    const { countSql, filterParams, rowsParams } = buildSearchSql(
      query({ q: 'Ridgeline', status: 'active' }),
      NOW,
    );
    expect(countSql).toMatch(/WHERE/);
    expect(countSql).toMatch(/ILIKE/);
    expect(filterParams).toEqual(['%Ridgeline%', 'active']);
    expect(rowsParams.slice(0, filterParams.length)).toEqual(filterParams);
  });
});

describe('the equity floor is inclusive', () => {
  it('keeps the two buyers holding exactly $2,000,000', async () => {
    const { results, total } = await repo().search(query({ minEquity: 2_000_000, limit: MAX_LIMIT }), NOW);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(6);
    expect(ids).toContain(13);

    const exclusive = await repo().search(query({ minEquity: 2_000_001, limit: MAX_LIMIT }), NOW);
    expect(total - exclusive.total).toBe(2);
  });

  it('emits >= rather than >', () => {
    expect(buildSearchSql(query({ minEquity: 2_000_000 }), NOW).rowsSql).toMatch(/equity >= \$1/);
  });
});

describe('equity sorts numerically', () => {
  it('puts the largest first', async () => {
    const { results } = await repo().search(query({ sortBy: 'equity', limit: 5 }), NOW);
    const values = results.map((r) => r.equity);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(values[0]).toBeGreaterThan(values.at(-1)!);
  });

  it('does not cast the column to text', () => {
    const { rowsSql } = buildSearchSql(query({ sortBy: 'equity' }), NOW);
    expect(rowsSql).toMatch(/ORDER BY equity DESC/);
    expect(rowsSql).not.toMatch(/equity::text/);
  });
});

describe('pagination is stable across requests', () => {
  it('breaks ties on id so a row cannot repeat or vanish between pages', async () => {
    const first = await repo().search(query({ sortBy: 'equity', page: 1, limit: 30 }), NOW);
    const second = await repo().search(query({ sortBy: 'equity', page: 2, limit: 30 }), NOW);
    const ids = [...first.results, ...second.results].map((r) => r.id);
    expect(new Set(ids).size).toBe(BUYER_COUNT);
  });

  it('names id as the tiebreaker in every non-trivial ordering', () => {
    for (const sortBy of ['entityName', 'equity', 'identifyBy', 'addedOn'] as const) {
      expect(buildSearchSql(query({ sortBy }), NOW).rowsSql).toMatch(/, id ASC/);
    }
  });
});

describe('array membership filters', () => {
  it('matches a market inside the buyer’s list, not the whole list', async () => {
    const { results, total } = await repo().search(query({ market: 'TX', limit: MAX_LIMIT }), NOW);
    expect(total).toBeGreaterThan(0);
    expect(results.every((r) => r.markets.includes('TX'))).toBe(true);
    // The buyer holds several markets; matching one of them is the point.
    expect(results.some((r) => r.markets.length > 1)).toBe(true);
  });

  it('matches an asset class inside the buyer’s list', async () => {
    const { results, total } = await repo().search(query({ propertyType: 'industrial', limit: MAX_LIMIT }), NOW);
    expect(total).toBeGreaterThan(0);
    expect(results.every((r) => r.propertyTypes.includes('industrial'))).toBe(true);
  });

  it('uses = ANY(...) rather than equality against the array', () => {
    const { rowsSql } = buildSearchSql(query({ market: 'TX', propertyType: 'retail' }), NOW);
    expect(rowsSql).toMatch(/\$\d+ = ANY\(markets\)/);
    expect(rowsSql).toMatch(/\$\d+ = ANY\(property_types\)/);
  });
});

describe('normalizeQuery', () => {
  it('defaults everything that is absent', () => {
    expect(params('')).toEqual(query());
  });

  it('drops values it cannot use rather than rejecting the request', () => {
    expect(params('status=Bananas').status).toBeNull();
    expect(params('capitalSource=crypto').capitalSource).toBeNull();
    expect(params('propertyType=castle').propertyType).toBeNull();
    expect(params('minGuarantor=vibes').minGuarantor).toBeNull();
    expect(params('sortBy=DROP+TABLE').sortBy).toBe('id');
    expect(params('minEquity=lots').minEquity).toBeNull();
    expect(params('market=California').market).toBeNull();
  });

  it('upper-cases a two-letter market', () => {
    expect(params('market=tx').market).toBe('TX');
  });

  it('rejects a negative floor or window, which is not a filter anyone meant', () => {
    expect(params('minEquity=-100').minEquity).toBeNull();
    expect(params('identifyWithinDays=-5').identifyWithinDays).toBeNull();
  });

  it('clamps the page and the limit into a sane range', () => {
    expect(params('page=0').page).toBe(1);
    expect(params('limit=0').limit).toBe(1);
    expect(params('limit=100000').limit).toBe(MAX_LIMIT);
  });
});

describe('LIKE metacharacters are escaped', () => {
  it('treats % and _ as literal text', async () => {
    expect((await repo().search(query({ q: '%' }), NOW)).total).toBe(0);
    expect((await repo().search(query({ q: '_idgeline' }), NOW)).total).toBe(0);
  });

  it('escapes them in the parameter and declares the escape character', () => {
    const { filterParams, rowsSql } = buildSearchSql(query({ q: '100%' }), NOW);
    expect(filterParams[0]).toBe('%100\\%%');
    expect(rowsSql).toMatch(/ESCAPE '\\'/);
  });
});

describe('parseBuyerId', () => {
  it('accepts a plain positive integer', () => {
    expect(parseBuyerId('1')).toBe(1);
    expect(parseBuyerId('60')).toBe(60);
  });

  it('rejects everything Number() would have quietly accepted', () => {
    for (const raw of ['', ' 7 ', '1e3', '0x2a', '1.5', '-1', '0', 'abc']) {
      expect(parseBuyerId(raw), `parseBuyerId(${JSON.stringify(raw)})`).toBeNull();
    }
  });
});

describe('updateStatus', () => {
  it('returns the updated buyer', async () => {
    const store = repo();
    expect((await store.updateStatus(1, 'closed', NOW))?.status).toBe('closed');
    expect((await store.byId(1, NOW))?.status).toBe('closed');
  });

  it('returns null for an id that does not exist', async () => {
    expect(await repo().updateStatus(9999, 'closed', NOW)).toBeNull();
    expect(await repo().byId(9999, NOW)).toBeNull();
  });
});
