import Link from 'next/link';
import { Database } from 'lucide-react';
import { Brand } from './Brand';
import { ReviewerBadge } from './ReviewerBadge';
import { Walkthrough } from './Walkthrough';

/**
 * The app chrome. One workflow, two destinations — the navigation is short on
 * purpose, because a bounded tool should look bounded.
 */
export function AppShell({
  children,
  active,
  salesforceMode,
  sampleDealHref = null,
}: {
  children: React.ReactNode;
  active: 'guide' | 'deals' | 'buyers' | 'factotum' | 'audit' | null;
  salesforceMode: string;
  /** Lets the walkthrough's first step link straight to the seeded deal. */
  sampleDealHref?: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Dark chrome: a deep band at the top gives the page an anchor and stops
          a white-card layout from reading as an unfinished wireframe. */}
      <header className="sticky top-0 z-30 border-b border-chrome-line bg-chrome bg-chrome-sheen">
        <div className="mx-auto w-full max-w-[100rem] px-5 sm:px-8">
          {/* Brand and identity stay on one line; the nav moves to its own row
              on a phone, where three tabs plus a name will not fit beside it. */}
          <div className="flex h-14 items-center gap-4 sm:h-16 sm:gap-8">
            <Link href="/" className="focus-ring shrink-0 rounded-sm">
              <Brand onDark />
            </Link>

            <nav className="hidden items-center gap-1 text-sm sm:flex">
              <NavLink href="/how-it-works" label="How it works" active={active === 'guide'} />
              <NavLink href="/" label="Deals" active={active === 'deals'} />
              <NavLink href="/buyers" label="Buyers" active={active === 'buyers'} />
              <NavLink href="/factotum" label="Factotum" active={active === 'factotum'} />
              <NavLink href="/audit" label="Audit" active={active === 'audit'} />
            </nav>

            <div className="ml-auto flex min-w-0 items-center gap-2.5">
              {salesforceMode === 'mock' ? (
                <span
                  title="Approvals are written to Artificer's mock CRM, not to a live Salesforce org."
                  className="hidden items-center gap-1.5 rounded-full border border-chrome-line bg-chrome-soft px-2.5 py-1 text-2xs text-chrome-text md:inline-flex"
                >
                  <Database size={11} className="text-chrome-text/60" />
                  Demo CRM
                </span>
              ) : (
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2.5 py-1 text-2xs font-medium text-emerald-300 md:inline-flex">
                  <Database size={11} />
                  Live Salesforce
                </span>
              )}
              <ReviewerBadge />
            </div>
          </div>

          <nav className="-mx-5 flex items-center gap-1 overflow-x-auto px-5 pb-1.5 text-sm sm:hidden">
            <NavLink href="/how-it-works" label="How it works" active={active === 'guide'} compact />
            <NavLink href="/" label="Deals" active={active === 'deals'} compact />
            <NavLink href="/buyers" label="Buyers" active={active === 'buyers'} compact />
            <NavLink href="/factotum" label="Factotum" active={active === 'factotum'} compact />
            <NavLink href="/audit" label="Audit" active={active === 'audit'} compact />
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <Walkthrough sampleDealHref={sampleDealHref} />
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
  compact = false,
}: {
  href: string;
  label: string;
  active: boolean;
  /** The phone row sits at the bottom of the header, so its rule hugs the link. */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring relative shrink-0 whitespace-nowrap rounded-md px-3 py-2 transition-colors ${
        active ? 'font-medium text-white' : 'text-chrome-text/70 hover:text-white'
      }`}
    >
      {label}
      {active ? (
        <span
          aria-hidden
          className={`absolute inset-x-3 h-[2px] rounded-full bg-emerald-400 ${
            compact ? 'bottom-0.5' : '-bottom-[0.8125rem]'
          }`}
        />
      ) : null}
    </Link>
  );
}

