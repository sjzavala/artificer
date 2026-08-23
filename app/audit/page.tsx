import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { readAudit } from '@/lib/audit';
import { listDealSummaries } from '@/lib/deals';
import { selectedStoreKind } from '@/lib/store';
import { salesforceMode } from '@/lib/salesforce';
import { AuditTimeline } from '@/components/AuditTimeline';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Artificer — Audit' };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const { deal: dealFilter } = await searchParams;
  const [entries, deals] = await Promise.all([readAudit(dealFilter), listDealSummaries()]);

  return (
    <AppShell active="audit" storeKind={selectedStoreKind()} salesforceMode={salesforceMode()}>
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Audit</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Every action taken in Artificer, in order, with who did it. The log is append-only — entries
            are never edited or removed.
          </p>
        </div>

        <nav className="mt-7 flex flex-wrap gap-1.5" aria-label="Filter by deal">
          <FilterChip href="/audit" label="All deals" active={!dealFilter} />
          {deals.map((deal) => (
            <FilterChip
              key={deal.id}
              href={`/audit?deal=${deal.id}`}
              label={deal.tenantTradeName ?? deal.fileName}
              active={dealFilter === deal.id}
            />
          ))}
        </nav>

        <div className="mt-8">
          <AuditTimeline entries={entries} />
        </div>
      </main>
    </AppShell>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`focus-ring max-w-[16rem] truncate rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? 'border-accent-ring bg-accent-soft font-medium text-accent' : 'border-rule bg-white text-ink-muted hover:border-ink-faint'
      }`}
    >
      {label}
    </Link>
  );
}
