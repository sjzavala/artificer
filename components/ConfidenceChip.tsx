import type { Confidence } from '@/shared/schema';

const STYLES: Record<Confidence, { label: string; className: string; title: string }> = {
  high: {
    label: 'High',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
    title: 'Stated directly in the document',
  },
  medium: {
    label: 'Medium',
    className: 'bg-amber-50 text-amber-900 ring-amber-300',
    title: 'Derived or lightly interpreted from the document',
  },
  low: {
    label: 'Low',
    className: 'bg-red-50 text-red-800 ring-red-300',
    title: 'Ambiguous or conflicting in the document — check this',
  },
  not_found: {
    label: 'Not found',
    className: 'bg-sunken text-ink-muted ring-rule-strong',
    title: 'The document does not state this',
  },
};

export function ConfidenceChip({ confidence, className = '' }: { confidence: Confidence; className?: string }) {
  const style = STYLES[confidence];
  return (
    <span
      title={style.title}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset ${style.className} ${className}`}
    >
      {style.label}
    </span>
  );
}

export function StatusPill({ status }: { status: 'extracted' | 'approved' | 'rejected' }) {
  const map = {
    extracted: { label: 'Needs review', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
    approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
    rejected: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-red-300' },
  } as const;
  const style = map[status];
  const dot = { extracted: 'bg-amber-500', approved: 'bg-emerald-500', rejected: 'bg-red-500' }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {style.label}
    </span>
  );
}
