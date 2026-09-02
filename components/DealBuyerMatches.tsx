'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, Phone, TriangleAlert, Users } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { BuyerMatch, MatchResult } from '@/lib/factotum/match';

/**
 * Who to call about this deal, on the deal itself.
 *
 * The matching existed for a while before this did, reachable only by opening
 * the factotum and asking for it. That put the brokerage's central question —
 * who do I call — behind knowing that an assistant existed and how to phrase
 * something to it. A broker who has just finished reviewing a deal is exactly
 * the person who wants the answer, and this is exactly where they are.
 */

const CRITERION_LABEL: Record<string, string> = {
  capRate: 'the cap rate',
  market: 'the state',
  assetClass: 'the property type',
  guaranty: 'the guaranty',
  capital: 'the price',
};

export function DealBuyerMatches({ dealId }: { dealId: string }) {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeUnderContract, setIncludeUnderContract] = useState(false);

  async function load(withUnderContract = includeUnderContract) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/deals/${dealId}/buyers?includeUnderContract=${withUnderContract}`,
      );
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Could not match buyers.');
        setResult(null);
        return;
      }
      setResult(body as MatchResult);
    } catch {
      setError('Could not reach the server.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-rule bg-panel p-3.5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <Users size={12} aria-hidden className="text-accent" />
          Who to call
        </p>

        {result ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-ink-muted">
            <input
              type="checkbox"
              checked={includeUnderContract}
              onChange={(e) => {
                setIncludeUnderContract(e.target.checked);
                void load(e.target.checked);
              }}
              className="focus-ring rounded border-rule"
            />
            Include buyers already under contract
          </label>
        ) : null}
      </div>

      {!result && !error ? (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            Compare this deal against the buyer pipeline — cap rate, state, asset class, guaranty
            and price — and see who fits, plus who missed on exactly one thing.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="focus-ring mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <Phone size={13} aria-hidden />}
            {busy ? 'Matching…' : 'Find buyers for this deal'}
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {result ? <Results result={result} busy={busy} /> : null}
    </section>
  );
}

function Results({ result, busy }: { result: MatchResult; busy: boolean }) {
  const { profile } = result;

  return (
    <div className={busy ? 'opacity-50' : undefined}>
      <p className="mt-1.5 text-2xs text-ink-muted">
        Compared {result.consideredCount} buyer{result.consideredCount === 1 ? '' : 's'}
        {result.inactiveSkipped > 0 ? `, ${result.inactiveSkipped} not currently looking` : ''}.
      </p>

      {profile.unknown.length > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-2xs text-amber-900">
          <TriangleAlert size={11} aria-hidden className="mt-px shrink-0" />
          <span>
            The document does not state {profile.unknown.map((k) => CRITERION_LABEL[k] ?? k).join(', ')},
            so nobody was ruled out on {profile.unknown.length === 1 ? 'it' : 'those'}. Worth
            resolving before you make the calls.
          </span>
        </p>
      ) : null}

      {result.fits.length === 0 && result.nearMisses.length === 0 ? (
        <p className="mt-2.5 rounded-md border border-dashed border-rule-strong px-3 py-4 text-center text-xs text-ink-muted">
          Nobody in the pipeline fits this deal, and nobody missed on only one thing.
        </p>
      ) : null}

      {result.fits.length > 0 ? (
        <Group
          title={`Fits on every count — ${result.fits.length}`}
          matches={result.fits}
          tone="good"
          defaultOpen
        />
      ) : null}

      {result.nearMisses.length > 0 ? (
        <Group
          title={`Missed on one thing — ${result.nearMisses.length}`}
          matches={result.nearMisses}
          tone="warn"
          defaultOpen={result.fits.length === 0}
        />
      ) : null}

      <p className="mt-2.5 text-2xs text-ink-faint">
        Five comparisons, run the same way every time — this is not a model&rsquo;s opinion.{' '}
        <Link href="/buyers" className="focus-ring rounded underline underline-offset-2 hover:text-accent">
          Open the buyer pipeline
        </Link>
      </p>
    </div>
  );
}

function Group({
  title,
  matches,
  tone,
  defaultOpen,
}: {
  title: string;
  matches: BuyerMatch[];
  tone: 'good' | 'warn';
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const edge = tone === 'good' ? 'border-l-emerald-400' : 'border-l-amber-400';

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-1.5 rounded text-left"
      >
        <span className="eyebrow">{title}</span>
        <ChevronDown
          size={11}
          aria-hidden
          className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul className="mt-1.5 space-y-1.5">
          {matches.map((m) => (
            <li key={m.buyer.id} className={`border-l-2 ${edge} bg-sunken/40 py-1.5 pl-2.5 pr-2`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-medium text-ink">{m.buyer.entityName}</span>
                <span className="text-2xs text-ink-muted">{m.buyer.contactName}</span>
                <span className="text-2xs tabular-nums text-ink-faint">
                  {formatMoney(m.buyer.equity)} · {m.buyer.capitalSource}
                </span>
              </div>

              {/* A fit needs no explanation beyond fitting; a near miss is only
                  useful if it says which single test it failed. */}
              {m.failed.length > 0 ? (
                <p className="mt-0.5 text-2xs text-amber-800">
                  {m.criteria.find((c) => !c.passed)?.detail}
                </p>
              ) : null}

              {m.buyer.exchangeStartedOn ? (
                <p className="mt-0.5 text-2xs text-ink-faint">1031 exchange — check their deadline</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
