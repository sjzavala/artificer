import Link from 'next/link';
import { ArrowUpRight, FileText } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { UploadDropzone } from '@/components/UploadDropzone';
import { StatusPill } from '@/components/ConfidenceChip';
import { listDealSummaries } from '@/lib/deals';
import { selectedStoreKind } from '@/lib/store';
import { salesforceMode } from '@/lib/salesforce';
import { formatMoney, formatPercent, formatRelative } from '@/lib/format';
import type { DealSummary } from '@/shared/deal';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const deals = await listDealSummaries();

  return (
    <AppShell active="deals" storeKind={selectedStoreKind()} salesforceMode={salesforceMode()}>
      <main className="mx-auto w-full max-w-[100rem] px-5 py-10 sm:px-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Deals</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Drop in a deal document. Claude extracts the net-lease terms with a citation for every value;
            you review, correct and approve before anything is written to Salesforce.
          </p>
        </div>

        <div className="mt-7 max-w-3xl">
          <UploadDropzone />
        </div>

        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-rule pb-3">
            <h2 className="text-sm font-medium text-ink">
              {deals.length} deal{deals.length === 1 ? '' : 's'}
            </h2>
            <span className="text-2xs uppercase tracking-wider text-ink-faint">Newest first</span>
          </div>

          {deals.length === 0 ? <EmptyState /> : <DealTable deals={deals} />}
        </section>
      </main>
    </AppShell>
  );
}

function DealTable({ deals }: { deals: DealSummary[] }) {
  return (
    <ul className="divide-y divide-rule">
      {deals.map((deal) => (
        <li key={deal.id}>
          <Link
            href={`/deals/${deal.id}`}
            className="focus-ring group grid grid-cols-1 gap-3 rounded-md px-1 py-4 transition-colors hover:bg-white md:grid-cols-12 md:items-center md:gap-4"
          >
            <div className="md:col-span-4">
              <div className="flex items-center gap-2">
                <span className="truncate text-[0.9375rem] font-medium text-ink">
                  {deal.tenantTradeName ?? 'Unidentified tenant'}
                </span>
                {deal.seeded ? (
                  <span className="shrink-0 rounded border border-rule px-1.5 py-0.5 text-2xs text-ink-faint">
                    sample
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-muted">{deal.addressLine ?? '—'}</div>
            </div>

            <div className="flex items-center gap-2 text-xs text-ink-muted md:col-span-3">
              <FileText size={13} className="shrink-0 text-ink-faint" />
              <span className="truncate">{deal.fileName}</span>
            </div>

            <div className="tnum text-sm text-ink md:col-span-2 md:text-right">
              {formatMoney(deal.askingPrice)}
            </div>

            <div className="tnum text-sm text-ink-muted md:col-span-1 md:text-right">
              {formatPercent(deal.capRate)}
            </div>

            <div className="flex items-center gap-3 md:col-span-2 md:justify-end">
              <span className="text-2xs text-ink-faint">{formatRelative(deal.createdAt)}</span>
              <StatusPill status={deal.status} />
              <ArrowUpRight
                size={14}
                className="hidden text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 md:block"
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="py-14 text-center">
      <p className="text-sm text-ink-muted">No deals yet.</p>
      <p className="mt-1 text-xs text-ink-faint">
        Upload a document above, or run <code className="font-mono">npm run seed</code> to plant the sample deal.
      </p>
    </div>
  );
}
