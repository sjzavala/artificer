import type { BuyerStatus, CapitalSource, DeadlineUrgency } from '@/shared/buyer';

/**
 * Where a buyer sits in the pipeline, in the same visual grammar as the deal
 * workflow's StatusPill — one hue per state, a dot to carry it at a glance.
 */
const STATUS_STYLES: Record<BuyerStatus, { className: string; dot: string }> = {
  active: { className: 'bg-emerald-50 text-emerald-800 ring-emerald-300', dot: 'bg-emerald-500' },
  'under contract': { className: 'bg-amber-50 text-amber-900 ring-amber-300', dot: 'bg-amber-500' },
  closed: { className: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-500' },
  inactive: { className: 'bg-sunken text-ink-muted ring-rule-strong', dot: 'bg-ink-faint' },
};

export function BuyerStatusPill({ status }: { status: BuyerStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-2xs font-medium capitalize ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

/** Capital source reads as a quiet label — it qualifies the buyer, it is not a state. */
export function CapitalSourceTag({ source }: { source: CapitalSource }) {
  const emphasised = source === '1031 exchange';
  return (
    <span
      title={emphasised ? 'Subject to statutory 45- and 180-day deadlines' : undefined}
      className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-2xs ${
        emphasised ? 'bg-property-soft text-property ring-1 ring-inset ring-property-ring' : 'text-ink-muted'
      }`}
    >
      {source}
    </span>
  );
}

/**
 * The identification clock.
 *
 * Colour is doing real work here rather than decorating: inside a week is the
 * call a broker makes today. A passed deadline is shown rather than hidden,
 * because the buyer is still in the pipeline and someone needs to know why
 * they went quiet — there is no extension in the statute.
 */
const URGENCY_STYLES: Record<Exclude<DeadlineUrgency, 'none'>, string> = {
  critical: 'bg-red-50 text-red-800 ring-red-300',
  soon: 'bg-amber-50 text-amber-900 ring-amber-300',
  comfortable: 'bg-sunken text-ink-muted ring-rule-strong',
  passed: 'bg-slate-100 text-slate-500 ring-slate-200 line-through decoration-slate-400',
};

export function IdentificationClock({
  urgency,
  deadline,
  daysLeft,
}: {
  urgency: DeadlineUrgency;
  deadline: string | null;
  daysLeft: number | null;
}) {
  if (urgency === 'none' || !deadline || daysLeft === null) {
    return <span className="text-2xs text-ink-faint">—</span>;
  }

  const label =
    urgency === 'passed'
      ? 'window closed'
      : daysLeft === 0
        ? 'due today'
        : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;

  return (
    <span
      title={`45-day identification deadline: ${deadline}`}
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium tabular-nums ring-1 ring-inset ${URGENCY_STYLES[urgency]}`}
    >
      {label}
    </span>
  );
}
