/**
 * Borrower search — the shared vocabulary.
 *
 * Ported from the borrower-search sandbox, whose API this mirrors field for
 * field so its existing test cases still describe this one. The deliberate
 * differences are the ten planted defects, which are fixed here; each fix is
 * marked at the point it matters.
 */

/** The four states a loan application can be in. */
export const BORROWER_STATUSES = ['Approved', 'Pending', 'Denied', 'Withdrawn'] as const;

export type BorrowerStatus = (typeof BORROWER_STATUSES)[number];

export function isBorrowerStatus(value: unknown): value is BorrowerStatus {
  return typeof value === 'string' && (BORROWER_STATUSES as readonly string[]).includes(value);
}

/**
 * A borrower as the API returns it.
 *
 * BUG-8 is fixed by the shape itself rather than by a rule someone has to
 * remember: there is no `ssn` field to leak. The sandbox returned the complete
 * value and masked it in the browser, so the exposure was invisible on screen
 * and plain in the network tab. Only the last four digits ever leave the
 * server, which is all the table renders anyway.
 */
export interface Borrower {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  ssnLast4: string;
  creditScore: number;
  loanAmount: number;
  state: string;
  status: BorrowerStatus;
  /** ISO date, `YYYY-MM-DD`. */
  submittedAt: string;
}

/** A borrower as it is stored, SSN included. Never serialised to a client. */
export interface BorrowerRecord extends Omit<Borrower, 'ssnLast4'> {
  ssn: string;
}

export const SORT_KEYS = ['id', 'lastName', 'creditScore', 'loanAmount', 'submittedAt'] as const;

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
export interface BorrowerQuery {
  /** Name fragment, already trimmed. Empty means "no name filter". */
  q: string;
  status: BorrowerStatus | null;
  /** Two-letter state code, already upper-cased. */
  state: string | null;
  /** Inclusive lower bound. */
  minScore: number | null;
  sortBy: SortKey;
  page: number;
  limit: number;
}

export interface BorrowerSearchResult {
  results: Borrower[];
  /** Rows matching the filters — not the size of the table. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * The two backends behind the API routes: Postgres in deployment, an in-memory
 * fixture when no database is configured. Both answer the same questions with
 * the same semantics; see `lib/borrower-search/db.ts` for why the second one
 * exists.
 */
export interface BorrowerRepo {
  search(query: BorrowerQuery): Promise<BorrowerSearchResult>;
  byId(id: number): Promise<Borrower | null>;
  /** Returns the updated borrower, or null when no such id exists. */
  updateStatus(id: number, status: BorrowerStatus): Promise<Borrower | null>;
}

/** Strips the SSN down to what the UI actually displays. */
export function toBorrower(record: BorrowerRecord): Borrower {
  const { ssn, ...rest } = record;
  return { ...rest, ssnLast4: ssn.slice(-4) };
}
