import Link from 'next/link';
import { Check, FileUp, ScanLine, ShieldCheck, Database } from 'lucide-react';

/**
 * The four stages a deal passes through, shown on every screen.
 *
 * The single most common question from someone handed this cold is "where am I
 * and what happens next". A stepper answers both without them having to read
 * anything, and it makes the human-approval gate visible as a stage rather than
 * as a button they happen to find at the bottom of a list.
 */

export type Stage = 'upload' | 'review' | 'approve' | 'crm';

const STAGES: Array<{ id: Stage; label: string; hint: string; icon: typeof FileUp }> = [
  { id: 'upload', label: 'Document', hint: 'PDF in', icon: FileUp },
  { id: 'review', label: 'Extraction', hint: 'Artificer reads it', icon: ScanLine },
  { id: 'approve', label: 'Your approval', hint: 'You decide', icon: ShieldCheck },
  { id: 'crm', label: 'CRM record', hint: 'Written out', icon: Database },
];

export function PipelineStepper({
  current,
  done = [],
  recordHref,
}: {
  current: Stage;
  /** Stages already completed for this deal. */
  done?: Stage[];
  recordHref?: string | null;
}) {
  const currentIndex = STAGES.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Deal pipeline" className="flex items-stretch overflow-x-auto">
      {STAGES.map((stage, index) => {
        const complete = done.includes(stage.id) || index < currentIndex;
        const active = stage.id === current;
        const Icon = stage.icon;

        // The approval stage is the one that matters, so it is the one that
        // gets the accent when you are standing on it.
        const tone = active
          ? stage.id === 'approve'
            ? 'border-accent-ring bg-accent-soft text-accent'
            : 'border-property-ring bg-property-soft text-property'
          : complete
            ? 'border-accent-ring/60 bg-white text-accent'
            : 'border-rule bg-white/60 text-ink-faint';

        const body = (
          <span
            className={`flex min-w-[8.5rem] flex-1 items-center gap-2.5 border px-3 py-2 transition-colors ${tone} ${
              index === 0 ? 'rounded-l-lg' : ''
            } ${index === STAGES.length - 1 ? 'rounded-r-lg' : ''} ${index > 0 ? '-ml-px' : ''}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                complete ? 'bg-accent text-white' : active ? 'bg-white ring-1 ring-inset ring-current' : 'bg-sunken'
              }`}
            >
              {complete ? <Check size={12} strokeWidth={3} /> : <Icon size={12} />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium leading-tight">{stage.label}</span>
              <span className="block truncate text-2xs leading-tight opacity-70">{stage.hint}</span>
            </span>
          </span>
        );

        // Only the CRM stage is navigable, and only once it exists.
        return stage.id === 'crm' && recordHref && complete ? (
          <Link key={stage.id} href={recordHref} className="focus-ring flex flex-1 rounded-lg">
            {body}
          </Link>
        ) : (
          <span key={stage.id} className="flex flex-1">
            {body}
          </span>
        );
      })}
    </nav>
  );
}
