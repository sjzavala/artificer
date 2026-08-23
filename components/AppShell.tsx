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
  active: 'deals' | 'audit' | null;
  salesforceMode: string;
  /** Lets the walkthrough's first step link straight to the seeded deal. */
  sampleDealHref?: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[100rem] items-center gap-8 px-5 sm:px-8">
          <Link href="/" className="focus-ring rounded-sm">
            <Brand />
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/" label="Deals" active={active === 'deals'} />
            <NavLink href="/audit" label="Audit" active={active === 'audit'} />
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Which CRM is live is meaningful to a reviewer — it is the
                difference between a rehearsal and a real write. Which storage
                backend is live is not, so it is not shown. */}
            {salesforceMode === 'mock' ? (
              <span
                title="Approvals are written to Artificer's mock CRM, not to a live Salesforce org."
                className="hidden items-center gap-1.5 rounded-full border border-rule bg-panel px-2.5 py-1 text-2xs text-ink-muted sm:inline-flex"
              >
                <Database size={11} className="text-ink-faint" />
                Demo CRM
              </span>
            ) : (
              <span className="hidden items-center gap-1.5 rounded-full border border-accent-ring bg-accent-soft px-2.5 py-1 text-2xs font-medium text-accent sm:inline-flex">
                <Database size={11} />
                Live Salesforce
              </span>
            )}
            <ReviewerBadge />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <Walkthrough sampleDealHref={sampleDealHref} />
    </div>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring relative rounded-md px-3 py-2 transition-colors ${
        active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
      {active ? (
        <span aria-hidden className="absolute inset-x-3 -bottom-[0.8125rem] h-[2px] rounded-full bg-accent" />
      ) : null}
    </Link>
  );
}

