import Link from 'next/link';
import { Brand } from './Brand';
import { ReviewerBadge } from './ReviewerBadge';

/**
 * The app chrome. One workflow, three destinations — the navigation is short on
 * purpose, because a bounded tool should look bounded.
 */
export function AppShell({
  children,
  active,
  storeKind,
  salesforceMode,
}: {
  children: React.ReactNode;
  active: 'deals' | 'audit' | null;
  storeKind: string;
  salesforceMode: string;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center gap-6 px-5 sm:px-8">
          <Link href="/" className="focus-ring rounded-sm">
            <Brand />
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/" label="Deals" active={active === 'deals'} />
            <NavLink href="/audit" label="Audit" active={active === 'audit'} />
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-2xs uppercase tracking-wider text-ink-faint sm:inline">
              {storeKind} store · {salesforceMode} salesforce
            </span>
            <ReviewerBadge />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring rounded-md px-2.5 py-1.5 transition-colors ${
        active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );
}
