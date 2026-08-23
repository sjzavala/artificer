import type { CompletenessSummary } from '@/shared/schema';

/**
 * The completeness meter, as a proportional bar rather than a single number.
 *
 * "20 of 24 high confidence" hides the shape of the remainder — one missing
 * field and three shaky ones is a very different review from four missing ones.
 * The segments carry the same colours as the confidence chips, so the bar and
 * the rows are read with one vocabulary.
 */
export function ConfidenceMeter({ summary }: { summary: CompletenessSummary }) {
  const segments = [
    { key: 'high', n: summary.high, className: 'bg-emerald-500', label: 'high confidence' },
    { key: 'medium', n: summary.medium, className: 'bg-amber-400', label: 'medium' },
    { key: 'low', n: summary.low, className: 'bg-red-400', label: 'low' },
    { key: 'notFound', n: summary.notFound, className: 'bg-slate-300', label: 'not found' },
  ].filter((s) => s.n > 0);

  return (
    <div className="min-w-[15rem]">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="tnum font-semibold text-ink">
          {summary.high} of {summary.total}
        </span>
        <span className="text-ink-muted">fields high confidence</span>
        {summary.edited > 0 ? (
          <span className="tnum inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent">
            {summary.edited} edited
          </span>
        ) : null}
      </div>

      <div
        className="mt-2 flex h-2 w-full max-w-md overflow-hidden rounded-full bg-rule"
        role="img"
        aria-label={segments.map((s) => `${s.n} ${s.label}`).join(', ')}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.n} ${segment.label}`}
            className={`h-full transition-[width] duration-500 ${segment.className}`}
            style={{ width: `${(segment.n / summary.total) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5 text-2xs text-ink-muted">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${segment.className}`} />
            <span className="tnum">{segment.n}</span> {segment.label}
          </span>
        ))}
      </div>
    </div>
  );
}
