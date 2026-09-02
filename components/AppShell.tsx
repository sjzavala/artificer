import Link from 'next/link';
import {
  BookOpen,
  Database,
  FileText,
  ScrollText,
  Sparkles,
  Users,
} from 'lucide-react';
import { Brand } from './Brand';
import { ReviewerBadge } from './ReviewerBadge';
import { Walkthrough } from './Walkthrough';

export type NavKey = 'guide' | 'deals' | 'buyers' | 'factotum' | 'audit';

/**
 * The app chrome: a rail on the left, everything else to the right of it.
 *
 * It used to be a strip of tabs across the top, which was right when there was
 * one workflow and two destinations. There are four tools now and they do
 * genuinely different jobs — read a document, work a pipeline, ask across all
 * of it — and a row of same-sized words gave a reader no way to tell them
 * apart. A rail has room to say what each one is for, and grouping separates
 * the tools from the record of what they did.
 */

interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  /** One line saying what this is for. The reason the rail earns its width. */
  hint: string;
  icon: typeof FileText;
}

const GUIDE: NavItem = {
  key: 'guide',
  href: '/',
  label: 'How it works',
  hint: 'Start here',
  icon: BookOpen,
};

const TOOLS: NavItem[] = [
  {
    key: 'deals',
    href: '/deals',
    label: 'Deals',
    hint: 'Documents in, reviewed data out',
    icon: FileText,
  },
  {
    key: 'buyers',
    href: '/buyers',
    label: 'Buyers',
    hint: 'Who is looking, and their deadlines',
    icon: Users,
  },
  {
    key: 'factotum',
    href: '/factotum',
    label: 'Factotum',
    hint: 'Ask across all of it',
    icon: Sparkles,
  },
];

const RECORD: NavItem[] = [
  {
    key: 'audit',
    href: '/audit',
    label: 'Audit',
    hint: 'Who did what, and when',
    icon: ScrollText,
  },
];

export function AppShell({
  children,
  active,
  salesforceMode,
  sampleDealHref = null,
}: {
  children: React.ReactNode;
  active: NavKey | null;
  salesforceMode: string;
  /** Lets the walkthrough's first step link straight to the seeded deal. */
  sampleDealHref?: string | null;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Its own full-height column, so a long deal list never carries the
          navigation off the top of the page. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-chrome-line bg-chrome bg-chrome-sheen lg:flex">
        <div className="px-5 py-5">
          <Link href="/" className="focus-ring rounded-sm">
            <Brand onDark />
          </Link>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          <RailLink item={GUIDE} active={active === GUIDE.key} />

          <Group label="Tools">
            {TOOLS.map((item) => (
              <RailLink key={item.key} item={item} active={active === item.key} />
            ))}
          </Group>

          <Group label="Record">
            {RECORD.map((item) => (
              <RailLink key={item.key} item={item} active={active === item.key} />
            ))}
          </Group>
        </nav>

        <div className="space-y-2.5 border-t border-chrome-line px-4 py-4">
          <SalesforceBadge mode={salesforceMode} />
          <ReviewerBadge />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Below the rail's breakpoint the same destinations run across the top,
            scrollable — a drawer you have to open to find out where you are is
            worse than a row you can see. */}
        <header className="sticky top-0 z-30 border-b border-chrome-line bg-chrome bg-chrome-sheen lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link href="/" className="focus-ring shrink-0 rounded-sm">
              <Brand onDark />
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <SalesforceBadge mode={salesforceMode} compact />
              <ReviewerBadge />
            </div>
          </div>
          <nav className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1.5 text-sm">
            {[GUIDE, ...TOOLS, ...RECORD].map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? 'page' : undefined}
                className={`focus-ring relative shrink-0 whitespace-nowrap rounded-md px-3 py-2 transition-colors ${
                  active === item.key ? 'font-medium text-white' : 'text-chrome-text/70 hover:text-white'
                }`}
              >
                {item.label}
                {active === item.key ? (
                  <span aria-hidden className="absolute inset-x-3 bottom-0.5 h-[2px] rounded-full bg-emerald-400" />
                ) : null}
              </Link>
            ))}
          </nav>
        </header>

        <div className="flex-1">{children}</div>
      </div>

      <Walkthrough sampleDealHref={sampleDealHref} />
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1.5 px-3 text-chrome-text/45">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring group relative flex gap-2.5 rounded-md px-3 py-2 transition-colors ${
        active ? 'bg-chrome-soft text-white' : 'text-chrome-text/75 hover:bg-chrome-soft/60 hover:text-white'
      }`}
    >
      {/* A bar on the leading edge rather than the underline the top strip used:
          an underline beneath a stacked item reads as a divider from the next
          one rather than as a mark on this one. */}
      {active ? (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-emerald-400" />
      ) : null}

      <Icon
        size={14}
        aria-hidden
        className={`mt-0.5 shrink-0 ${active ? 'text-emerald-400' : 'text-chrome-text/50'}`}
      />

      <span className="min-w-0">
        <span className="block text-sm leading-tight">{item.label}</span>
        <span className="mt-0.5 block text-2xs leading-snug text-chrome-text/50">{item.hint}</span>
      </span>
    </Link>
  );
}

function SalesforceBadge({ mode, compact = false }: { mode: string; compact?: boolean }) {
  const shared = compact ? 'hidden sm:inline-flex' : 'flex w-full';

  if (mode === 'mock') {
    return (
      <span
        title="Approvals are written to Artificer's mock CRM, not to a live Salesforce org."
        className={`items-center gap-1.5 rounded-full border border-chrome-line bg-chrome-soft px-2.5 py-1 text-2xs text-chrome-text ${shared}`}
      >
        <Database size={11} className="text-chrome-text/60" />
        Demo CRM
      </span>
    );
  }

  return (
    <span
      className={`items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2.5 py-1 text-2xs font-medium text-emerald-300 ${shared}`}
    >
      <Database size={11} />
      Live Salesforce
    </span>
  );
}
