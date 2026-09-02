import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeState,
  resetMarketCache,
  searchListings,
  stripRedundantPlace,
  MarketDataError,
} from '@/lib/market/surmount';

/**
 * The marketplace is the one dependency outside Artificer, and it is an
 * undocumented endpoint discovered by watching a website. So these tests are
 * mostly about surviving it: a field that changes shape, a value that arrives
 * in three formats, an outage. None of it should take an answer down.
 */

function listing(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Dollar General - 100 Main St',
    list_price: '1842000.0000000000',
    list_net_operating_income: '124335.0000000000',
    lease_type: 'Absolute NNN',
    lease_term_remaining: '8.1 years',
    rental_increases: '10% Every 5 Years',
    sub_stage: 'On Market',
    salesforce_id: '006ABC',
    sf_property: {
      concept: 'Dollar General',
      property_address_city: 'Mount Vernon',
      property_address_state: 'US_OH',
      property_type: 'Retail',
      property_subtype: 'Dollar Store',
      building_size_sf: '9100.0000000000',
      year_built: 2019,
    },
    ...overrides,
  };
}

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return (async () =>
    ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

beforeEach(() => resetMarketCache());

describe('normalizeState', () => {
  it('handles the three forms the same column contains', () => {
    // Their own front end prints whichever it finds; one form out, or comparing
    // two listings is a coin flip.
    expect(normalizeState('US_FL')).toBe('FL');
    expect(normalizeState('Florida')).toBe('FL');
    expect(normalizeState('fl')).toBe('FL');
    expect(normalizeState('New York')).toBe('NY');
    expect(normalizeState('US-OH')).toBe('OH');
  });

  it('returns null rather than guessing', () => {
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState('')).toBeNull();
    expect(normalizeState('Ontario')).toBeNull();
  });
});

describe('stripRedundantPlace', () => {
  /**
   * The marketplace matches `search` as one phrase, so a state name inside it
   * narrows the result set on top of the state filter — "Walgreens Florida"
   * returns two listings where "Walgreens" filtered to FL returns three. A
   * third of the matches, lost silently, in an answer that reads as complete.
   */
  it('drops a state name that is already the filter', () => {
    expect(stripRedundantPlace('Walgreens Florida', 'FL')).toBe('Walgreens');
    expect(stripRedundantPlace('Dollar General Texas', 'TX')).toBe('Dollar General');
    expect(stripRedundantPlace('Dollar General TX', 'TX')).toBe('Dollar General');
    expect(stripRedundantPlace('walgreens florida', 'Florida')).toBe('walgreens');
  });

  it('leaves a search alone when there is no state filter', () => {
    expect(stripRedundantPlace('Walgreens Florida', null)).toBe('Walgreens Florida');
  });

  it('leaves an unrelated place alone', () => {
    // Ohio is not the filter, so it is the user's own narrowing and stays.
    expect(stripRedundantPlace('Walgreens Ohio', 'FL')).toBe('Walgreens Ohio');
  });

  it('does not strip a brand that merely contains the letters', () => {
    expect(stripRedundantPlace('Texas Roadhouse', 'TX')).toBe('Roadhouse');
    expect(stripRedundantPlace('Ohio Valley Bank', 'OH')).toBe('Valley Bank');
  });

  it('never strips the query away entirely', () => {
    // "Texas" with state=TX is redundant, but it is still what was asked.
    expect(stripRedundantPlace('Texas', 'TX')).toBe('Texas');
  });
});

describe('searchListings', () => {
  it('derives the cap rate the marketplace does not send', async () => {
    const { listings } = await searchListings({}, stubFetch({ data: [listing()], meta: { totalItems: 1 } }));
    // 124335 / 1842000 = 6.75%
    expect(listings[0].capRate).toBe(6.75);
    expect(listings[0].askingPrice).toBe(1_842_000);
  });

  it('parses the decimal strings money arrives as', async () => {
    const { listings } = await searchListings({}, stubFetch({ data: [listing()], meta: { totalItems: 1 } }));
    expect(listings[0].netOperatingIncome).toBe(124_335);
    expect(listings[0].buildingSf).toBe(9_100);
  });

  it('leaves the cap rate null rather than inventing one', async () => {
    const noPrice = listing({ list_price: null });
    const noNoi = listing({ list_net_operating_income: null });
    const zero = listing({ list_price: '0' });

    for (const row of [noPrice, noNoi, zero]) {
      const { listings } = await searchListings({}, stubFetch({ data: [row], meta: { totalItems: 1 } }));
      expect(listings[0].capRate).toBeNull();
    }
  });

  it('filters on cap rate locally, since the API takes no numeric filters', async () => {
    const rows = [
      listing({ list_net_operating_income: '110520' }), // 6.00%
      listing({ list_net_operating_income: '124335' }), // 6.75%
      listing({ list_net_operating_income: '138150' }), // 7.50%
    ];
    const fetchImpl = stubFetch({ data: rows, meta: { totalItems: 3 } });

    const { listings, filteredLocally } = await searchListings({ minCapRate: 6.5 }, fetchImpl);
    expect(listings.map((l) => l.capRate)).toEqual([6.75, 7.5]);
    expect(filteredLocally).toBe(true);

    resetMarketCache();
    const banded = await searchListings({ minCapRate: 6.5, maxCapRate: 7 }, fetchImpl);
    expect(banded.listings.map((l) => l.capRate)).toEqual([6.75]);
  });

  it('drops a listing with no cap rate when a cap rate filter is asked for', async () => {
    const rows = [listing(), listing({ list_price: null })];
    const { listings } = await searchListings(
      { minCapRate: 1 },
      stubFetch({ data: rows, meta: { totalItems: 2 } }),
    );
    expect(listings).toHaveLength(1);
  });

  it('matches a state filter across the formats', async () => {
    const rows = [listing(), listing({ sf_property: { ...listing().sf_property, property_address_state: 'Texas' } })];
    const fetchImpl = stubFetch({ data: rows, meta: { totalItems: 2 } });

    expect((await searchListings({ state: 'OH' }, fetchImpl)).listings).toHaveLength(1);
    resetMarketCache();
    // The filter is given a name and the data holds a code, or the reverse.
    expect((await searchListings({ state: 'Texas' }, fetchImpl)).listings).toHaveLength(1);
  });

  it('survives a payload that has changed shape', async () => {
    for (const body of [{}, { data: null }, { data: [{}] }, { data: [{ sf_property: null }] }]) {
      const { listings } = await searchListings({}, stubFetch(body));
      // Either nothing, or a listing full of nulls — never a throw.
      expect(Array.isArray(listings)).toBe(true);
      if (listings.length) expect(listings[0].capRate).toBeNull();
    }
  });

  it('reports an outage as an error the caller can degrade on', async () => {
    await expect(searchListings({}, stubFetch({}, { ok: false, status: 503 }))).rejects.toThrow(
      MarketDataError,
    );

    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(searchListings({}, boom)).rejects.toThrow(/Could not reach the marketplace/);
  });

  it('caches, so one conversation does not hammer the marketplace', async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ data: [listing()], meta: { totalItems: 1 } }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await searchListings({ search: 'Dollar General' }, counting);
    await searchListings({ search: 'Dollar General' }, counting);
    expect(calls).toBe(1);

    await searchListings({ search: 'Walgreens' }, counting);
    expect(calls).toBe(2);
  });

  it('builds the query the marketplace actually understands', async () => {
    let seen = '';
    const capture = (async (url: string) => {
      seen = String(url);
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { totalItems: 0 } }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await searchListings({ search: 'Dollar General', limit: 5 }, capture);

    // `search` is the parameter its own front end sends; `concept` is silently
    // ignored, which looks like a filter that returns everything.
    expect(seen).toContain('/sf-opportunities');
    expect(seen).toContain('search=Dollar+General');
    expect(seen).toContain('pageSize=5');
  });

  it('widens the page when it has to filter locally', async () => {
    let seen = '';
    const capture = (async (url: string) => {
      seen = String(url);
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { totalItems: 0 } }) } as unknown as Response;
    }) as unknown as typeof fetch;

    // Asking for 5 while filtering on cap rate has to examine more than 5, or
    // the filter only ever sees the first page.
    await searchListings({ minCapRate: 6, limit: 5 }, capture);
    expect(seen).toContain('pageSize=50');
  });
});
