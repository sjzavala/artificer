'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, Compass, RotateCcw, X } from 'lucide-react';
import {
  WALKTHROUGH_EVENT,
  WALKTHROUGH_STEPS,
  dismissWalkthrough,
  nextStep,
  readWalkthrough,
  restartWalkthrough,
  setCollapsed,
  type WalkthroughState,
} from '@/lib/walkthrough';

/**
 * A persistent guide rail rather than a modal takeover: it stays out of the way,
 * points at the one thing to do next, and ticks steps off as they actually
 * happen. Someone handed this URL cold should be able to get all the way to a
 * CRM record and an OM draft without being told anything.
 */
export function Walkthrough({ sampleDealHref }: { sampleDealHref: string | null }) {
  const [state, setState] = useState<WalkthroughState | null>(null);
  const [showAll, setShowAll] = useState(false);
  const pathname = usePathname();

  // The review screen has a decision bar pinned to the bottom right, and the
  // panel must never sit on top of the Approve button.
  const overFooter = Boolean(pathname?.startsWith('/deals/'));
  const bottom = overFooter ? 'bottom-[5.75rem]' : 'bottom-4';

  useEffect(() => {
    const sync = () => setState(readWalkthrough());
    sync();
    window.addEventListener(WALKTHROUGH_EVENT, sync);
    return () => window.removeEventListener(WALKTHROUGH_EVENT, sync);
  }, []);

  // Nothing renders server-side: progress lives in localStorage, and a flash of
  // the wrong state is worse than a frame of nothing.
  if (!state) return null;

  const done = new Set(state.done);
  const current = nextStep(state);
  const finished = !current;
  const currentIndex = current ? WALKTHROUGH_STEPS.findIndex((step) => step.id === current.id) : -1;

  if (state.dismissed) {
    return (
      <button
        type="button"
        onClick={() => restartWalkthrough()}
        className={`focus-ring fixed ${bottom} right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-rule bg-panel px-3 py-2 text-2xs text-ink-muted shadow-raised transition-colors hover:text-ink`}
      >
        <Compass size={12} /> Walkthrough
      </button>
    );
  }

  return (
    <aside
      aria-label="Guided walkthrough"
      className={`rise fixed ${bottom} right-4 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-rule bg-panel shadow-lifted`}
    >
      <header className="flex items-center gap-2 border-b border-rule bg-sunken px-3.5 py-2.5">
        <Compass size={13} className="shrink-0 text-accent" />
        <span className="text-xs font-medium text-ink">
          {finished ? 'Walkthrough complete' : 'Walkthrough'}
        </span>
        <span className="tnum ml-1 text-2xs text-ink-faint">
          {done.size}/{WALKTHROUGH_STEPS.length}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCollapsed(!state.collapsed)}
            aria-label={state.collapsed ? 'Expand walkthrough' : 'Collapse walkthrough'}
            className="focus-ring rounded p-1 text-ink-faint transition-colors hover:text-ink"
          >
            {state.collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            type="button"
            onClick={() => dismissWalkthrough()}
            aria-label="Hide walkthrough"
            className="focus-ring rounded p-1 text-ink-faint transition-colors hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {/* Progress stays visible even when collapsed. */}
      <div className="h-[3px] w-full bg-rule">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${(done.size / WALKTHROUGH_STEPS.length) * 100}%` }}
        />
      </div>

      {state.collapsed ? null : (
        <div className="max-h-[min(26rem,60vh)] overflow-y-auto px-3.5 py-3">
          {finished ? (
            <div>
              <p className="text-xs leading-relaxed text-ink-soft">
                That is the whole workflow: a document in, every field cited, a person deciding, and an
                audit entry for each step. Upload one of your own, or replay it from the start.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/audit"
                  className="focus-ring rounded-md border border-rule bg-white px-2.5 py-1.5 text-2xs font-medium text-ink transition-colors hover:border-ink-faint"
                >
                  See the audit trail
                </Link>
                <button
                  type="button"
                  onClick={() => restartWalkthrough()}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-2xs font-medium text-ink transition-colors hover:border-ink-faint"
                >
                  <RotateCcw size={11} /> Restart
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Only the current step by default. A full checklist floating over
                  the field list would obscure the very rows it is pointing at. */}
              <div className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-px flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border border-accent text-[0.5625rem] font-semibold text-accent"
                >
                  {currentIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-snug text-ink">{current.title}</p>
                  <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{current.body}</p>
                  {current.id === 'open-deal' && sampleDealHref ? (
                    <Link
                      href={sampleDealHref}
                      className="focus-ring mt-2 inline-block rounded-md bg-accent px-2.5 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-accent-hover"
                    >
                      Open the sample deal
                    </Link>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="focus-ring mt-3 inline-flex items-center gap-1 rounded text-2xs text-ink-faint transition-colors hover:text-ink-muted"
              >
                {showAll ? 'Hide' : 'Show'} all {WALKTHROUGH_STEPS.length} steps
                {showAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>

              {showAll ? (
                <ol className="mt-2.5 space-y-1.5 border-t border-rule pt-2.5">
                  {WALKTHROUGH_STEPS.map((step, index) => {
                    const complete = done.has(step.id);
                    const active = current.id === step.id;
                    return (
                      <li key={step.id} className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className={`mt-px flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border text-[0.5625rem] font-semibold ${
                            complete
                              ? 'border-accent bg-accent text-white'
                              : active
                                ? 'border-accent text-accent'
                                : 'border-rule-strong text-ink-faint'
                          }`}
                        >
                          {complete ? <Check size={9} strokeWidth={3} /> : index + 1}
                        </span>
                        <span
                          className={`text-2xs leading-snug ${
                            complete
                              ? 'text-ink-faint line-through decoration-ink-faint/40'
                              : active
                                ? 'font-medium text-ink'
                                : 'text-ink-muted'
                          }`}
                        >
                          {step.title}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
