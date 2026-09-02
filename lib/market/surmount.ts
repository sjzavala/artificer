/**
 * Live net-lease listings from the NNN Pro marketplace.
 *
 * The one source of market context Artificer has. Everything else it knows
 * comes from documents the broker uploaded and buyers they typed in; this is
 * the outside world.
 *
 * Two things to hold on to when reading anything this returns.
 *
 * **These are asking prices, not trades.** A listing at a 6.75% cap is what a
 * seller wants, not what anyone paid. Real closed comps come from a different
 * kind of source, and treating a marketplace listing as a comp is the single
 * easiest way to be confidently wrong about pricing. The type says `Listing`
 * rather than `Comp` for that reason, and the tool description says so to the
 * model.
 *
 * **The API is undocumented.** It is the endpoint nnnpro.com's own front end
 * calls, discovered by watching it, not a published contract. It answers
 * unauthenticated today and may not tomorrow. So every field is read
 * defensively, a failure degrades to "no market data" rather than an error, and
 * nothing else in Artificer depends on it.
 */

const DEFAULT_BASE_URL = 'https://api.surmount.com';
const TIMEOUT_MS = 8_000;
/** Long enough to spare the API a burst of identical calls inside one conversation. */
const CACHE_TTL_MS = 5 * 60_000;
const MAX_PAGE_SIZE = 50;

export interface Listing {
  /** The tenant brand — "Dollar General", "Walgreens". */
  concept: string | null;
  name: string | null;
  city: string | null;
  /** Two-letter USPS code, normalised from the several forms the API returns. */
  state: string | null;
  askingPrice: number | null;
  netOperatingIncome: number | null;
  /**
   * Derived as NOI ÷ price, because the API does not carry a cap rate — the
   * marketplace's own front end computes it the same way. Null when either
   * side is missing rather than guessed at.
   */
  capRate: number | null;
  propertyType: string | null;
  propertySubtype: string | null;
  buildingSf: number | null;
  yearBuilt: number | null;
  leaseType: string | null;
  leaseTermRemaining: string | null;
  rentalIncreases: string | null;
  /** "On Market", "Just Listed" — where the listing is in its own lifecycle. */
  status: string | null;
  listingUrl: string | null;
}

export interface ListingSearch {
  /** Free text over concept and location — the marketplace's own search box. */
  search?: string;
  /** Applied after fetching, since the API takes no numeric filters. */
  minCapRate?: number;
  maxCapRate?: number;
  state?: string;
  limit?: number;
}

export interface ListingResult {
  listings: Listing[];
  /** How many the marketplace matched before local filtering. */
  totalMatched: number;
  /** How many were examined — a numeric filter only sees this many. */
  examined: number;
  filteredLocally: boolean;
}

export class MarketDataError extends Error {}

interface CacheEntry {
  at: number;
  value: ListingResult;
}
const cache = new Map<string, CacheEntry>();

/** Test seam. */
export function resetMarketCache(): void {
  cache.clear();
}

function baseUrl(): string {
  return process.env.SURMOUNT_API_URL || DEFAULT_BASE_URL;
}

/**
 * Removes a place name from the search text when it is already the state filter.
 *
 * The marketplace matches `search` as one phrase, so "Walgreens Florida" returns
 * two listings where "Walgreens" narrowed to FL returns three — a third of the
 * matches lost, silently, in a way that reads as a complete answer. The tool
 * description tells the model not to do this; this makes it not matter if it
 * does anyway. A prompt should not be the only thing between a broker and a
 * missing comp.
 */
export function stripRedundantPlace(search: string, state: string | null): string {
  if (!search || !state) return search;

  const code = normalizeState(state);
  if (!code) return search;

  const names = [code, ...Object.entries(STATE_CODES).filter(([, c]) => c === code).map(([n]) => n)];

  let cleaned = search;
  for (const name of names) {
    cleaned = cleaned.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
  }

  const trimmed = cleaned.replace(/\s{2,}/g, ' ').trim();
  // Never strip the whole query away — "Texas" alone with state=TX is still a
  // search someone meant, even if it is a redundant one.
  return trimmed || search;
}

export async function searchListings(
  params: ListingSearch = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ListingResult> {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), MAX_PAGE_SIZE);
  const search = stripRedundantPlace(params.search?.trim() ?? '', params.state ?? null);
  const key = JSON.stringify({ ...params, search, limit });

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const url = new URL('/sf-opportunities', baseUrl());
  url.searchParams.set('page', '1');
  // Numeric filters are applied here rather than there, so the page fetched has
  // to be wide enough for them to bite.
  url.searchParams.set('pageSize', String(needsLocalFilter(params) ? MAX_PAGE_SIZE : limit));
  url.searchParams.set('sortBy', 'createdAt');
  url.searchParams.set('sortOrder', 'desc');
  if (search) url.searchParams.set('search', search);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let payload: unknown;
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new MarketDataError(`The marketplace returned ${response.status}.`);
    }
    payload = await response.json();
  } catch (error) {
    if (error instanceof MarketDataError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new MarketDataError(
      aborted ? 'The marketplace did not respond in time.' : 'Could not reach the marketplace.',
    );
  } finally {
    clearTimeout(timer);
  }

  const raw = payload as { data?: unknown; meta?: { totalItems?: unknown } };
  const rows = Array.isArray(raw.data) ? raw.data : [];
  const totalMatched = Number(raw.meta?.totalItems) || rows.length;

  const all = rows.map(toListing);
  const filtered = all.filter((l) => matches(l, params)).slice(0, limit);

  const value: ListingResult = {
    listings: filtered,
    totalMatched,
    examined: all.length,
    filteredLocally: needsLocalFilter(params),
  };

  cache.set(key, { at: Date.now(), value });
  return value;
}

function needsLocalFilter(p: ListingSearch): boolean {
  return p.minCapRate !== undefined || p.maxCapRate !== undefined || Boolean(p.state);
}

function matches(listing: Listing, p: ListingSearch): boolean {
  if (p.minCapRate !== undefined && (listing.capRate === null || listing.capRate < p.minCapRate)) {
    return false;
  }
  if (p.maxCapRate !== undefined && (listing.capRate === null || listing.capRate > p.maxCapRate)) {
    return false;
  }
  if (p.state && listing.state !== normalizeState(p.state)) return false;
  return true;
}

/** Defensive throughout: every field is optional in practice, whatever the shape suggests. */
function toListing(row: unknown): Listing {
  const o = (row ?? {}) as Record<string, unknown>;
  const property = (o.sf_property ?? {}) as Record<string, unknown>;

  const askingPrice = num(o.list_price) ?? num(property.list_price);
  const netOperatingIncome = num(o.list_net_operating_income);

  return {
    concept: str(property.concept),
    name: str(o.name),
    city: str(property.property_address_city),
    state: normalizeState(str(property.property_address_state)),
    askingPrice,
    netOperatingIncome,
    capRate:
      askingPrice && netOperatingIncome && askingPrice > 0
        ? round2((netOperatingIncome / askingPrice) * 100)
        : null,
    propertyType: str(property.property_type),
    propertySubtype: str(property.property_subtype),
    buildingSf: num(property.building_size_sf),
    yearBuilt: num(property.year_built),
    leaseType: str(o.lease_type),
    leaseTermRemaining: str(o.lease_term_remaining),
    rentalIncreases: str(o.rental_increases),
    status: str(o.sub_stage) ?? str(o.stage_name),
    listingUrl: str(o.salesforce_id) ? `https://nnnpro.com/properties/${str(o.salesforce_id)}` : null,
  };
}

/**
 * The marketplace stores state three ways in the same column — "US_FL", "Florida"
 * and occasionally "FL" — and its own front end prints whichever it finds. One
 * form out, or a comparison between two listings is a coin flip.
 */
export function normalizeState(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const prefixed = /^US[_-]([A-Za-z]{2})$/.exec(raw);
  if (prefixed) return prefixed[1].toUpperCase();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  return STATE_CODES[raw.toLowerCase()] ?? null;
}

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** The API sends money as decimal strings — "4830000.0000000000". */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
