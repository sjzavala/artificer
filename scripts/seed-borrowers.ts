import { loadEnv } from './load-env';
loadEnv();

/**
 * Builds the borrower table and loads the sixty-row fixture.
 *
 *   npm run seed-borrowers
 *
 * Idempotent, so running it against an existing database is safe — the table is
 * created if absent and the fixture replaces whatever rows are there. Any
 * status edits made through the UI are discarded, which is the point: this is
 * how you get a demo back to its first-impression state.
 *
 * Needs DATABASE_URL (or POSTGRES_URL, which the Vercel integration sets). With
 * neither, there is nothing to seed — the app falls back to the in-memory
 * fixture, which is already this same data.
 */
async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error(
      'No DATABASE_URL or POSTGRES_URL set.\n\n' +
        'Without one, borrower search runs against the in-memory fixture and needs no seeding.\n' +
        'To seed a real database, provision Neon (or link Vercel Postgres) and put the\n' +
        'connection string in .env.local as DATABASE_URL.',
    );
    process.exit(1);
  }

  // Host only — a connection string carries the password.
  console.log(`seeding ${new URL(url).host} …`);

  const { migrateAndSeed } = await import('@/lib/borrower-search/db');
  const { borrowers } = await migrateAndSeed(url);

  console.log(`done — ${borrowers} borrowers loaded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
