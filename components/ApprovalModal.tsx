'use client';

import { useEffect, useRef } from 'react';
import { Loader2, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { SOBJECT_LABELS, SOBJECT_ORDER } from '@/lib/salesforce/mapping';
import type { SObjectName } from '@/lib/salesforce/types';

/**
 * The last stop before anything leaves the tool. It states plainly what is about
 * to be written, where, and what is still unverified — the reviewer should never
 * be able to say afterwards that they did not know.
 */
export function ApprovalModal({
  open,
  mode,
  fieldCounts,
  needsAttention,
  isUpdate,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  mode: 'mock' | 'real';
  fieldCounts: Record<SObjectName, number>;
  needsAttention: number;
  isUpdate: boolean;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const total = SOBJECT_ORDER.reduce((n, name) => n + (fieldCounts[name] ?? 0), 0);

  return (
    /* z-[60] puts it above the walkthrough panel: a confirmation dialog must own the screen. */
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/25 px-5 py-10 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-title"
        className="rise w-full max-w-lg rounded-xl border border-rule bg-panel shadow-lifted"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div>
            <h2 id="approve-title" className="text-base font-semibold tracking-tight text-ink">
              {isUpdate ? 'Update Salesforce records' : 'Write to Salesforce'}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              {mode === 'mock'
                ? 'Mock adapter — records are persisted in Artificer, not in a live org.'
                : 'Live Salesforce org — this writes real records.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
            className="focus-ring rounded p-1 text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-5">
          <p className="text-sm text-ink">
            {isUpdate
              ? 'A record set already exists for these values. It will be updated in place — no duplicate is created.'
              : 'Four related records will be created:'}
          </p>

          <ul className="mt-3 divide-y divide-rule rounded-md border border-rule">
            {SOBJECT_ORDER.map((name) => (
              <li key={name} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-ink">{name}</span>
                <span className="text-xs text-ink-muted">
                  <span className="tnum">{fieldCounts[name] ?? 0}</span> field
                  {(fieldCounts[name] ?? 0) === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-muted">
            <span className="tnum">{total}</span> populated fields across{' '}
            <span className="tnum">{SOBJECT_ORDER.length}</span> objects, plus the relationship lookups
            linking them.
          </p>

          {needsAttention > 0 ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-700" />
              <p className="text-xs leading-relaxed text-amber-900">
                <span className="tnum font-medium">{needsAttention}</span> field
                {needsAttention === 1 ? ' is' : 's are'} still low-confidence or missing. Approving records them
                as they stand.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-rule px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="focus-ring rounded-md border border-rule bg-white px-3.5 py-2 text-sm text-ink transition-colors hover:border-ink-faint disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {submitting ? 'Writing…' : isUpdate ? 'Update records' : 'Write records'}
          </button>
        </footer>
      </div>
    </div>
  );
}
