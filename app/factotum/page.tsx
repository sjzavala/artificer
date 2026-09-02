import { AppShell } from '@/components/AppShell';
import { Factotum } from '@/components/Factotum';
import { salesforceMode } from '@/lib/salesforce';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Artificer — Factotum' };

export default function FactotumPage() {
  return (
    <AppShell active="factotum" salesforceMode={salesforceMode()}>
      {/* A fixed-height column so the transcript scrolls and the composer stays
          put, rather than the whole page growing with the conversation. */}
      <main className="mx-auto flex h-[calc(100vh-6.5rem)] w-full max-w-4xl flex-col px-5 py-8 sm:px-8 lg:h-screen">
        <header className="mb-5 shrink-0">
          <span className="eyebrow">Assistant</span>
          <h1 className="display mt-2 text-[2rem] font-semibold leading-tight tracking-tightest text-ink">
            Factotum
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            <span className="text-ink">A factotum does all kinds of work.</span> Ask across your
            deals, their documents, the buyer pipeline and the open market at once — including who
            to call about a particular deal. It shows the lookups behind every answer, and it
            cannot change anything.
          </p>
        </header>

        <Factotum />
      </main>
    </AppShell>
  );
}
