import Link from 'next/link';
import { ArrowUpRight, CircleAlert, FileText } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { UploadDropzone } from '@/components/UploadDropzone';
import { StatusPill } from '@/components/ConfidenceChip';
import { listDealSummaries } from '@/lib/deals';
import { salesforceMode } from '@/lib/salesforce';
import { formatMoney, formatPercent, formatRelative } from '@/lib/format';
import type { DealSummary } from '@/shared/deal';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const deals = await listDealSummaries();
  // The walkthrough's first step links straight at the seeded deal when it is
  // present, and falls back to the newest deal otherwise.
  const sample = deals.find((d) => d.seeded) ?? deals[0];

  const needingReview = deals.filter((d) => d.status === 'extracted').length;
  const approved = deals.filter((d) => d.status === 'approved').length;
  const flagged = deals.reduce((n, d) => n + d.needsAttention, 0);

  return (
    <AppShell
      active="deals"
      salesforceMode={salesforceMode()}
      sampleDealHref={sample ? `/deals/${sample.id}` : null}
    >
      <main className="mx-auto w-full max-w-[100rem] px-5 py-10 sm:px-8">
        <div className="rise grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
          <div>
            <span className="eyebrow">Deal intake</span>
            <h1 className="display mt-2 text-[2rem] font-semibold leading-tight tracking-tightest text-ink">
              Deals
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
              Drop in a deal document. Claude extracts the net-lease terms with a citation for every
              value; you review, correct and approve before anything is written to Salesforce.
            </p>

            <dl className="mt-7 grid max-w-xl grid-cols-3 gap-3">
              <Stat label="Awaiting review" value={needingReview} />
              <Stat label="Approved" value={approved} tone="accent" />
              <Stat label="Fields flagged" value={flagged} tone={flagged > 0 ? 'warn' : 'plain'} />
            </dl>
          </div>

          <div className="lg:pt-8">
            <UploadDropzone />
          </div>
        </div>

        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-rule pb-2.5">
            <h2 className="text-sm font-medium text-ink">
              {deals.length} deal{deals.length === 1 ? '' : 's'}
            </h2>
            <span className="eyebrow">Newest first</span>
          </div>

          {deals.length === 0 ? <EmptyState /> : <DealTable deals={deals} />}
        </section>
      </main>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: number;
  tone?: 'plain' | 'accent' | 'warn';
}) {
  const valueTone = {
    plain: 'text-ink',
    accent: 'text-accent',
    warn: 'text-amber-700',
  }[tone];

  return (
    <div className="rounded-lg border border-rule bg-panel px-3.5 py-3 shadow-card">
      <dt className="text-2xs uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className={`tnum display mt-1 text-2xl font-semibold leading-none ${valueTone}`}>{value}</dd>
    </div>
  );
}

function DealTable({ deals }: { deals: DealSummary[] }) {
  return (
    <>
      {/* Column headers, shown only where the columns actually line up. */}
      <div className="hidden grid-cols-12 gap-4 px-3 pb-2 pt-3 md:grid">
        <span className="eyebrow col-span-4">Tenant / Property</span>
        <span className="eyebrow col-span-3">Document</span>
        <span className="eyebrow col-span-2 text-right">Price</span>
        <span className="eyebrow col-span-1 text-right">Cap</span>
        <span className="eyebrow col-span-2 text-right">Status</span>
      </div>

      <ul className="space-y-1.5">
        {deals.map((deal) => (
          <li key={deal.id}>
            <Link
              href={`/deals/${deal.id}`}
              className="focus-ring group grid grid-cols-1 gap-3 rounded-lg border border-transparent px-3 py-3.5 transition-all hover:border-rule hover:bg-panel hover:shadow-card md:grid-cols-12 md:items-center md:gap-4"
            >
              <div className="md:col-span-4">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[0.9375rem] font-medium text-ink">
                    {deal.tenantTradeName ?? 'Unidentified tenant'}
                  </span>
                  {deal.seeded ? (
                    <span className="shrink-0 rounded border border-rule bg-sunken px-1.5 py-px text-2xs text-ink-faint">
                      sample
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-muted">{deal.addressLine ?? '—'}</div>
              </div>

              <div className="flex min-w-0 items-center gap-2 text-xs text-ink-muted md:col-span-3">
                <FileText size={13} className="shrink-0 text-ink-faint" />
                <span className="truncate">{deal.fileName}</span>
              </div>

              <div className="tnum text-sm font-medium text-ink md:col-span-2 md:text-right">
                {formatMoney(deal.askingPrice)}
              </div>

              <div className="tnum text-sm text-ink-muted md:col-span-1 md:text-right">
                {formatPercent(deal.capRate)}
              </div>

              <div className="flex items-center gap-2.5 md:col-span-2 md:justify-end">
                {deal.needsAttention > 0 && deal.status === 'extracted' ? (
                  <span
                    title={`${deal.needsAttention} fields need attention`}
                    className="tnum inline-flex items-center gap-1 text-2xs text-amber-700"
                  >
                    <CircleAlert size={11} />
                    {deal.needsAttention}
                  </span>
                ) : null}
                <span className="hidden text-2xs text-ink-faint lg:inline">
                  {formatRelative(deal.createdAt)}
                </span>
                <StatusPill status={deal.status} />
                <ArrowUpRight
                  size={14}
                  className="hidden shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 md:block"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-rule-strong bg-panel/50 py-16 text-center">
      <p className="text-sm text-ink-muted">No deals yet.</p>
      <p className="mt-1.5 text-xs text-ink-faint">
        Upload a document above, or run <code className="rounded bg-sunken px-1.5 py-0.5 font-mono">npm run seed</code>{' '}
        to plant the sample deal.
      </p>
    </div>
  );
}
