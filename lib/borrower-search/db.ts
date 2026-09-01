/**
 * Picking a repository, and building the schema behind it.
 *
 * The selection mirrors `lib/store/index.ts`: the real backend when the
 * environment has been configured for it, a local stand-in otherwise, and an
 * override so tests can force either. Nothing about running artificer locally
 * should require provisioning a database first.
 */

import { neon } from '@neondatabase/serverless';
import { InMemoryBorrowerRepo } from './memory';
import { PostgresBorrowerRepo } from './postgres';
import { seedBorrowers } from './seed';
import { BORROWER_STATUSES, type BorrowerRepo } from './types';

export type BorrowerRepoKind = 'postgres' | 'memory';

let cached: BorrowerRepo | null = null;

/**
 * `postgres` once a connection string exists, `memory` otherwise.
 * BORROWER_SEARCH_REPO forces one either way.
 */
export function selectedRepoKind(): BorrowerRepoKind {
  const forced = process.env.BORROWER_SEARCH_REPO;
  if (forced === 'postgres' || forced === 'memory') return forced;
  return connectionString() ? 'postgres' : 'memory';
}

export function getBorrowerRepo(): BorrowerRepo {
  if (cached) return cached;
  cached = createRepo();
  return cached;
}

/** Test seam — drops the memoised instance, as `resetStore` does for the store. */
export function resetBorrowerRepo(): void {
  cached = null;
}

function createRepo(): BorrowerRepo {
  if (selectedRepoKind() === 'postgres') {
    const url = connectionString();
    if (!url) {
      throw new Error(
        'BORROWER_SEARCH_REPO=postgres but no connection string is set. ' +
          'Set DATABASE_URL (Vercel Postgres sets POSTGRES_URL automatically).',
      );
    }
    return new PostgresBorrowerRepo(neon(url));
  }
  return new InMemoryBorrowerRepo();
}

/**
 * Vercel's Postgres integration injects `POSTGRES_URL`; a hand-provisioned Neon
 * database is conventionally `DATABASE_URL`. Accept both so linking the
 * integration is enough on its own, with `DATABASE_URL` winning when a
 * developer has deliberately pointed at something else.
 */
function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/**
 * The table.
 *
 * `loan_amount` is numeric on purpose. The sandbox's text-sort defect lived in
 * a cast inside the query, never in the column, and storing money as text here
 * would make that bug structural — unfixable without a migration.
 *
 * The status CHECK is the backstop for the API's own validation. Two guards for
 * one rule is deliberate: the route returns a useful 400, and the column
 * guarantees the table cannot hold a status the UI has no way to render.
 */
export const BORROWER_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS borrowers (
    id            integer PRIMARY KEY,
    first_name    text    NOT NULL,
    last_name     text    NOT NULL,
    email         text    NOT NULL,
    ssn           text    NOT NULL,
    credit_score  integer NOT NULL,
    loan_amount   integer NOT NULL,
    state         text    NOT NULL,
    status        text    NOT NULL CHECK (status IN (${BORROWER_STATUSES.map((s) => `'${s}'`).join(', ')})),
    submitted_at  date    NOT NULL
  );
`;

/**
 * Case-insensitive search needs its own indexes: an ILIKE cannot use a plain
 * btree on `last_name`. Sixty rows will sequential-scan happily either way —
 * these are here so the shape stays honest if the fixture is ever replaced with
 * a real book of business.
 */
export const BORROWER_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS borrowers_last_name_lower_idx  ON borrowers (lower(last_name));`,
  `CREATE INDEX IF NOT EXISTS borrowers_first_name_lower_idx ON borrowers (lower(first_name));`,
  `CREATE INDEX IF NOT EXISTS borrowers_status_idx           ON borrowers (status);`,
  `CREATE INDEX IF NOT EXISTS borrowers_credit_score_idx     ON borrowers (credit_score);`,
];

const SEED_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'ssn',
  'credit_score',
  'loan_amount',
  'state',
  'status',
  'submitted_at',
];

/**
 * Creates the table and loads the sixty-row fixture. Idempotent: run it as
 * often as you like, and the table ends up in the same state.
 */
export async function migrateAndSeed(url: string): Promise<{ borrowers: number }> {
  const sql = neon(url);

  await sql.query(BORROWER_SCHEMA_SQL);
  for (const statement of BORROWER_INDEX_SQL) {
    await sql.query(statement);
  }

  const rows = seedBorrowers();
  const values: unknown[] = [];
  const tuples = rows.map((row, i) => {
    values.push(
      row.id,
      row.firstName,
      row.lastName,
      row.email,
      row.ssn,
      row.creditScore,
      row.loanAmount,
      row.state,
      row.status,
      row.submittedAt,
    );
    const base = i * SEED_COLUMNS.length;
    return `(${SEED_COLUMNS.map((_, c) => `$${base + c + 1}`).join(', ')})`;
  });

  // One statement rather than sixty round trips — over HTTP each one is its own
  // request, so the difference is not academic. Parameters are bound, not
  // interpolated, even though this fixture never contains user input.
  await sql.query(`TRUNCATE TABLE borrowers`);
  await sql.query(
    `INSERT INTO borrowers (${SEED_COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`,
    values,
  );

  return { borrowers: rows.length };
}
