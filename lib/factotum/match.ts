import { getField } from '@/shared/schema';
import type { GuarantorType, NetLeaseExtraction, PropertyType } from '@/shared/schema';
import { capRateFits, type Buyer } from '@/shared/buyer';
import type { Deal } from '@/shared/deal';

/**
 * Matching a deal to the buyers who could take it.
 *
 * This is the brokerage's actual job, and it is deliberately plain code rather
 * than something the model reasons its way through. A model asked to eyeball
 * sixty buyers against a cap rate band will be roughly right and occasionally,
 * silently wrong; five comparisons in TypeScript are right every time and can
 * be tested. The model's job is to decide *when* to ask this question and how
 * to explain the answer — not to compute it.
 *
 * The two sides already speak the same language: `propertyTypes` and
 * `minGuarantor` on a buyer are the deal schema's own `PROPERTY_TYPES` and
 * `GUARANTOR_TYPES`, imported rather than restated, which is what makes this a
 * comparison rather than a translation.
 */

/**
 * Guaranty strength, strongest first.
 *
 * A buyer's `minGuarantor` is the weakest guaranty they will accept, so a buyer
 * who requires `corporate` takes only corporate-guaranteed deals, and one who
 * accepts `none` takes anything. Ranking makes that a comparison instead of a
 * table of special cases.
 */
const GUARANTOR_RANK: Record<GuarantorType, number> = {
  corporate: 3,
  franchisee: 2,
  personal: 1,
  none: 0,
};

/**
 * What a financed buyer needs liquid, as a share of price.
 *
 * A stated assumption, not a fact about any particular lender — which is why it
 * is a named constant and why the reason string says "assumes". An all-cash
 * buyer needs the whole number; a financed one needs a down payment, and
 * holding them to the full price would hide most of the market from every deal.
 */
export const DOWN_PAYMENT_SHARE = 0.35;

export type CriterionKey = 'capRate' | 'market' | 'assetClass' | 'guaranty' | 'capital';

export interface Criterion {
  key: CriterionKey;
  passed: boolean;
  /** One line a broker could read aloud. */
  detail: string;
}

export interface BuyerMatch {
  buyer: Buyer;
  criteria: Criterion[];
  /** Every criterion passed. */
  fits: boolean;
  /** All but one passed — worth a call, and worth saying which one. */
  nearMiss: boolean;
  /** The criteria that failed, so a near miss can explain itself. */
  failed: CriterionKey[];
}

/** The five deal facts a match turns on. Null where the document did not state one. */
export interface DealProfile {
  dealId: string;
  tenant: string | null;
  capRate: number | null;
  state: string | null;
  propertyType: PropertyType | null;
  guarantorType: GuarantorType | null;
  askingPrice: number | null;
  /** The facts that are missing, so the answer can say what it could not check. */
  unknown: CriterionKey[];
}

export function dealProfile(deal: Deal): DealProfile {
  const value = <T,>(path: string) => (getField(deal.extraction, path)?.value ?? null) as T | null;

  const profile: Omit<DealProfile, 'unknown'> = {
    dealId: deal.id,
    tenant: value<string>('tenant.tradeName'),
    capRate: value<number>('economics.capRate'),
    state: value<string>('property.state'),
    propertyType: value<PropertyType>('property.propertyType'),
    guarantorType: value<GuarantorType>('tenant.guarantorType'),
    askingPrice: value<number>('economics.askingPrice'),
  };

  const unknown: CriterionKey[] = [];
  if (profile.capRate === null) unknown.push('capRate');
  if (!profile.state) unknown.push('market');
  if (!profile.propertyType) unknown.push('assetClass');
  if (!profile.guarantorType) unknown.push('guaranty');
  if (profile.askingPrice === null) unknown.push('capital');

  return { ...profile, unknown };
}

/**
 * Scores one buyer against one deal.
 *
 * A criterion the deal cannot answer — an extraction that came back "not
 * found" — passes rather than fails. Excluding a buyer because the memo never
 * stated the guarantor would silently narrow the field on the strength of a
 * gap in the document, which is the opposite of what a missing value means.
 * The gap is reported separately so the answer can admit what it did not check.
 */
export function scoreBuyer(profile: DealProfile, buyer: Buyer): BuyerMatch {
  const criteria: Criterion[] = [
    capRateCriterion(profile, buyer),
    marketCriterion(profile, buyer),
    assetClassCriterion(profile, buyer),
    guarantyCriterion(profile, buyer),
    capitalCriterion(profile, buyer),
  ];

  const failed = criteria.filter((c) => !c.passed).map((c) => c.key);

  return {
    buyer,
    criteria,
    fits: failed.length === 0,
    nearMiss: failed.length === 1,
    failed,
  };
}

function capRateCriterion(profile: DealProfile, buyer: Buyer): Criterion {
  const band = `${buyer.targetCapRateMin.toFixed(2)}–${buyer.targetCapRateMax.toFixed(2)}%`;
  if (profile.capRate === null) {
    return { key: 'capRate', passed: true, detail: `Cap rate not stated; buyer targets ${band}` };
  }
  const passed = capRateFits(buyer, profile.capRate);
  return {
    key: 'capRate',
    passed,
    detail: passed
      ? `${profile.capRate.toFixed(2)}% is inside their ${band} band`
      : `${profile.capRate.toFixed(2)}% is outside their ${band} band`,
  };
}

function marketCriterion(profile: DealProfile, buyer: Buyer): Criterion {
  if (!profile.state) {
    return { key: 'market', passed: true, detail: `State not stated; buyer buys in ${buyer.markets.join(', ')}` };
  }
  const passed = buyer.markets.includes(profile.state);
  return {
    key: 'market',
    passed,
    detail: passed
      ? `Buys in ${profile.state}`
      : `Does not buy in ${profile.state} — only ${buyer.markets.join(', ')}`,
  };
}

function assetClassCriterion(profile: DealProfile, buyer: Buyer): Criterion {
  if (!profile.propertyType) {
    return {
      key: 'assetClass',
      passed: true,
      detail: `Property type not stated; buyer takes ${buyer.propertyTypes.join(', ')}`,
    };
  }
  const passed = buyer.propertyTypes.includes(profile.propertyType);
  return {
    key: 'assetClass',
    passed,
    detail: passed
      ? `Takes ${profile.propertyType}`
      : `Does not take ${profile.propertyType} — only ${buyer.propertyTypes.join(', ')}`,
  };
}

function guarantyCriterion(profile: DealProfile, buyer: Buyer): Criterion {
  if (!profile.guarantorType) {
    return {
      key: 'guaranty',
      passed: true,
      detail: `Guarantor not stated; buyer accepts ${buyer.minGuarantor} or stronger`,
    };
  }
  const passed = GUARANTOR_RANK[profile.guarantorType] >= GUARANTOR_RANK[buyer.minGuarantor];
  return {
    key: 'guaranty',
    passed,
    detail: passed
      ? `${profile.guarantorType} guaranty meets their ${buyer.minGuarantor} floor`
      : `${profile.guarantorType} guaranty is below their ${buyer.minGuarantor} floor`,
  };
}

function capitalCriterion(profile: DealProfile, buyer: Buyer): Criterion {
  const cash = buyer.capitalSource === 'all cash';
  if (profile.askingPrice === null) {
    return {
      key: 'capital',
      passed: true,
      detail: `Price not stated; buyer has ${usd(buyer.equity)} to deploy`,
    };
  }

  const required = cash ? profile.askingPrice : Math.round(profile.askingPrice * DOWN_PAYMENT_SHARE);
  const passed = buyer.equity >= required;
  const basis = cash
    ? 'all cash, so the full price'
    : `financed, assumes ${Math.round(DOWN_PAYMENT_SHARE * 100)}% down`;

  return {
    key: 'capital',
    passed,
    detail: passed
      ? `${usd(buyer.equity)} covers the ${usd(required)} needed (${basis})`
      : `${usd(buyer.equity)} is short of the ${usd(required)} needed (${basis})`,
  };
}

export interface MatchResult {
  profile: DealProfile;
  fits: BuyerMatch[];
  nearMisses: BuyerMatch[];
  /** Buyers excluded before scoring because they are not currently looking. */
  inactiveSkipped: number;
  consideredCount: number;
}

/**
 * Matches a deal against a book of buyers.
 *
 * Near misses are returned alongside the fits on purpose. A buyer who clears
 * everything but the cap rate by a quarter point is a phone call, not a
 * rejection, and a tool that silently drops them makes the broker's judgement
 * for them.
 */
export function matchBuyers(
  profile: DealProfile,
  buyers: Buyer[],
  { includeUnderContract = false }: { includeUnderContract?: boolean } = {},
): MatchResult {
  const callable = buyers.filter(
    (b) => b.status === 'active' || (includeUnderContract && b.status === 'under contract'),
  );

  const scored = callable.map((buyer) => scoreBuyer(profile, buyer));

  return {
    profile,
    fits: scored.filter((m) => m.fits).sort(byEquityDesc),
    nearMisses: scored.filter((m) => m.nearMiss).sort(byEquityDesc),
    inactiveSkipped: buyers.length - callable.length,
    consideredCount: callable.length,
  };
}

/** Most capital first — among buyers who all fit, the biggest cheque leads. */
function byEquityDesc(a: BuyerMatch, b: BuyerMatch): number {
  return b.buyer.equity - a.buyer.equity || a.buyer.id - b.buyer.id;
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}
