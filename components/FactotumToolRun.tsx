'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FileSearch, ListTree, Store, TriangleAlert, Users, Wand2, ScrollText } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { ToolRun } from '@/lib/factotum/types';
import type { BuyerMatch } from '@/lib/factotum/match';

/**
 * What the factotum looked up, shown rather than described.
 *
 * The assistant is read-only, so there is no reason to hide its working — and
 * every reason to show it. "Eleven buyers fit" is a claim; the same line with
 * the scoring behind it is something a broker can check before picking up the
 * phone.
 *
 * Which means it has to be readable *by a broker*. An earlier version dumped
 * the raw tool result as JSON, which is the right information in a form only
 * the person who wrote it can read. Every result now renders as the thing it
 * describes: deals as deals, money as money, dates as dates.
 */

const ICONS: Record<string, typeof Users> = {
  list_deals: ListTree,
  get_deal_fields: FileSearch,
  ask_deal_document: FileSearch,
  read_audit: ScrollText,
  search_buyers: Users,
  match_buyers_to_deal: Wand2,
  search_market_listings: Store,
};

const LABELS: Record<string, string> = {
  list_deals: 'Checked the deal pipeline',
  get_deal_fields: 'Read the deal’s details',
  ask_deal_document: 'Read the document',
  read_audit: 'Checked the history',
  search_buyers: 'Searched buyers',
  match_buyers_to_deal: 'Matched buyers to the deal',
  search_market_listings: 'Checked the market',
};

export function FactotumToolRun({ run }: { run: ToolRun }) {
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

      {open ? <div className="border-t border-rule px-2.5 py-2"><Detail run={run} /></div> : null}
    </div>
  );
}

function Detail({ run }: { run: ToolRun }) {
  if (!run.ok) {
    return <p className="text-2xs text-red-800">{run.summary}</p>;
  }
  if (run.match) return <MatchDetail match={run.match} />;
  if (run.citations?.length) return <Passages run={run} />;

  const result = run.result as Record<string, unknown>;

  switch (run.name) {
    case 'list_deals':
      return <Deals rows={asRows(result.deals)} />;
    case 'get_deal_fields':
      return <Fields rows={asRows(result.fields)} />;
    case 'read_audit':
      return <AuditEntries rows={asRows(result.entries)} />;
    case 'search_buyers':
      return <Buyers rows={asRows(result.buyers)} total={Number(result.total) || 0} />;
    case 'search_market_listings':
      return <Listings rows={asRows(result.listings)} total={Number(result.totalMatchedOnMarketplace) || 0} />;
    default:
      return <p className="text-2xs text-ink-muted">{run.summary}</p>;
  }
}

const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const money = (v: unknown) => (typeof v === 'number' ? formatMoney(v) : '—');
const pct = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(2)}%` : '—');

/** A readable date — "2 Sep 2026" rather than an ISO timestamp. */
function date(value: unknown): string {
  if (typeof value !== 'string') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="border-b border-rule/60 py-1 last:border-0 text-2xs">{children}</li>;
}

function Deals({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <ul>
      {rows.map((d, i) => (
        <Row key={i}>
          <Link
            href={`/deals/${String(d.dealId)}`}
            className="focus-ring rounded font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
          >
            {text(d.tenant)}
          </Link>
          <span className="text-ink-muted">
            {d.address ? ` · ${text(d.address)}` : ''} · {money(d.askingPrice)} · {pct(d.capRate)} ·{' '}
            {text(d.status)}
            {Number(d.fieldsFlagged) > 0 ? ` · ${d.fieldsFlagged} flagged` : ''}
          </span>
        </Row>
      ))}
    </ul>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'stated directly',
  medium: 'derived',
  low: 'ambiguous — check',
  not_found: 'not in the document',
};

function Fields({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <ul>
      {rows.map((f, i) => {
        const grade = String(f.confidence);
        const weak = grade === 'low' || grade === 'not_found';
        return (
          <Row key={i}>
            <span className="text-ink-muted">{text(f.label)}: </span>
            <span className="font-medium text-ink">{text(f.value)}</span>
            {/* The grade is part of the value, in words rather than a code. */}
            <span className={weak ? 'text-amber-800' : 'text-ink-faint'}> · {CONFIDENCE_LABEL[grade] ?? grade}</span>
            {f.confirmedByAPerson ? <span className="text-emerald-700"> · confirmed by a person</span> : null}
            {f.editedByAPerson ? <span className="text-emerald-700"> · corrected by a person</span> : null}
          </Row>
        );
      })}
    </ul>
  );
}

function AuditEntries({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <ul>
      {rows.map((e, i) => (
        <Row key={i}>
          <span className="text-ink">{text(e.summary)}</span>
          <span className="text-ink-faint"> — {text(e.actor)}, {date(e.at)}</span>
        </Row>
      ))}
    </ul>
  );
}

function Buyers({ rows, total }: { rows: Record<string, unknown>[]; total: number }) {
  return (
    <>
      {total > rows.length ? (
        <p className="mb-1 text-2xs text-ink-faint">Showing {rows.length} of {total}.</p>
      ) : null}
      <ul>
        {rows.map((b, i) => (
          <Row key={i}>
            <span className="font-medium text-ink">{text(b.entity)}</span>
            <span className="text-ink-muted">
              {' '}
              · {text(b.contact)} · {money(b.equity)} · {text(b.capitalSource)} · buys{' '}
              {Array.isArray(b.markets) ? (b.markets as string[]).join(', ') : '—'}
            </span>
            {typeof b.daysToIdentify === 'number' ? (
              <span className={b.daysToIdentify <= 7 ? 'text-red-700' : 'text-amber-800'}>
                {' '}
                ·{' '}
                {b.daysToIdentify < 0
                  ? 'exchange window closed'
                  : b.daysToIdentify === 0
                    ? 'must identify today'
                    : `${b.daysToIdentify} day${b.daysToIdentify === 1 ? '' : 's'} to identify`}
              </span>
            ) : null}
          </Row>
        ))}
      </ul>
    </>
  );
}

function Listings({ rows, total }: { rows: Record<string, unknown>[]; total: number }) {
  return (
    <>
      <p className="mb-1.5 rounded bg-amber-50 px-2 py-1 text-2xs text-amber-900">
        Asking prices on property for sale now — not what anything sold for.
      </p>
      {total > rows.length ? (
        <p className="mb-1 text-2xs text-ink-faint">Showing {rows.length} of {total} on the marketplace.</p>
      ) : null}
      <ul>
        {rows.map((l, i) => (
          <Row key={i}>
            <span className="font-medium text-ink">{text(l.concept)}</span>
            <span className="text-ink-muted">
              {' '}
              · {text(l.city)}
              {l.state ? `, ${text(l.state)}` : ''} · {money(l.askingPrice)} · {pct(l.capRate)} asking
              {l.yearBuilt ? ` · built ${text(l.yearBuilt)}` : ''}
              {l.leaseType ? ` · ${text(l.leaseType)}` : ''}
            </span>
          </Row>
        ))}
      </ul>
    </>
  );
}

function Passages({ run }: { run: ToolRun }) {
  return (
    <ol className="space-y-1.5">
      {(run.citations ?? []).map((c) => (
        <li key={`${c.marker}-${c.sourceLocation}`} className="text-2xs">
          <span className="italic text-ink-soft">“{c.quote.slice(0, 200)}”</span>{' '}
          <Link
            href={`/deals/${c.dealId}#anchor-${c.sourceLocation}`}
            className="focus-ring rounded whitespace-nowrap text-ink-faint underline underline-offset-2 hover:text-accent"
          >
            {c.page ? `page ${c.page}` : 'in the document'}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function MatchDetail({ match }: { match: NonNullable<ToolRun['match']> }) {
  const { profile } = match;

  return (
    <div>
      <p className="mb-2 text-2xs text-ink-muted">
        Compared {match.consideredCount} buyer{match.consideredCount === 1 ? '' : 's'} against{' '}
        <Link
          href={`/deals/${profile.dealId}`}
          className="focus-ring rounded underline underline-offset-2 hover:text-accent"
        >
          {profile.tenant ?? 'this deal'}
        </Link>
        {profile.capRate !== null ? ` at ${profile.capRate.toFixed(2)}%` : ''}
        {profile.state ? ` in ${profile.state}` : ''}.
        {match.inactiveSkipped > 0 ? ` ${match.inactiveSkipped} not currently looking.` : ''}
      </p>

      {profile.unknown.length > 0 ? (
        <p className="mb-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1 text-2xs text-amber-900">
          <TriangleAlert size={11} aria-hidden className="mt-px shrink-0" />
          <span>
            The document does not state {profile.unknown.map(criterionLabel).join(', ')} — nobody was
            ruled out on {profile.unknown.length === 1 ? 'it' : 'those'}.
          </span>
        </p>
      ) : null}

      {match.fits.length > 0 ? (
        <MatchGroup title={`Fits on every count (${match.fits.length})`} matches={match.fits} tone="good" />
      ) : null}
      {match.nearMisses.length > 0 ? (
        <MatchGroup
          title={`Missed on one thing (${match.nearMisses.length})`}
          matches={match.nearMisses}
          tone="warn"
        />
      ) : null}
    </div>
  );
}

/** The five tests, named as a broker would say them rather than as fields. */
function criterionLabel(key: string): string {
  return (
    {
      capRate: 'the cap rate',
      market: 'the state',
      assetClass: 'the property type',
      guaranty: 'who guarantees the lease',
      capital: 'the price',
    }[key] ?? key
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
