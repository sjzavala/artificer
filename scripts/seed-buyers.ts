import { loadEnv } from './load-env';
loadEnv();

/**
 * Brings the buyer table up to date.
 *
 *   npm run seed-buyers              # ensure the schema; seed only if empty
 *   npm run seed-buyers -- --reseed  # discard the table's contents and reload
 *
 * The default is safe to run on every deploy, and `build` does exactly that.
 * It creates the table and its indexes if absent, then seeds only when there
 * are no rows — so a pipeline that already holds decisions keeps them.
 *
 * `--reseed` is the destructive path. It is also the one that refreshes the
 * 1031 clocks: exchange dates are generated relative to the day the fixture is
 * built, so a demo left alone for a few months shows a pipeline of blown
 * deadlines until someone reseeds it.
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
    console.log('[buyers] no database configured — using the in-memory fixture, nothing to do');
    return;
  }

  // Host only. A connection string carries the password, and this output ends
  // up in a build log.
  const { host } = new URL(url);
  const { migrateBuyers, dropBorrowersTable } = await import('@/lib/buyers/db');

  // The borrower-search port that preceded this feature left a `borrowers`
  // table behind. Dropping it here means the cleanup travels with the deploy
  // that removes the code, rather than waiting for someone to remember.
  await dropBorrowersTable(url);

  const { seeded, total } = await migrateBuyers(url, { reseed });

  if (seeded === null) {
    console.log(`[buyers] ${host} — schema ensured, ${total} rows already present, left alone`);
  } else if (reseed) {
    console.log(`[buyers] ${host} — reseeded, ${seeded} buyers loaded`);
  } else {
    console.log(`[buyers] ${host} — schema ensured, seeded ${seeded} buyers into an empty table`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
