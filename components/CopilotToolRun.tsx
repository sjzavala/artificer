'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  FileSearch,
  ListTree,
  TriangleAlert,
  Users,
  Wand2,
} from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { ToolRun } from '@/lib/copilot/types';
import type { BuyerMatch } from '@/lib/copilot/match';

/**
 * What the copilot looked up, shown rather than described.
 *
 * The assistant is read-only, so there is no reason to hide its working — and
 * every reason to show it. "Eleven buyers fit" is a claim; the same line with
 * the scoring behind it is something a broker can check before picking up the
 * phone.
 */

const ICONS: Record<string, typeof Users> = {
  list_deals: ListTree,
  ask_deal_document: FileSearch,
  search_buyers: Users,
  match_buyers_to_deal: Wand2,
};

const LABELS: Record<string, string> = {
  list_deals: 'Looked at the pipeline',
  ask_deal_document: 'Read the document',
  search_buyers: 'Searched buyers',
  match_buyers_to_deal: 'Matched buyers to the deal',
};

export function CopilotToolRun({ run }: { run: ToolRun }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[run.name] ?? ListTree;

  return (
    <div className="rounded-md border border-rule bg-sunken/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left"
      >
        <Icon size={12} aria-hidden className={run.ok ? 'text-ink-faint' : 'text-red-600'} />
        <span className="text-2xs font-medium text-ink-muted">{LABELS[run.name] ?? run.name}</span>
        <span className="min-w-0 flex-1 truncate text-2xs text-ink-faint">— {run.summary}</span>
        <ChevronDown
          size={12}
          aria-hidden
          className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="border-t border-rule px-2.5 py-2">
          {run.match ? <MatchDetail match={run.match} /> : null}

          {run.citations && run.citations.length > 0 ? (
            <ol className="space-y-1.5">
              {run.citations.map((c) => (
                <li key={`${c.marker}-${c.sourceLocation}`} className="text-2xs">
                  <span className="italic text-ink-soft">“{c.quote.slice(0, 200)}”</span>{' '}
                  <Link
                    href={`/deals/${c.dealId}#anchor-${c.sourceLocation}`}
                    className="focus-ring rounded font-mono text-ink-faint underline underline-offset-2 hover:text-accent"
                  >
                    {c.sourceLocation}
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}

          {!run.match && !run.citations?.length ? (
            <pre className="scroll-pane max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-ink-muted">
              {JSON.stringify(run.result, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MatchDetail({ match }: { match: NonNullable<ToolRun['match']> }) {
  const { profile } = match;

  return (
    <div>
      <p className="mb-2 text-2xs text-ink-muted">
        Scored {match.consideredCount} buyer{match.consideredCount === 1 ? '' : 's'} against{' '}
        <Link
          href={`/deals/${profile.dealId}`}
          className="focus-ring rounded underline underline-offset-2 hover:text-accent"
        >
          {profile.tenant ?? profile.dealId}
        </Link>
        {profile.capRate !== null ? ` at ${profile.capRate.toFixed(2)}%` : ''}
        {profile.state ? ` in ${profile.state}` : ''}.
        {match.inactiveSkipped > 0 ? ` ${match.inactiveSkipped} not currently looking.` : ''}
      </p>

      {profile.unknown.length > 0 ? (
        <p className="mb-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1 text-2xs text-amber-900">
          <TriangleAlert size={11} aria-hidden className="mt-px shrink-0" />
          <span>
            The document does not state {profile.unknown.join(', ')} — those tests could not be run,
            so every buyer passed them.
          </span>
        </p>
      ) : null}

      {match.fits.length > 0 ? (
        <MatchGroup title={`Fits (${match.fits.length})`} matches={match.fits} tone="good" />
      ) : null}
      {match.nearMisses.length > 0 ? (
        <MatchGroup
          title={`Near misses (${match.nearMisses.length})`}
          matches={match.nearMisses}
          tone="warn"
        />
      ) : null}
    </div>
  );
}

function MatchGroup({
  title,
  matches,
  tone,
}: {
  title: string;
  matches: BuyerMatch[];
  tone: 'good' | 'warn';
}) {
  const edge = tone === 'good' ? 'border-l-emerald-400' : 'border-l-amber-400';

  return (
    <div className="mb-2 last:mb-0">
      <p className="eyebrow mb-1">{title}</p>
      <ul className="space-y-1">
        {matches.map((m) => (
          <li key={m.buyer.id} className={`border-l-2 ${edge} bg-panel py-1 pl-2 pr-1`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xs font-medium text-ink">{m.buyer.entityName}</span>
              <span className="text-2xs text-ink-muted">{m.buyer.contactName}</span>
              <span className="text-2xs tabular-nums text-ink-faint">
                {formatMoney(m.buyer.equity)} · {m.buyer.capitalSource}
              </span>
            </div>
            <ul className="mt-0.5">
              {m.criteria
                .filter((c) => tone === 'warn' || !c.passed)
                .map((c) => (
                  <li
                    key={c.key}
                    className={`text-2xs ${c.passed ? 'text-ink-faint' : 'text-amber-800'}`}
                  >
                    {c.passed ? '· ' : '× '}
                    {c.detail}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
