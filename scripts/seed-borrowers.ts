import { loadEnv } from './load-env';
loadEnv();

/**
 * Brings the borrower table up to date.
 *
 *   npm run seed-borrowers              # ensure the schema; seed only if empty
 *   npm run seed-borrowers -- --reseed  # discard the table's contents and reload
 *
 * The default is safe to run on every deploy, and `build` does exactly that.
 * It creates the table and its indexes if they are absent, then seeds only when
 * there are no rows — so a database that already holds decisions keeps them.
 *
 * `--reseed` is the destructive path: it truncates first. That is what returning
 * a demo to its first-impression state wants, and what a deploy must never do.
 *
 * With no DATABASE_URL (or POSTGRES_URL) the default exits quietly and
 * successfully: the app falls back to the in-memory fixture, which is this same
 * data, and a local build should not require a database. `--reseed` fails
 * instead, because it was asked to do something specific and could not.
 */
async function main() {
  const reseed = process.argv.includes('--reseed');
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!url) {
    if (reseed) {
      console.error(
        'No DATABASE_URL or POSTGRES_URL set, so there is nothing to reseed.\n' +
          'Provision Neon (or link Vercel Postgres) and put the connection string\n' +
          'in .env.local as DATABASE_URL.',
      );
      process.exit(1);
    }
    console.log('[borrowers] no database configured — using the in-memory fixture, nothing to do');
    return;
  }

  // Host only. A connection string carries the password, and this output ends
  // up in a build log.
  const { host } = new URL(url);
  const { migrateBorrowers } = await import('@/lib/borrower-search/db');
  const { seeded, total } = await migrateBorrowers(url, { reseed });

  if (seeded === null) {
    console.log(`[borrowers] ${host} — schema ensured, ${total} rows already present, left alone`);
  } else if (reseed) {
    console.log(`[borrowers] ${host} — reseeded, ${seeded} borrowers loaded`);
  } else {
    console.log(`[borrowers] ${host} — schema ensured, seeded ${seeded} borrowers into an empty table`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
