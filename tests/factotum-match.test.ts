import { describe, expect, it } from 'vitest';
import { DOWN_PAYMENT_SHARE, matchBuyers, scoreBuyer, type DealProfile } from '@/lib/factotum/match';
import type { Buyer } from '@/shared/buyer';

/**
 * The deal-to-buyer join, tested as plain logic.
 *
 * This is deliberately not the model's job: five comparisons in TypeScript are
 * right every time and can be pinned down here, where a model eyeballing sixty
 * buyers against a cap rate band would be roughly right and occasionally,
 * silently wrong.
 */

const DEAL: DealProfile = {
  dealId: 'd_test',
  tenant: 'Dollar General',
  capRate: 6.75,
  state: 'OH',
  propertyType: 'retail',
  guarantorType: 'corporate',
  askingPrice: 1_842_000,
  unknown: [],
};

function buyer(overrides: Partial<Buyer> = {}): Buyer {
  return {
    id: 1,
    entityName: 'Test Capital, LLC',
    contactName: 'A Broker',
    email: 'a@example.com',
    capitalSource: 'all cash',
    equity: 5_000_000,
    targetCapRateMin: 6.0,
    targetCapRateMax: 7.5,
    propertyTypes: ['retail'],
    minGuarantor: 'corporate',
    markets: ['OH', 'IN'],
    status: 'active',
    exchangeStartedOn: null,
    addedOn: '2026-01-01',
    ...overrides,
  };
}

const keys = (m: ReturnType<typeof scoreBuyer>) => m.failed;

describe('a buyer who fits on every count', () => {
  it('passes all five criteria', () => {
    const match = scoreBuyer(DEAL, buyer());
    expect(match.fits).toBe(true);
    expect(match.failed).toEqual([]);
    expect(match.criteria).toHaveLength(5);
  });
});

describe('cap rate band', () => {
  it('is inclusive at both ends', () => {
    expect(scoreBuyer(DEAL, buyer({ targetCapRateMin: 6.75, targetCapRateMax: 8 })).fits).toBe(true);
    expect(scoreBuyer(DEAL, buyer({ targetCapRateMin: 5, targetCapRateMax: 6.75 })).fits).toBe(true);
  });

  it('fails just outside the band', () => {
    expect(keys(scoreBuyer(DEAL, buyer({ targetCapRateMin: 6.8, targetCapRateMax: 8 })))).toEqual(['capRate']);
    expect(keys(scoreBuyer(DEAL, buyer({ targetCapRateMin: 5, targetCapRateMax: 6.7 })))).toEqual(['capRate']);
  });
});

describe('guaranty floor', () => {
  /**
   * `minGuarantor` is the weakest guaranty a buyer accepts, so requiring
   * `corporate` is the *strictest* position, not the most permissive. Getting
   * this backwards would quietly offer franchisee deals to institutions.
   */
  it('lets a buyer take anything at or above their floor', () => {
    const franchiseeDeal = { ...DEAL, guarantorType: 'franchisee' as const };
    expect(scoreBuyer(franchiseeDeal, buyer({ minGuarantor: 'franchisee' })).fits).toBe(true);
    expect(scoreBuyer(franchiseeDeal, buyer({ minGuarantor: 'personal' })).fits).toBe(true);
    expect(scoreBuyer(franchiseeDeal, buyer({ minGuarantor: 'none' })).fits).toBe(true);
  });

  it('excludes a buyer whose floor the deal does not clear', () => {
    const franchiseeDeal = { ...DEAL, guarantorType: 'franchisee' as const };
    expect(keys(scoreBuyer(franchiseeDeal, buyer({ minGuarantor: 'corporate' })))).toEqual(['guaranty']);
  });

  it('lets a corporate deal satisfy every floor', () => {
    for (const floor of ['corporate', 'franchisee', 'personal', 'none'] as const) {
      expect(scoreBuyer(DEAL, buyer({ minGuarantor: floor })).fits, floor).toBe(true);
    }
  });
});

describe('capital', () => {
  it('holds an all-cash buyer to the whole price', () => {
    expect(scoreBuyer(DEAL, buyer({ capitalSource: 'all cash', equity: 1_842_000 })).fits).toBe(true);
    expect(
      keys(scoreBuyer(DEAL, buyer({ capitalSource: 'all cash', equity: 1_841_999 }))),
    ).toEqual(['capital']);
  });

  it('holds a financed buyer to a down payment, not the price', () => {
    const down = Math.round(DEAL.askingPrice! * DOWN_PAYMENT_SHARE);
    expect(scoreBuyer(DEAL, buyer({ capitalSource: 'financed', equity: down })).fits).toBe(true);
    expect(keys(scoreBuyer(DEAL, buyer({ capitalSource: 'financed', equity: down - 1 })))).toEqual(['capital']);

    // The distinction matters: this buyer fails as cash and passes as financed.
    expect(keys(scoreBuyer(DEAL, buyer({ capitalSource: 'all cash', equity: down })))).toEqual(['capital']);
  });

  it('says the assumption out loud rather than burying it', () => {
    const match = scoreBuyer(DEAL, buyer({ capitalSource: 'financed', equity: 5_000_000 }));
    expect(match.criteria.find((c) => c.key === 'capital')!.detail).toMatch(/assumes 35% down/);
  });
});

describe('a fact the document never stated', () => {
  /**
   * A missing extraction is a gap in the document, not evidence against a
   * buyer. Failing them on it would narrow the field on the strength of
   * something nobody knows.
   */
  it('passes the criterion rather than excluding the buyer', () => {
    const noGuarantor: DealProfile = { ...DEAL, guarantorType: null, unknown: ['guaranty'] };
    const strict = buyer({ minGuarantor: 'corporate' });
    expect(scoreBuyer(noGuarantor, strict).fits).toBe(true);
    expect(scoreBuyer(noGuarantor, strict).criteria.find((c) => c.key === 'guaranty')!.detail).toMatch(
      /not stated/,
    );
  });

  it('still narrows on the facts that are known', () => {
    const noPrice: DealProfile = { ...DEAL, askingPrice: null, unknown: ['capital'] };
    expect(keys(scoreBuyer(noPrice, buyer({ markets: ['TX'] })))).toEqual(['market']);
  });
});

describe('near misses', () => {
  it('are the buyers who failed exactly one criterion', () => {
    const match = scoreBuyer(DEAL, buyer({ targetCapRateMin: 7.0, targetCapRateMax: 8.0 }));
    expect(match.fits).toBe(false);
    expect(match.nearMiss).toBe(true);
    expect(match.failed).toEqual(['capRate']);
  });

  it('are not claimed for a buyer who failed two', () => {
    const match = scoreBuyer(DEAL, buyer({ markets: ['TX'], propertyTypes: ['industrial'] }));
    expect(match.nearMiss).toBe(false);
    expect(match.failed.sort()).toEqual(['assetClass', 'market']);
  });
});

describe('matchBuyers', () => {
  const book: Buyer[] = [
    buyer({ id: 1, entityName: 'Fits Small', equity: 2_000_000 }),
    buyer({ id: 2, entityName: 'Fits Large', equity: 9_000_000 }),
    buyer({ id: 3, entityName: 'Near', targetCapRateMin: 7.5, targetCapRateMax: 8.5 }),
    buyer({ id: 4, entityName: 'Miss Twice', markets: ['TX'], propertyTypes: ['office'] }),
    buyer({ id: 5, entityName: 'Closed', status: 'closed' }),
    buyer({ id: 6, entityName: 'Inactive', status: 'inactive' }),
  ];

  it('separates fits from near misses and drops the rest', () => {
    const result = matchBuyers(DEAL, book);
    expect(result.fits.map((m) => m.buyer.id)).toEqual([2, 1]); // biggest cheque leads
    expect(result.nearMisses.map((m) => m.buyer.id)).toEqual([3]);
    expect(result.fits.concat(result.nearMisses).map((m) => m.buyer.id)).not.toContain(4);
  });

  it('never returns a buyer who is not currently looking', () => {
    const result = matchBuyers(DEAL, book);
    const returned = [...result.fits, ...result.nearMisses].map((m) => m.buyer.id);
    expect(returned).not.toContain(5);
    expect(returned).not.toContain(6);
    expect(result.inactiveSkipped).toBe(2);
    expect(result.consideredCount).toBe(4);
  });

  it('can include buyers already under contract when asked', () => {
    const withPending = [...book, buyer({ id: 7, entityName: 'Pending', status: 'under contract' })];
    expect(matchBuyers(DEAL, withPending).fits.map((m) => m.buyer.id)).not.toContain(7);
    expect(
      matchBuyers(DEAL, withPending, { includeUnderContract: true }).fits.map((m) => m.buyer.id),
    ).toContain(7);
  });

  it('explains every criterion, passed or failed', () => {
    const [first] = matchBuyers(DEAL, book).fits;
    expect(first.criteria.map((c) => c.key).sort()).toEqual([
      'assetClass',
      'capRate',
      'capital',
      'guaranty',
      'market',
    ]);
    for (const c of first.criteria) expect(c.detail.length).toBeGreaterThan(0);
  });
});
