import Link from 'next/link';
import {
  CheckCircle2,
  FileUp,
  PencilLine,
  ScrollText,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { formatTimestamp } from '@/lib/format';
import type { AuditAction, AuditEntry } from '@/shared/deal';

const ICONS: Record<AuditAction, { icon: typeof FileUp; className: string }> = {
  document_uploaded: { icon: FileUp, className: 'text-ink-muted' },
  extraction_completed: { icon: Sparkles, className: 'text-ink-muted' },
  extraction_failed: { icon: TriangleAlert, className: 'text-red-600' },
  field_edited: { icon: PencilLine, className: 'text-amber-700' },
  deal_approved: { icon: CheckCircle2, className: 'text-accent' },
  deal_rejected: { icon: XCircle, className: 'text-red-600' },
  om_draft_generated: { icon: ScrollText, className: 'text-ink-muted' },
};

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Nothing logged yet. Upload a document to start the trail.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-rule pl-6">
      {entries.map((entry) => {
        const { icon: Icon, className } = ICONS[entry.action] ?? ICONS.document_uploaded;
        return (
          <li key={entry.id} className="relative pb-7 last:pb-0">
            <span className="absolute -left-[2.05rem] flex h-6 w-6 items-center justify-center rounded-full border border-rule bg-panel">
              <Icon size={12} className={className} />
            </span>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm text-ink">{entry.summary}</span>
              {entry.dealId ? (
                <Link
                  href={`/deals/${entry.dealId}`}
                  className="focus-ring rounded font-mono text-2xs text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-muted"
                >
                  {entry.dealId}
                </Link>
              ) : null}
            </div>

            <div className="mt-0.5 text-2xs text-ink-faint">
              {entry.actor} · {formatTimestamp(entry.at)}
            </div>

            {entry.details ? <Details details={entry.details} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Keys recorded for engineering but not shown on the timeline. The vendor model
 * identifier is one of them: the audit record keeps it, while a reviewer reading
 * the trail sees the product that acted, not the model behind it.
 */
const HIDDEN_DETAIL_KEYS = new Set(['model']);

function Details({ details }: { details: Record<string, unknown> }) {
  const rows = Object.entries(details).filter(
    ([k, v]) => !HIDDEN_DETAIL_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  );
  if (rows.length === 0) return null;

  return (
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-rule bg-white px-3 py-2">
      {rows.map(([key, value]) => (
        // min-w-0 lets the value truncate instead of forcing the row wider than
        // the screen; a fixed max-width alone overflowed a 375px phone.
        <div key={key} className="flex min-w-0 max-w-full items-baseline gap-1.5">
          <dt className="shrink-0 font-mono text-2xs text-ink-faint">{key}</dt>
          <dd className="tnum min-w-0 truncate text-2xs text-ink-muted sm:max-w-[22rem]" title={stringify(value)}>
            {stringify(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function stringify(value: unknown): string {
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
