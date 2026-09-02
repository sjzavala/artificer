import { GUARANTOR_TYPES, PROPERTY_TYPES, type GuarantorType, type PropertyType } from './schema';

/**
 * The buyer side of the net-lease vocabulary.
 *
 * This sits in `shared/` beside the deal schema on purpose. A buyer is defined
 * in the same terms a deal is — the property types they will buy, the weakest
 * guaranty they will accept, the cap rate band they will pay at — so the two
 * have to agree on what those words mean. `PROPERTY_TYPES` and
 * `GUARANTOR_TYPES` are imported from the deal schema rather than restated
 * here, which is what makes "does this deal fit this buyer" a question the
 * compiler can help answer instead of a string comparison nobody checks.
 */

/** Where the money is coming from. Drives whether exchange deadlines apply. */
export const CAPITAL_SOURCES = ['1031 exchange', 'all cash', 'financed', 'institutional'] as const;
export type CapitalSource = (typeof CAPITAL_SOURCES)[number];

/**
 * Where a buyer sits in the pipeline.
 *
 * Deliberately about the buyer, not about a deal: a buyer is `under contract`
 * on something, then `closed`, and `inactive` when they have stopped looking.
 * Whether they passed on one particular listing belongs to that listing.
 */
export const BUYER_STATUSES = ['active', 'under contract', 'closed', 'inactive'] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];

export function isBuyerStatus(value: unknown): value is BuyerStatus {
  return typeof value === 'string' && (BUYER_STATUSES as readonly string[]).includes(value);
}

export function isCapitalSource(value: unknown): value is CapitalSource {
  return typeof value === 'string' && (CAPITAL_SOURCES as readonly string[]).includes(value);
}

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value);
}

export function isGuarantorType(value: unknown): value is GuarantorType {
  return typeof value === 'string' && (GUARANTOR_TYPES as readonly string[]).includes(value);
}

/**
 * A buyer in the brokerage's pipeline.
 *
 * Cap rates are percentages as written on a flyer — `6.25` is 6.25%, matching
 * `economics.capRate` in the deal schema rather than inventing a decimal
 * convention the two would have to be translated between.
 */
export interface Buyer {
  id: number;
  /** The purchasing entity — an LLC, trust or fund, which is who actually signs. */
  entityName: string;
  /** The person the broker calls. */
  contactName: string;
  email: string;
  capitalSource: CapitalSource;
  /** Equity available to deploy, USD. */
  equity: number;
  /** The band they will transact in, inclusive at both ends. */
  targetCapRateMin: number;
  targetCapRateMax: number;
  /** What they will buy. Empty is not allowed — a buyer with no asset class is not a buyer. */
  propertyTypes: PropertyType[];
  /** The weakest guaranty they will accept, in the deal schema's own terms. */
  minGuarantor: GuarantorType;
  /** Two-letter USPS codes they buy in. */
  markets: string[];
  status: BuyerStatus;
  /**
   * The date the buyer's relinquished property sale closed, which is when the
   * exchange clock starts. Null for anyone not in an exchange.
   */
  exchangeStartedOn: string | null;
  /** When they entered the pipeline. */
  addedOn: string;
}

// ---------------------------------------------------------------------------
// Exchange deadlines
// ---------------------------------------------------------------------------

/**
 * A 1031 exchange runs on two statutory clocks, both counted in calendar days
 * from the day the relinquished property sale closes: 45 days to identify
 * replacement candidates in writing, 180 days to close on one.
 *
 * They are derived, never stored. A stored deadline is a deadline that can
 * disagree with the date it was derived from, and the whole value of showing it
 * is that a broker can trust it.
 */
export const IDENTIFICATION_DAYS = 45;
export const CLOSING_DAYS = 180;

/** Adds calendar days to a `YYYY-MM-DD` date, in UTC so a DST shift cannot move it. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function identificationDeadline(exchangeStartedOn: string | null): string | null {
  return exchangeStartedOn ? addDays(exchangeStartedOn, IDENTIFICATION_DAYS) : null;
}

export function closingDeadline(exchangeStartedOn: string | null): string | null {
  return exchangeStartedOn ? addDays(exchangeStartedOn, CLOSING_DAYS) : null;
}

/** Whole days from `from` to `to`. Negative once the date has passed. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Today in UTC, as `YYYY-MM-DD`. */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type DeadlineUrgency = 'none' | 'comfortable' | 'soon' | 'critical' | 'passed';

/**
 * How much trouble a buyer's identification clock is in.
 *
 * The thresholds are the ones a broker would use out loud: inside a week is the
 * call you make today, inside two is the one you plan. There is no extension
 * and no grace period in the statute, which is why "passed" is a distinct state
 * rather than just a large negative number.
 */
export function identificationUrgency(
  exchangeStartedOn: string | null,
  now: string = today(),
): { urgency: DeadlineUrgency; deadline: string | null; daysLeft: number | null } {
  const deadline = identificationDeadline(exchangeStartedOn);
  if (!deadline) return { urgency: 'none', deadline: null, daysLeft: null };

  const daysLeft = daysBetween(now, deadline);
  const urgency: DeadlineUrgency =
    daysLeft < 0 ? 'passed' : daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'soon' : 'comfortable';

  return { urgency, deadline, daysLeft };
}

/** Does this buyer's stated band cover the cap rate a deal is priced at? */
export function capRateFits(buyer: Pick<Buyer, 'targetCapRateMin' | 'targetCapRateMax'>, capRate: number): boolean {
  return capRate >= buyer.targetCapRateMin && capRate <= buyer.targetCapRateMax;
}
