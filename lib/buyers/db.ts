/**
 * Picking a repository, and building the schema behind it.
 *
 * The selection mirrors `lib/store/index.ts`: the real backend when the
 * environment has been configured for it, a local stand-in otherwise, and an
 * override so tests can force either. Nothing about running artificer locally
 * should require provisioning a database first.
 */

import { neon } from '@neondatabase/serverless';
import { BUYER_STATUSES, CAPITAL_SOURCES } from '@/shared/buyer';
import { GUARANTOR_TYPES, PROPERTY_TYPES } from '@/shared/schema';
import { InMemoryBuyerRepo } from './memory';
import { PostgresBuyerRepo } from './postgres';
import { seedBuyers } from './seed';
import type { BuyerRepo } from './types';

export type BuyerRepoKind = 'postgres' | 'memory';

let cached: BuyerRepo | null = null;

/**
 * `postgres` once a connection string exists, `memory` otherwise.
 * BUYER_PIPELINE_REPO forces one either way.
 */
export function selectedRepoKind(): BuyerRepoKind {
  const forced = process.env.BUYER_PIPELINE_REPO;
  if (forced === 'postgres' || forced === 'memory') return forced;
  return connectionString() ? 'postgres' : 'memory';
}

export function getBuyerRepo(): BuyerRepo {
  if (cached) return cached;
  cached = createRepo();
  return cached;
}

/** Test seam — drops the memoised instance, as `resetStore` does for the store. */
export function resetBuyerRepo(): void {
  cached = null;
}

function createRepo(): BuyerRepo {
  if (selectedRepoKind() === 'postgres') {
    const url = connectionString();
    if (!url) {
      throw new Error(
        'BUYER_PIPELINE_REPO=postgres but no connection string is set. ' +
          'Set DATABASE_URL (Vercel Postgres sets POSTGRES_URL automatically).',
      );
    }
    return new PostgresBuyerRepo(neon(url));
  }
  return new InMemoryBuyerRepo();
}

/**
 * Vercel's Postgres integration injects `POSTGRES_URL`; a hand-provisioned Neon
 * database is conventionally `DATABASE_URL`. Accept both, with `DATABASE_URL`
 * winning when a developer has deliberately pointed at something else.
 */
function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

/**
 * The table.
 *
 * `equity` is an integer of dollars and the cap rates are `numeric(4,2)`,
 * because money and rates that are stored as text sort as text — the defect
 * that put $90,000 above $950,000 in the feature this replaced.
 *
 * The CHECK constraints are backstops for the API's own validation, and the
 * property-type and guarantor lists are generated from the deal schema's own
 * constants rather than retyped. If someone adds a property type to
 * `shared/schema.ts`, this constraint follows instead of silently rejecting it.
 */
export const BUYER_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS buyers (
    id                  integer PRIMARY KEY,
    entity_name         text        NOT NULL,
    contact_name        text        NOT NULL,
    email               text        NOT NULL,
    capital_source      text        NOT NULL CHECK (capital_source IN (${list(CAPITAL_SOURCES)})),
    equity              bigint      NOT NULL CHECK (equity >= 0),
    target_cap_rate_min numeric(4,2) NOT NULL,
    target_cap_rate_max numeric(4,2) NOT NULL,
    property_types      text[]      NOT NULL CHECK (
                          cardinality(property_types) > 0
                          AND property_types <@ ARRAY[${list(PROPERTY_TYPES)}]::text[]
                        ),
    min_guarantor       text        NOT NULL CHECK (min_guarantor IN (${list(GUARANTOR_TYPES)})),
    markets             text[]      NOT NULL CHECK (cardinality(markets) > 0),
    status              text        NOT NULL CHECK (status IN (${list(BUYER_STATUSES)})),
    -- Null for anyone not in an exchange. The 45- and 180-day deadlines are
    -- derived from this column, never stored, so they cannot drift from it.
    exchange_started_on date,
    added_on            date        NOT NULL,
    CHECK (target_cap_rate_max >= target_cap_rate_min)
  );
`;

/**
 * GIN indexes for the two array columns, because `= ANY(markets)` cannot use a
 * btree. Sixty rows will sequential-scan happily either way — these are here so
 * the shape stays honest if the fixture is replaced with a real book.
 */
export const BUYER_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS buyers_entity_name_lower_idx  ON buyers (lower(entity_name));`,
  `CREATE INDEX IF NOT EXISTS buyers_contact_name_lower_idx ON buyers (lower(contact_name));`,
  `CREATE INDEX IF NOT EXISTS buyers_status_idx             ON buyers (status);`,
  `CREATE INDEX IF NOT EXISTS buyers_equity_idx             ON buyers (equity);`,
  `CREATE INDEX IF NOT EXISTS buyers_exchange_started_idx   ON buyers (exchange_started_on);`,
  `CREATE INDEX IF NOT EXISTS buyers_markets_idx            ON buyers USING gin (markets);`,
  `CREATE INDEX IF NOT EXISTS buyers_property_types_idx     ON buyers USING gin (property_types);`,
];

const SEED_COLUMNS = [
  'id',
  'entity_name',
  'contact_name',
  'email',
  'capital_source',
  'equity',
  'target_cap_rate_min',
  'target_cap_rate_max',
  'property_types',
  'min_guarantor',
  'markets',
  'status',
  'exchange_started_on',
  'added_on',
];

export interface MigrationResult {
  schema: 'ensured';
  /** Rows loaded, or null when the table already held data and was left alone. */
  seeded: number | null;
  total: number;
}

/**
 * Brings the buyer table up to date, and seeds it only when it is empty.
 *
 * The empty check is the whole point, because this runs on every deploy. An
 * unconditional reload would be idempotent in the sense of always producing the
 * same table — and would silently discard every pipeline decision made since
 * the last release.
 *
 * Pass `reseed` to force the destructive path. That is also what refreshes the
 * exchange clocks, which are generated relative to the day the fixture is
 * built: a demo left alone for two months has a pipeline full of blown
 * deadlines until someone reseeds it.
 */
export async function migrateBuyers(
  url: string,
  { reseed = false }: { reseed?: boolean } = {},
): Promise<MigrationResult> {
  const sql = neon(url);

  await sql.query(BUYER_SCHEMA_SQL);
  for (const statement of BUYER_INDEX_SQL) {
    await sql.query(statement);
  }

  const counted = (await sql.query('SELECT count(*)::int AS n FROM buyers')) as { n: number }[];
  const before = Number(counted[0]?.n ?? 0);
  if (before > 0 && !reseed) {
    return { schema: 'ensured', seeded: null, total: before };
  }

  const rows = seedBuyers();
  const values: unknown[] = [];
  const tuples = rows.map((row, i) => {
    values.push(
      row.id,
      row.entityName,
      row.contactName,
      row.email,
      row.capitalSource,
      row.equity,
      row.targetCapRateMin,
      row.targetCapRateMax,
      row.propertyTypes,
      row.minGuarantor,
      row.markets,
      row.status,
      row.exchangeStartedOn,
      row.addedOn,
    );
    const base = i * SEED_COLUMNS.length;
    return `(${SEED_COLUMNS.map((_, c) => `$${base + c + 1}`).join(', ')})`;
  });

  if (before > 0) await sql.query('TRUNCATE TABLE buyers');

  // One statement rather than sixty round trips — over HTTP each one is its own
  // request, so the difference is not academic.
  await sql.query(
    `INSERT INTO buyers (${SEED_COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`,
    values,
  );

  return { schema: 'ensured', seeded: rows.length, total: rows.length };
}

/** Removes the table the borrower-search port left behind. */
export async function dropBorrowersTable(url: string): Promise<void> {
  await neon(url).query('DROP TABLE IF EXISTS borrowers');
}
