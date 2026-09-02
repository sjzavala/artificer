import { identificationUrgency, closingDeadline, today, type Buyer } from '@/shared/buyer';
import type { BuyerRow } from './types';

/**
 * Attaches the exchange clock to a stored buyer.
 *
 * Both repositories run their rows through this, which is the point: the 45-
 * and 180-day rules are applied in exactly one place, so Postgres and the
 * in-memory fixture cannot come to different conclusions about the same date.
 */
export function decorate(buyer: Buyer, now: string = today()): BuyerRow {
  const { urgency, deadline, daysLeft } = identificationUrgency(buyer.exchangeStartedOn, now);

  return {
    ...buyer,
    identifyBy: deadline,
    closeBy: closingDeadline(buyer.exchangeStartedOn),
    daysToIdentify: daysLeft,
    urgency,
  };
}
