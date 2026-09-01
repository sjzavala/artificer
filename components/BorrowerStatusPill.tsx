import type { BorrowerStatus } from '@/lib/borrower-search/types';

/**
 * A borrower's status, in the same visual grammar as the deal pipeline's
 * StatusPill — one hue per outcome, a dot to carry the meaning at a glance in a
 * long table.
 */
const STYLES: Record<BorrowerStatus, { className: string; dot: string }> = {
  Approved: { className: 'bg-emerald-50 text-emerald-800 ring-emerald-300', dot: 'bg-emerald-500' },
  Pending: { className: 'bg-amber-50 text-amber-900 ring-amber-300', dot: 'bg-amber-500' },
  Denied: { className: 'bg-red-50 text-red-800 ring-red-300', dot: 'bg-red-500' },
  Withdrawn: { className: 'bg-sunken text-ink-muted ring-rule-strong', dot: 'bg-ink-faint' },
};

export function BorrowerStatusPill({ status }: { status: BorrowerStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}
