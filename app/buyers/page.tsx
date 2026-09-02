import { AppShell } from '@/components/AppShell';
import { BuyerPipeline } from '@/components/BuyerPipeline';
import { salesforceMode } from '@/lib/salesforce';
import { selectedRepoKind } from '@/lib/buyers/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Artificer — Buyers' };

export default function BuyersPage() {
  const repoKind = selectedRepoKind();

  return (
    <AppShell active="buyers" salesforceMode={salesforceMode()}>
      <main className="mx-auto w-full max-w-[100rem] px-5 py-10 sm:px-8">
        <div className="rise max-w-2xl">
          <span className="eyebrow">Acquisitions</span>
          <h1 className="display mt-2 text-[2rem] font-semibold leading-tight tracking-tightest text-ink">
            Buyers
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Who is looking, what they will pay for, and how long they have. Buyers in a 1031
            exchange carry a 45-day identification clock that does not stop — the column shows
            what is left of it.
          </p>

          {repoKind === 'memory' ? (
            <p className="mt-4 inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No database configured — showing the built-in sixty-buyer fixture. Status changes
              last until the server restarts. Set <code className="font-mono">DATABASE_URL</code> and
              run <code className="font-mono">npm run seed-buyers</code> to persist them.
            </p>
          ) : null}
        </div>

        <div className="mt-9">
          <BuyerPipeline />
        </div>
      </main>
    </AppShell>
  );
}
