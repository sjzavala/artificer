import type { Buyer, BuyerStatus, CapitalSource, DeadlineUrgency } from '@/shared/buyer';
import type { GuarantorType, PropertyType } from '@/shared/schema';

/**
 * The search vocabulary for the buyer pipeline.
 *
 * The buyer itself is defined in `shared/buyer.ts` — this file is only about
 * asking questions of a list of them, which is why nothing here redefines what
 * a buyer is.
 */

/** A buyer as the API returns it: the record plus its derived exchange clock. */
export interface BuyerRow extends Buyer {
  /** `exchangeStartedOn + 45 days`, or null when there is no exchange. */
  identifyBy: string | null;
  /** `exchangeStartedOn + 180 days`, or null. */
  closeBy: string | null;
  /** Days until `identifyBy`; negative once it has passed. */
  daysToIdentify: number | null;
  urgency: DeadlineUrgency;
}

export const SORT_KEYS = ['id', 'entityName', 'equity', 'identifyBy', 'addedOn'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

/**
 * Longest natural-language question the AI search accepts. It lives here rather
 * than beside the translator because the input component needs it too, and
 * importing it from there would pull the Anthropic SDK into the browser bundle.
 */
export const AI_QUERY_MAX_LENGTH = 300;

/**
 * A normalised search. Every field is already validated and clamped by the time
 * a repository sees one, so the two implementations cannot drift on input
 * handling — only on how they execute the same question.
 */
export interface BuyerQuery {
  /** Entity or contact name fragment, already trimmed. */
  q: string;
  status: BuyerStatus | null;
  capitalSource: CapitalSource | null;
  /** A single two-letter code, matched against the buyer's market list. */
  market: string | null;
  propertyType: PropertyType | null;
  minGuarantor: GuarantorType | null;
  /** Inclusive lower bound on equity available, USD. */
  minEquity: number | null;
  /**
   * Only buyers whose identification deadline falls between today and this many
   * days out. Excludes anyone whose window has already closed — a passed
   * deadline is not urgent, it is over.
   */
  identifyWithinDays: number | null;
  sortBy: SortKey;
  page: number;
  limit: number;
}

export interface BuyerSearchResult {
  results: BuyerRow[];
  /** Buyers matching the filters — not the size of the pipeline. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * The two backends behind the API routes: Postgres in deployment, an in-memory
 * fixture when no database is configured. Both answer the same questions with
 * the same semantics; see `lib/buyers/db.ts` for why the second one exists.
 */
export interface BuyerRepo {
  search(query: BuyerQuery, now?: string): Promise<BuyerSearchResult>;
  byId(id: number, now?: string): Promise<BuyerRow | null>;
  /** Returns the updated buyer, or null when no such id exists. */
  updateStatus(id: number, status: BuyerStatus, now?: string): Promise<BuyerRow | null>;
}
