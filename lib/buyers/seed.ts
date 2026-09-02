/**
 * The fixture: sixty buyers, generated deterministically.
 *
 * No randomness — the same sixty every time, so a boundary case is exact and a
 * test can assert a count rather than a range.
 *
 * The one thing that is *not* fixed is the exchange clock. A 1031 deadline is
 * only meaningful relative to today, and a fixture with dates hard-coded in the
 * past would show every buyer's window already blown — the single most
 * important thing on the screen, permanently wrong. So exchange start dates are
 * generated as offsets from a base date, defaulting to today. Tests pass their
 * own base and get the determinism back.
 */

import { addDays, type Buyer, type BuyerStatus, type CapitalSource } from '@/shared/buyer';
import type { GuarantorType, PropertyType } from '@/shared/schema';

const ENTITY_HEADS = [
  'Thornbury', 'Harborview', 'Cedar Creek', 'Blackstone Ridge', 'Ironwood',
  'Summit Point', 'Falcon Bridge', 'Redwood Hollow', 'Silverton', 'Mesa Verde',
  'Lakeshore', 'Granite Peak', 'Copper Canyon', 'Windward', 'Northfield',
  'Stonegate', 'Brightwater', 'Foxglove', 'Kestrel', 'Meridian',
];

const ENTITY_TAILS = ['Capital Partners, LLC', 'Holdings, LLC', 'Real Estate Trust', 'Investments, LP'];

const CONTACT_FIRST = [
  'Dana', 'Marcus', 'Priya', 'Ellis', 'Rosa', 'Nathan', 'Imani', 'Grant',
  'Lucia', 'Theo', 'Farah', 'Wes', 'Mira', 'Owen', 'Sana', 'Blake',
  'Yuki', 'Colin', 'Adaeze', 'Ruth',
];

const CONTACT_LAST = [
  'Whitfield', 'Okonkwo', 'Barrera', 'Lindqvist', 'Castellanos', 'Ahmadi',
  'Delacroix', 'Moriyama', 'Kavanagh', 'Sepulveda', "O'Rourke", 'Halvorsen',
  'Nakamura', 'Ferreira', 'Bhatt', 'Zieliński', 'Amaro', 'Vandermeer',
  'Rasmussen', 'Quintero',
];

const MARKET_SETS: string[][] = [
  ['TX', 'OK', 'AR'],
  ['CA', 'NV', 'AZ'],
  ['FL', 'GA', 'AL'],
  ['NY', 'NJ', 'CT'],
  ['OH', 'IN', 'MI'],
  ['NC', 'SC', 'TN'],
  ['WA', 'OR', 'ID'],
  ['CO', 'UT', 'NM'],
  ['IL', 'WI', 'MO'],
  ['PA', 'MD', 'VA'],
];

const PROPERTY_TYPE_SETS: PropertyType[][] = [
  ['retail'],
  ['retail', 'industrial'],
  ['industrial'],
  ['retail', 'office'],
  ['retail', 'industrial', 'office'],
];

const CAPITAL_SOURCES_CYCLE: CapitalSource[] = ['1031 exchange', 'all cash', 'financed', 'institutional'];
const STATUS_CYCLE: BuyerStatus[] = ['active', 'under contract', 'closed', 'inactive'];
const GUARANTOR_CYCLE: GuarantorType[] = ['corporate', 'franchisee', 'personal', 'none'];

export const BUYER_COUNT = 60;

export interface SeedOptions {
  /** The date the exchange clocks are measured from. Defaults to today, UTC. */
  baseDate?: string;
}

function build(baseDate: string): Buyer[] {
  const rows: Buyer[] = [];

  for (let i = 0; i < BUYER_COUNT; i += 1) {
    // Offsetting the head by the cycle count keeps the pairings varied instead
    // of locking every "Thornbury" to the same contact.
    const head = ENTITY_HEADS[(i + Math.floor(i / ENTITY_HEADS.length)) % ENTITY_HEADS.length];
    const tail = ENTITY_TAILS[i % ENTITY_TAILS.length];
    // Both lists are twenty long, so any plain function of `i` repeats every
    // twenty rows and buyers 1, 21 and 41 end up sharing a contact — the same
    // person apparently representing three unrelated firms. Folding in the
    // cycle count, as the entity heads do, keeps all sixty distinct.
    const cycle = Math.floor(i / CONTACT_LAST.length);
    const first = CONTACT_FIRST[(i * 3 + cycle * 7) % CONTACT_FIRST.length];
    const last = CONTACT_LAST[i % CONTACT_LAST.length];

    const capitalSource = CAPITAL_SOURCES_CYCLE[i % CAPITAL_SOURCES_CYCLE.length];

    // Only an exchange buyer has a clock. The offsets fan out from 2 days ago to
    // roughly five months back, so the fixture always contains buyers who are
    // comfortable, close to the wire, and past the 45-day mark.
    const exchangeStartedOn =
      capitalSource === '1031 exchange' ? addDays(baseDate, -((i * 11) % 150)) : null;

    const capMin = 5.25 + ((i * 7) % 12) * 0.25;

    rows.push({
      id: i + 1,
      entityName: `${head} ${tail}`,
      contactName: `${first} ${last}`,
      email: `${first.toLowerCase()}@${head.toLowerCase().replace(/[^a-z]/g, '')}${i + 1}.com`,
      capitalSource,
      equity: 600_000 + ((i * 13) % 40) * 250_000,
      targetCapRateMin: round2(capMin),
      targetCapRateMax: round2(capMin + 1 + ((i * 5) % 4) * 0.25),
      propertyTypes: PROPERTY_TYPE_SETS[i % PROPERTY_TYPE_SETS.length],
      minGuarantor: GUARANTOR_CYCLE[i % GUARANTOR_CYCLE.length],
      markets: MARKET_SETS[i % MARKET_SETS.length],
      status: STATUS_CYCLE[i % STATUS_CYCLE.length],
      exchangeStartedOn,
      addedOn: addDays(baseDate, -((i * 17) % 400)),
    });
  }

  // Fixed anchors, so the boundaries worth testing are exact rather than
  // whatever the generator happened to produce.
  // Exactly on a common "$2M+" threshold, twice, so an exclusive bound drops
  // two rather than one and the mistake is unmissable. The generated figures
  // start at $600k and step by $250k, which never lands on $2,000,000.
  rows[5].equity = 2_000_000;
  rows[12].equity = 2_000_000;
  // Three Ridgelines, as a name-search target. "Ridgeline" is deliberately not
  // one of the generated heads, so these three are the only three — an anchor
  // the generator can also produce is not an anchor.
  rows[3].entityName = 'Ridgeline Capital Partners, LLC';
  rows[23].entityName = 'Ridgeline Holdings, LLC';
  rows[43].entityName = 'Ridgeline Investments, LP';

  // One buyer exactly 45 days out — the identification deadline is today.
  rows[8].capitalSource = '1031 exchange';
  rows[8].exchangeStartedOn = addDays(baseDate, -45);
  // And one exactly a week out, the inside-a-week call.
  rows[16].capitalSource = '1031 exchange';
  rows[16].exchangeStartedOn = addDays(baseDate, -38);

  return rows;
}

/**
 * A fresh copy each call. The in-memory repository mutates status, and handing
 * out a shared array would let one test's write change the next test's fixture.
 */
export function seedBuyers({ baseDate = new Date().toISOString().slice(0, 10) }: SeedOptions = {}): Buyer[] {
  return build(baseDate).map((row) => ({
    ...row,
    propertyTypes: [...row.propertyTypes],
    markets: [...row.markets],
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
