import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Database } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { StepMarker } from '@/components/StepMarker';
import { PipelineStepper } from '@/components/PipelineStepper';
import { MockSalesforceAdapter } from '@/lib/salesforce/mock';
import { SOBJECT_LABELS, SOBJECT_ORDER } from '@/lib/salesforce/mapping';
import type { RecordPayload, SObjectName } from '@/lib/salesforce/types';
import { salesforceMode } from '@/lib/salesforce';
import { formatTimestamp } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The mock CRM record view. Deliberately styled like a record detail page rather
 * than like the rest of Artificer — the point of the demo's last screen is that
 * the data has left the tool and landed somewhere it will be worked with.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const set = await new MockSalesforceAdapter().getRecordSet(id);
  if (!set) notFound();

  return (
    <AppShell active="deals" salesforceMode={salesforceMode()}>
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <StepMarker step="view-record" />
        <Link
          href={`/deals/${set.dealId}`}
          className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} /> Back to review
        </Link>

        <div className="mt-4">
          <PipelineStepper current="crm" done={['upload', 'review', 'approve', 'crm']} />
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-card">
          <div className="border-b border-slate-200 bg-gradient-to-b from-[#eef3f9] to-[#f6f8fb] px-6 py-4">
            <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-slate-500">
              <Database size={13} />
              Deal
              <span className="rounded bg-slate-200 px-1.5 py-px font-mono text-[0.625rem] normal-case tracking-normal text-slate-700">
                mock org
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              {String(set.records.Deal__c.Name ?? 'Deal')}
            </h1>
            <p className="mt-1 font-mono text-xs text-slate-500">{set.id}</p>
            <p className="mt-2 text-xs text-slate-600">
              Approved by {set.approvedBy} · written {formatTimestamp(set.createdAt)}
              {set.updatedAt !== set.createdAt ? ` · updated ${formatTimestamp(set.updatedAt)}` : ''}
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {SOBJECT_ORDER.map((name) => (
              <RecordCard key={name} name={name} record={set.records[name]} />
            ))}
          </div>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          These records are held by Artificer&apos;s mock Salesforce adapter. Supplying SF_LOGIN_URL,
          SF_USERNAME and SF_PASSWORD switches the same write to a live org; the object and field names
          shown here are exactly the ones documented in <code className="font-mono">docs/salesforce-schema.md</code>.
        </p>
      </main>
    </AppShell>
  );
}

function RecordCard({ name, record }: { name: SObjectName; record: RecordPayload }) {
  const entries = Object.entries(record).filter(([key]) => key !== 'Id');

  return (
    <section className="px-6 py-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{SOBJECT_LABELS[name]}</h2>
        <span className="font-mono text-2xs text-slate-500">{name}</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2">
            <dt className="shrink-0 font-mono text-2xs text-slate-500">{key}</dt>
            {/* Record ids and the deal hash are long unbroken strings; without
                break-all they run straight off a phone screen. */}
            <dd
              className={`min-w-0 break-all text-right text-sm ${
                value === null || value === '' ? 'text-slate-400' : 'tnum text-slate-800'
              }`}
            >
              {value === null || value === '' ? '—' : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
