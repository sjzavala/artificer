import { AppShell } from '@/components/AppShell';
import { BorrowerSearchPage } from '@/components/BorrowerSearchPage';
import { salesforceMode } from '@/lib/salesforce';
import { selectedRepoKind } from '@/lib/borrower-search/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Artificer — Borrower search' };

export default function BorrowerSearchRoute() {
  const repoKind = selectedRepoKind();

  return (
    <AppShell active="borrowers" salesforceMode={salesforceMode()}>
      <main className="mx-auto w-full max-w-[100rem] px-5 py-10 sm:px-8">
        <div className="rise max-w-2xl">
          <span className="eyebrow">Loan pipeline</span>
          <h1 className="display mt-2 text-[2rem] font-semibold leading-tight tracking-tightest text-ink">
            Borrower search
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Filter the loan book by name, status, state and credit score, and move an application
            through its decision. Every borrower here is fixture data.
          </p>

          {repoKind === 'memory' ? (
            <p className="mt-4 inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No database configured — showing the built-in sixty-borrower fixture. Status changes
              last until the server restarts. Set <code className="font-mono">DATABASE_URL</code> and
              run <code className="font-mono">npm run seed-borrowers</code> to persist them.
            </p>
          ) : null}
        </div>

        <div className="mt-9">
          <BorrowerSearchPage />
        </div>
      </main>
    </AppShell>
  );
}
