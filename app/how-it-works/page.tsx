import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  Crosshair,
  Database,
  FileUp,
  Eye,
  FileSearch,
  Globe,
  ListTree,
  Lock,
  MessageCircleQuestion,
  MessagesSquare,
  Quote,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wand2,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { PipelineStepper } from '@/components/PipelineStepper';
import { ConfidenceChip } from '@/components/ConfidenceChip';
import { listDealSummaries } from '@/lib/deals';
import { salesforceMode } from '@/lib/salesforce';
import { CONFIDENCE_LEVELS, FIELD_COUNT, SECTIONS, fieldsForSection } from '@/shared/schema';
import { SECTION_STYLES } from '@/components/sections';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Artificer — How it works' };

export default async function HowItWorksPage() {
  const deals = await listDealSummaries();
  const sample = deals.find((d) => d.seeded) ?? deals[0];
  const sampleHref = sample ? `/deals/${sample.id}` : '/';

  return (
    <AppShell active="guide" salesforceMode={salesforceMode()} sampleDealHref={sample ? sampleHref : null}>
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
        <header className="rise max-w-3xl">
          <span className="eyebrow">Guide</span>
          <h1 className="display mt-2 text-[2rem] font-semibold leading-tight tracking-tightest text-ink">
            How Artificer works
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
            Artificer reads a net-lease deal document and turns it into structured data you can
            review, keeps the book of buyers that data gets matched against, and has an assistant
            that can reach all of it at once — plus what is currently on the market. It is bounded
            on purpose: it answers from your documents, your pipeline and live listings, it shows
            you where every answer came from, and the decisions that matter are still yours.
          </p>
        </header>

        {/* ---- The pipeline ------------------------------------------------ */}
        <section className="mt-10">
          <PipelineStepper current="approve" done={['upload', 'review']} />
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Four stages. The third one is you — there is no path from a document to the CRM that
            skips it, and nothing is written until you click approve.
          </p>
        </section>

        {/* ---- What each stage does ---------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>What each stage does</SectionHeading>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <StageCard
              n="01"
              icon={<FileUp size={15} />}
              tone="property"
              title="Document in"
              body="Drop in an offering memo, lease or LOI as a PDF. The text is extracted and split into paragraphs, each given a stable id so a citation can point at one exactly."
              note="Scanned PDFs need OCR first — Artificer says so rather than returning empty fields."
            />
            <StageCard
              n="02"
              icon={<ScanLine size={15} />}
              tone="tenant"
              title="Extraction"
              body={`${FIELD_COUNT} net-lease fields are extracted at once. Every value carries a confidence grade and the verbatim passage it came from.`}
              note="Every quote is then located in the document independently. One that cannot be found loses its citation and its grade."
            />
            <StageCard
              n="03"
              icon={<ShieldCheck size={15} />}
              tone="econ"
              title="Your approval"
              body="The document sits on the left, the extracted fields on the right. Click a field to see its source, correct anything wrong, then approve or reject with a reason."
              note="Approving shows exactly which records and how many fields are about to be written, before anything happens."
            />
            <StageCard
              n="04"
              icon={<Database size={15} />}
              tone="lease"
              title="CRM record"
              body="A Property and an Opportunity are written to Salesforce — the same objects that back the public marketplace, so an approved deal reaches it through the sync that already exists. Afterwards you can generate a draft offering-memo summary from the approved data."
              note="Approving the same values again updates those records instead of creating duplicates."
            />
          </div>
        </section>

        {/* ---- Step by step ------------------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>Using it, step by step</SectionHeading>
          <p className="mt-2 text-sm text-ink-muted">
            The walkthrough in the corner of the screen follows these same steps and ticks them off
            as you do them.
          </p>

          <ol className="mt-6 space-y-3">
            <Step
              n={1}
              title="Open a deal"
              body={
                <>
                  Go to <Strong>Deals</Strong> and open one. A sample Dollar General offering memo is
                  already there, extracted and waiting for review.
                </>
              }
            />
            <Step
              n={2}
              title="Check where a value came from"
              body={
                <>
                  Click any field on the right. The document scrolls to the passage it was read from
                  and highlights it. Fields with a{' '}
                  <Quote size={11} className="inline align-[-1px] text-ink-muted" /> icon have a
                  citation; no value on the screen is unsourced.
                </>
              }
            />
            <Step
              n={3}
              title="Resolve anything flagged"
              body={
                <>
                  The amber strip lists every field Artificer could not state confidently; clicking
                  one jumps to it. Each flagged field offers a way to settle it rather than just
                  reporting the problem: where the document contradicts itself, the competing value
                  is offered as <Strong>Use 9,026 SF</Strong> with its own quote, and choosing it
                  moves the citation too. Otherwise, type a value, mark it{' '}
                  <Strong>Looks right</Strong>, or — where the document really is silent —{' '}
                  <Strong>Confirm not stated</Strong>. Corrections are recorded as yours, and the
                  original stays visible on hover.
                </>
              }
            />
            <Step
              n={4}
              title="Approve, or reject with a reason"
              body={
                <>
                  <Strong>Approve &amp; Write to Salesforce</Strong> opens a confirmation listing the
                  objects and field counts. Rejecting requires a reason, which goes into the audit
                  log.
                </>
              }
            />
            <Step
              n={5}
              title="Look at the record"
              body={<>The written records, shown as a CRM record view with their relationship.</>}
            />
            <Step
              n={6}
              title="Draft the summary"
              body={
                <>
                  <Strong>Draft OM Summary</Strong> writes investment highlights, property and tenant
                  overviews and an economics table — from the approved record, never from the
                  original document, so it can only contain values you signed off on.
                </>
              }
            />
          </ol>
        </section>

        {/* ---- Confidence grades -------------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>What the confidence grades mean</SectionHeading>
          <p className="mt-2 text-sm text-ink-muted">
            The grade says how directly the document supports the value. It decides what gets flagged
            for you, so it is graded honestly rather than optimistically.
          </p>

          <div className="mt-5 overflow-hidden rounded-lg border border-rule bg-panel">
            {CONFIDENCE_LEVELS.map((level, index) => (
              <div
                key={level}
                className={`flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                  index > 0 ? 'border-t border-rule' : ''
                }`}
              >
                <div className="w-24 shrink-0">
                  <ConfidenceChip confidence={level} />
                </div>
                <p className="text-xs leading-relaxed text-ink-soft">{GRADE_COPY[level]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- What gets extracted ------------------------------------------ */}
        <section className="mt-12">
          <SectionHeading>What gets extracted</SectionHeading>
          <p className="mt-2 text-sm text-ink-muted">
            <span className="tnum">{FIELD_COUNT}</span> fields in four groups. Each group has its own
            colour on the review screen.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SECTIONS.map((section) => {
              const style = SECTION_STYLES[section.key];
              const Icon = style.icon;
              const fields = fieldsForSection(section.key);

              return (
                <div key={section.key} className="rounded-lg border border-rule bg-panel p-4">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ${style.chip}`}>
                      <Icon size={13} />
                    </span>
                    <h3 className={`text-2xs font-semibold uppercase tracking-wider ${style.label}`}>
                      {section.label}
                    </h3>
                    <span className="tnum ml-auto text-2xs text-ink-faint">{fields.length} fields</span>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
                    {fields.map((f) => f.label).join(' · ')}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- Asking the document ------------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>Asking a document a question</SectionHeading>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft">
            The extraction answers {FIELD_COUNT} questions decided in advance. For everything else
            there is a box above the extracted data on the review screen: ask about the document
            open beside it — <Strong>who carries roof and structure</Strong>, <Strong>what happens
            on casualty</Strong>, <Strong>is there a termination right</Strong> — and the answer
            comes back footnoted.
          </p>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
            The footnotes are the feature. Each one is a numbered button; clicking it jumps the
            document pane to that paragraph and highlights the exact sentence, the same way a
            field&rsquo;s citation does. And before any of them reach you, every quoted passage is
            searched for in the document.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <CitationPath
              tone="good"
              icon={<Quote size={14} />}
              title="Found where it said"
              body="The passage is in the document, in the paragraph the model pointed at. The citation stands."
            />
            <CitationPath
              tone="warn"
              icon={<Crosshair size={14} />}
              title="Found somewhere else"
              body="The passage is real but filed under the wrong paragraph. The quote is the evidence, so the pointer is corrected rather than the answer discarded."
            />
            <CitationPath
              tone="bad"
              icon={<ShieldCheck size={14} />}
              title="Not in the document"
              body="The passage does not exist. The citation is dropped and its marker removed — and if every passage for an answer was invented, the answer is shown as unverified rather than as fact."
            />
          </div>

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-muted">
            It answers from the document and nothing else. Ask about something the memo does not
            cover and it says so, and tells you what the document does address instead — it will
            not fill the gap from general knowledge of how these deals usually work.
          </p>
        </section>

        {/* ---- The buyer pipeline -------------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>The buyer pipeline</SectionHeading>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft">
            A deal is only half the job; the other half is knowing who to call. The
            <Strong> Buyers</Strong> tab holds the book — the purchasing entity and the person
            behind it, equity available, the cap rate band they will transact in, the asset classes
            and states they buy in, and the weakest lease guaranty they will accept. The same words
            the extraction uses, so the two sides describe a deal identically.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <StageCard
              n="01"
              icon={<Users size={15} />}
              tone="property"
              title="Who is looking"
              body="Filter by status, capital source, market, asset class, guaranty and equity available. Every count reflects the filters, so the number at the top is the size of the answer, not of the book."
              note="Move a buyer through active, under contract, closed and inactive as the deal progresses."
            />
            <StageCard
              n="02"
              icon={<CalendarClock size={15} />}
              tone="lease"
              title="The 1031 clock"
              body="A buyer in an exchange has 45 days from their sale closing to identify replacement property and 180 to close. Both are shown as time remaining, counted from the closing date rather than stored."
              note="Inside two weeks turns amber, inside a week red. There is no extension in the statute, so a window that has closed is shown as closed rather than hidden."
            />
            <StageCard
              n="03"
              icon={<Sparkles size={15} />}
              tone="econ"
              title="Ask in plain English"
              body="“Exchange buyers who need to identify within two weeks” sets the capital source, the deadline window and the sort order in one go."
              note="The filters it chose land in the controls, so you can see the reading it took and adjust it rather than trust a list of names."
            />
          </div>

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-muted">
            Status changes are written to the same audit log as everything else, with who made them
            and when. Moving a buyer to closed is a decision someone will ask about later.
          </p>
        </section>

        {/* ---- The factotum ---------------------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>The Factotum</SectionHeading>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft">
            The other tabs each answer one kind of question. The <Strong>Factotum</Strong> reaches
            all of them at once, which is what makes the question a brokerage actually asks
            answerable: <Strong>who do I call about this deal?</Strong> Answering that means
            knowing the deal&rsquo;s cap rate, state, asset class, guaranty and price, then holding
            every buyer&rsquo;s stated criteria against them — two sides that only became
            comparable because they are described in the same words.
          </p>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
            It holds a conversation, so a follow-up can say &ldquo;which of those&rdquo; and be
            understood, and it will do the work a colleague would: draft the email, say what the
            buyer will push back on, tell you where a price sits against the market.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-rule bg-panel p-4">
              <p className="eyebrow mb-2.5 flex items-center gap-1.5">
                <Database size={12} aria-hidden className="text-ink-faint" />
                In your workspace
              </p>
              <dl className="space-y-2">
                <ToolLine icon={<ListTree size={12} />} name="The pipeline" body="Every deal, its status, and what is flagged." />
                <ToolLine icon={<ScanLine size={12} />} name="Extracted fields" body={`All ${FIELD_COUNT}, with their confidence grades and whether a person confirmed them.`} />
                <ToolLine icon={<FileSearch size={12} />} name="The documents" body="The same verified-passage reading the Ask box does." />
                <ToolLine icon={<Users size={12} />} name="The buyer book" body="Who is looking, and whose 1031 clock is running down." />
                <ToolLine icon={<Wand2 size={12} />} name="Deal-to-buyer matching" body="Fits and near misses, with the reason for each." />
                <ToolLine icon={<ScrollText size={12} />} name="The audit log" body="Who did what, and when." />
              </dl>
            </div>

            <div className="rounded-lg border border-rule bg-panel p-4">
              <p className="eyebrow mb-2.5 flex items-center gap-1.5">
                <Globe size={12} aria-hidden className="text-ink-faint" />
                Outside it
              </p>
              <dl className="space-y-2">
                <ToolLine
                  icon={<Store size={12} />}
                  name="Live listings"
                  body="Net-lease property currently for sale on the NNN Pro marketplace — tenant, location, asking price, NOI and the cap rate those two imply."
                />
              </dl>
              <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-2 text-2xs leading-relaxed text-amber-900">
                <Strong>Asking prices, not sales.</Strong> A seller listing at 6.75% tells you what
                is being asked today, not what anything traded for. It is useful for placing a deal
                in a range and misleading if you read it as a valuation — so the Factotum says
                &ldquo;currently listed at&rdquo; rather than &ldquo;trading at&rdquo;. There are no
                closed comps here, and no other outside source.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CitationPath
              tone="good"
              icon={<Lock size={14} />}
              title="It cannot act"
              body="No status changes, no edits, no approvals — not as a rule it follows, but because no such tool exists for it to reach. Every write is still a person clicking a button."
            />
            <CitationPath
              tone="good"
              icon={<Eye size={14} />}
              title="It shows its working"
              body="Every lookup is listed above the answer and can be opened. “Eleven buyers fit” is a claim; the scoring behind it is something you can check before you phone anyone."
            />
            <CitationPath
              tone="warn"
              icon={<MessagesSquare size={14} />}
              title="Facts and judgement differ"
              body="A buyer, a figure, a date or a lease term comes from a lookup or it does not get said. What those facts imply — the risk, the positioning, the draft email — is the assistant’s own read, and it says so."
            />
          </div>

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-muted">
            The matching itself is ordinary code, not something the assistant reasons its way
            through: five comparisons — cap rate band, market, asset class, guaranty floor, and
            whether the equity covers the cheque — run the same way every time. And a test the deal
            cannot answer, because the document never stated the guarantor, passes rather than
            fails. Excluding a buyer over a gap in a memo would narrow your list on the strength of
            something nobody knows, so the gap is reported instead.
          </p>
        </section>

        {/* ---- Principles ---------------------------------------------------- */}
        <section className="mt-12">
          <SectionHeading>What it will and will not do</SectionHeading>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Principle
              tone="good"
              title="It will never write without you"
              body="There is no automatic path to the CRM. Every record set that exists was created by someone clicking approve."
            />
            <Principle
              tone="good"
              title="It will show its source for every value"
              body="Each field carries the verbatim passage it came from, and the citation is verified against the document rather than taken on trust."
            />
            <Principle
              tone="bad"
              title="It will not guess"
              body="A field the document does not state comes back as “not found”. That is treated as the correct answer, not a failure — an invented value is far more dangerous than a missing one."
            />
            <Principle
              tone="good"
              title="It will not leave you stuck with a flag"
              body="Where a document contradicts itself, both figures are kept with their own citations, and the competing one can be adopted in a click. Every flagged field can be corrected, accepted, or confirmed as genuinely absent."
            />
            <Principle
              tone="bad"
              title="It will not quietly change its mind"
              body="Every upload, extraction, edit, approval, rejection and buyer status change is written to an append-only audit log with who did it and when."
            />
            <Principle
              tone="bad"
              title="The Ask box stays inside the document"
              body="Ask it something the document does not cover and it says so. It will not reason from how net-lease deals usually work — on that screen you need to know what this document says, not what a typical one would."
            />
            <Principle
              tone="good"
              title="It will not act on your behalf"
              body="The factotum can read everything and change nothing. That is structural rather than a rule it follows: no tool exists for it to write with, so no way of asking will produce one."
            />
            <Principle
              tone="good"
              title="It will show you when it got a citation wrong"
              body="A quoted passage that is not in the document is dropped rather than displayed, and an answer whose every passage failed that check is labelled unverified. You are told when the machine was wrong, not just when it was right."
            />
          </div>
        </section>

        {/* ---- CTA ------------------------------------------------------------ */}
        <section className="mt-12 rounded-xl border border-accent-ring bg-accent-soft px-6 py-6">
          <h2 className="display text-lg font-semibold tracking-tight text-accent">Try it on the sample deal</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            A Dollar General offering memo, already extracted. Two fields are flagged — one of them
            because the memo contradicts itself about the building size. See whether you catch it,
            then ask the Factotum who you should call about it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Link
              href={sampleHref}
              className="focus-ring group inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Open the sample deal
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/buyers"
              className="focus-ring group inline-flex items-center gap-2 rounded-lg border border-accent-ring bg-white px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent"
            >
              <Users size={15} />
              See the buyer pipeline
            </Link>
            <Link
              href="/factotum"
              className="focus-ring group inline-flex items-center gap-2 rounded-lg border border-accent-ring bg-white px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent"
            >
              <Sparkles size={15} />
              Ask the Factotum
            </Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

const GRADE_COPY: Record<string, string> = {
  high: 'The document states this directly. Artificer is copying, not reasoning.',
  medium: 'Derived from what the document states — a calculation, a unit conversion, or a classification into one of the allowed options.',
  low: 'The document is ambiguous, states it only indirectly, or contradicts itself and one reading was chosen. These are flagged for you.',
  not_found: 'The document does not contain this. Nothing is guessed, and these are flagged for you.',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display border-b border-rule pb-2 text-lg font-semibold tracking-tight text-ink">
      {children}
    </h2>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

function StageCard({
  n,
  icon,
  tone,
  title,
  body,
  note,
}: {
  n: string;
  icon: React.ReactNode;
  tone: 'property' | 'tenant' | 'lease' | 'econ';
  title: string;
  body: string;
  note: string;
}) {
  const styles = {
    property: { chip: 'bg-property-soft text-property ring-property-ring', edge: 'bg-property', label: 'text-property' },
    tenant: { chip: 'bg-tenantc-soft text-tenantc ring-tenantc-ring', edge: 'bg-tenantc', label: 'text-tenantc' },
    lease: { chip: 'bg-leasec-soft text-leasec ring-leasec-ring', edge: 'bg-leasec', label: 'text-leasec' },
    econ: { chip: 'bg-econ-soft text-econ ring-econ-ring', edge: 'bg-econ', label: 'text-econ' },
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-lg border border-rule bg-panel p-5 shadow-card">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${styles.edge}`} />
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset ${styles.chip}`}>
          {icon}
        </span>
        <span className={`tnum font-mono text-2xs ${styles.label}`}>{n}</span>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">{body}</p>
      <p className="mt-2.5 border-t border-rule pt-2.5 text-2xs leading-relaxed text-ink-muted">{note}</p>
    </article>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-lg border border-rule bg-panel px-4 py-3.5">
      <span className="tnum display mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{body}</p>
      </div>
    </li>
  );
}

/** One capability the factotum can reach, in the two-column list above. */
function ToolLine({ icon, name, body }: { icon: React.ReactNode; name: string; body: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-ink">{name}</dt>
        <dd className="text-2xs leading-relaxed text-ink-muted">{body}</dd>
      </div>
    </div>
  );
}

/** One of the three things that can happen to a passage the assistant cites. */
function CitationPath({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'good' | 'warn' | 'bad';
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const styles = {
    good: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
    warn: 'bg-amber-50 text-amber-900 ring-amber-300',
    bad: 'bg-red-50 text-red-800 ring-red-300',
  }[tone];

  return (
    <article className="rounded-lg border border-rule bg-panel p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset ${styles}`}>
          {icon}
        </span>
        <h3 className="text-xs font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-2 text-2xs leading-relaxed text-ink-muted">{body}</p>
    </article>
  );
}

function Principle({ tone, title, body }: { tone: 'good' | 'bad'; title: string; body: string }) {
  const accent = tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <article className="relative overflow-hidden rounded-lg border border-rule bg-panel p-4">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <h3 className="pl-2 text-sm font-medium text-ink">{title}</h3>
      <p className="mt-1.5 pl-2 text-xs leading-relaxed text-ink-muted">{body}</p>
    </article>
  );
}
