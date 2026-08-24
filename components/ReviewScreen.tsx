'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, TriangleAlert, XCircle } from 'lucide-react';
import { DocumentPane } from './DocumentPane';
import { FieldRow } from './FieldRow';
import { ApprovalModal } from './ApprovalModal';
import { StatusPill } from './ConfidenceChip';
import { OmDraftPanel } from './OmDraftPanel';
import { PipelineStepper, type Stage } from './PipelineStepper';
import { ConfidenceMeter } from './ConfidenceMeter';
import { SECTION_STYLES } from './sections';
import { buildPayloads, payloadFieldCounts } from '@/lib/salesforce/mapping';
import { requireReviewerName } from '@/lib/reviewer';
import { completeStep } from '@/lib/walkthrough';
import { formatTimestamp } from '@/lib/format';
import {
  FIELD_SPECS_BY_PATH,
  SECTIONS,
  fieldsForSection,
  getField,
  summarise,
  withField,
  type ExtractedField,
  type NetLeaseExtraction,
} from '@/shared/schema';
import type { Deal, SalesforceWriteResult } from '@/shared/deal';

/**
 * The approval screen. Document on the left, extracted data on the right, and a
 * single decision at the bottom. Every value on this screen is a claim the AI is
 * making about the document sitting next to it; the whole layout exists so that
 * checking a claim costs one click.
 */
export function ReviewScreen({ deal, salesforceMode }: { deal: Deal; salesforceMode: 'mock' | 'real' }) {
  const router = useRouter();

  const [extraction, setExtraction] = useState<NetLeaseExtraction>(deal.extraction);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [written, setWritten] = useState<SalesforceWriteResult | null>(deal.salesforce ?? null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Walkthrough progress is driven by what the reviewer actually does, so the
  // signals live at the points where those things genuinely happen.
  useEffect(() => {
    completeStep('open-deal');
  }, []);

  const approved = deal.status === 'approved' || Boolean(written);
  const readOnly = approved;

  const summary = useMemo(() => summarise(extraction), [extraction]);
  const activeField = activePath ? getField(extraction, activePath) : undefined;

  const selectField = useCallback(
    (path: string) => {
      setActivePath(path);
      // Only counts when there is a citation to land on — that is the point.
      if (getField(extraction, path)?.sourceLocation) completeStep('check-citation');
    },
    [extraction],
  );

  const payloadCounts = useMemo(
    () => payloadFieldCounts(buildPayloads({ ...deal, extraction })),
    [deal, extraction],
  );

  const commitField = useCallback(
    async (path: string, value: unknown) => {
      setSavingPath(path);
      setEditError(null);
      const previous = getField(extraction, path);

      try {
        const res = await fetch(`/api/deals/${deal.id}/field`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, value, actor: requireReviewerName() }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          field?: ExtractedField<unknown>;
          error?: string;
        };

        if (!res.ok || !payload.field) {
          setEditError(payload.error ?? 'That edit could not be saved.');
          if (previous) setExtraction((current) => withField(current, path, previous));
          return;
        }
        setExtraction((current) => withField(current, path, payload.field!));
        completeStep('resolve-flag');
        router.refresh();
      } catch {
        setEditError('That edit could not be saved. Check your connection.');
      } finally {
        setSavingPath(null);
      }
    },
    [deal.id, extraction, router],
  );

  async function approve() {
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: requireReviewerName() }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        salesforce?: SalesforceWriteResult;
        error?: string;
      };
      if (!res.ok || !payload.salesforce) {
        setApproveError(payload.error ?? 'The write failed.');
        return;
      }
      setWritten(payload.salesforce);
      setModalOpen(false);
      completeStep('approve');
      router.refresh();
    } catch {
      setApproveError('The write could not be completed.');
    } finally {
      setApproving(false);
    }
  }

  async function reject() {
    setRejecting(true);
    setRejectError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: requireReviewerName(), reason: rejectReason }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setRejectError(payload.error ?? 'The rejection could not be recorded.');
        return;
      }
      setRejectOpen(false);
      router.refresh();
    } catch {
      setRejectError('The rejection could not be recorded.');
    } finally {
      setRejecting(false);
    }
  }

  return (
    /*
     * On a laptop this is a fixed-viewport workspace: the header block, two
     * independently scrolling panes, and the decision bar are all always on
     * screen, so a reviewer never loses the document while reading the data.
     * Below `lg` it collapses to ordinary page flow with stacked panes.
     */
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <div className="mx-auto w-full max-w-[100rem] shrink-0 px-5 pt-6 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={13} /> Deals
          </Link>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {(getField(extraction, 'tenant.tradeName')?.value as string) ?? 'Unidentified tenant'}
          </h1>
          <StatusPill status={deal.status} />
          <span className="text-2xs text-ink-faint">
            Extracted {formatTimestamp(deal.createdAt)} · Artificer ·{' '}
            <span className="tnum">
              {(deal.extractionMeta.inputTokens + deal.extractionMeta.outputTokens).toLocaleString()}
            </span>{' '}
            tokens
          </span>
        </div>

        <div className="mt-4">
          <PipelineStepper
            current={approved ? 'crm' : 'approve'}
            done={approved ? (['upload', 'review', 'approve', 'crm'] as Stage[]) : (['upload', 'review'] as Stage[])}
            recordHref={written?.mode === 'mock' ? `/records/${written.dealId}` : null}
          />
        </div>

        {deal.status === 'rejected' && deal.rejection ? (
          <Banner tone="danger" icon={<XCircle size={15} />}>
            Rejected by {deal.rejection.by} on {formatTimestamp(deal.rejection.at)} — “{deal.rejection.reason}”
          </Banner>
        ) : null}

        {written ? (
          <Banner tone="success" icon={<CheckCircle2 size={15} />}>
            <span>
              {written.updated ? 'Records updated' : 'Records written'} in {written.mode} Salesforce on{' '}
              {formatTimestamp(written.writtenAt)}.
            </span>
            {written.mode === 'mock' ? (
              <Link
                href={`/records/${written.dealId}`}
                className="focus-ring ml-2 inline-flex items-center gap-1 rounded font-medium text-accent underline underline-offset-2"
              >
                Open record view <ExternalLink size={12} />
              </Link>
            ) : written.instanceUrl ? (
              <a
                href={`${written.instanceUrl}/${written.dealId}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring ml-2 inline-flex items-center gap-1 rounded font-medium text-accent underline underline-offset-2"
              >
                Open in Salesforce <ExternalLink size={12} />
              </a>
            ) : null}
          </Banner>
        ) : null}

        {summary.needsAttention.length > 0 && !approved ? (
          <NeedsAttention paths={summary.needsAttention} activePath={activePath} onSelect={selectField} />
        ) : null}

        {editError ? (
          <Banner tone="danger" icon={<TriangleAlert size={15} />}>
            {editError}
          </Banner>
        ) : null}
      </div>

      <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 gap-5 px-5 pb-28 pt-5 sm:px-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[55fr_45fr] lg:gap-6 lg:overflow-hidden lg:pb-4">
        <div className="h-[28rem] lg:h-full lg:min-h-0">
          <DocumentPane
            paragraphs={deal.document.paragraphs}
            activeAnchor={activeField?.sourceLocation ?? null}
            activeQuote={activeField?.sourceQuote ?? null}
            fileName={deal.document.fileName}
            pageCount={deal.document.pageCount}
            hasSelection={Boolean(activePath)}
          />
        </div>

        <div className="scroll-pane min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
            <h2 className="text-xs font-semibold text-ink">Extracted data</h2>
            <span className="text-2xs text-ink-muted">
              {readOnly ? 'Approved — locked' : 'Click a field to see its source · click a value to edit'}
            </span>
          </div>

          {approved ? (
            <OmDraftPanel
              dealId={deal.id}
              existing={deal.omDraft ?? null}
              fileName={deal.document.fileName}
            />
          ) : null}

          {SECTIONS.map((section) => {
            const style = SECTION_STYLES[section.key];
            const SectionIcon = style.icon;
            const fields = fieldsForSection(section.key);
            const flagged = fields.filter((spec) => summary.needsAttention.includes(spec.path)).length;

            return (
            <section key={section.key} className="mb-6">
              <header className="mb-2 flex items-center gap-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${style.chip}`}>
                  <SectionIcon size={13} />
                </span>
                <h2 className={`text-2xs font-semibold uppercase tracking-wider ${style.label}`}>
                  {section.label}
                </h2>
                {flagged > 0 ? (
                  <span className="tnum rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-medium text-amber-900">
                    {flagged} to check
                  </span>
                ) : null}
                <span aria-hidden className="ml-1 h-px flex-1 bg-rule" />
              </header>
              <div className="space-y-0.5">
                {fields.map((spec) => (
                  <FieldRow
                    key={spec.path}
                    spec={spec}
                    field={getField(extraction, spec.path)!}
                    activeClassName={style.activeRow}
                    original={getField(deal.originalExtraction ?? deal.extraction, spec.path)}
                    active={activePath === spec.path}
                    saving={savingPath === spec.path}
                    readOnly={readOnly}
                    onSelect={() => selectField(spec.path)}
                    onCommit={(value) => void commitField(spec.path, value)}
                  />
                ))}
              </div>
            </section>
            );
          })}
        </div>
      </div>

      <FooterBar
        summary={summary}
        approved={approved}
        rejected={deal.status === 'rejected'}
        onApprove={() => {
          setApproveError(null);
          setModalOpen(true);
        }}
        onToggleReject={() => setRejectOpen((v) => !v)}
        rejectOpen={rejectOpen}
        rejectReason={rejectReason}
        onRejectReason={setRejectReason}
        rejecting={rejecting}
        rejectError={rejectError}
        onReject={() => void reject()}
        recordHref={written?.mode === 'mock' ? `/records/${written.dealId}` : null}
      />

      <ApprovalModal
        open={modalOpen}
        mode={salesforceMode}
        fieldCounts={payloadCounts}
        needsAttention={summary.needsAttention.length}
        isUpdate={Boolean(deal.salesforce)}
        submitting={approving}
        error={approveError}
        onCancel={() => setModalOpen(false)}
        onConfirm={() => void approve()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function NeedsAttention({
  paths,
  activePath,
  onSelect,
}: {
  paths: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <TriangleAlert size={14} className="text-amber-700" />
        <span className="text-xs font-medium text-amber-900">
          Needs attention — <span className="tnum">{paths.length}</span> field
          {paths.length === 1 ? '' : 's'} Artificer could not state confidently
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {paths.map((path) => (
          <button
            key={path}
            type="button"
            onClick={() => onSelect(path)}
            className={`focus-ring rounded-full border px-2.5 py-1 text-2xs transition-colors ${
              activePath === path
                ? 'border-amber-400 bg-white font-medium text-amber-900'
                : 'border-amber-200 bg-white/70 text-amber-800 hover:border-amber-400'
            }`}
          >
            {FIELD_SPECS_BY_PATH[path]?.label ?? path}
          </button>
        ))}
      </div>
    </div>
  );
}

function FooterBar({
  summary,
  approved,
  rejected,
  onApprove,
  onToggleReject,
  rejectOpen,
  rejectReason,
  onRejectReason,
  rejecting,
  rejectError,
  onReject,
  recordHref,
}: {
  summary: ReturnType<typeof summarise>;
  approved: boolean;
  rejected: boolean;
  onApprove: () => void;
  onToggleReject: () => void;
  rejectOpen: boolean;
  rejectReason: string;
  onRejectReason: (value: string) => void;
  rejecting: boolean;
  rejectError: string | null;
  onReject: () => void;
  recordHref: string | null;
}) {
  return (
    /* Sticky rather than fixed: it pins to the viewport while the page scrolls
       on narrow screens, and simply sits at the end of the flex column on a
       laptop, where the workspace itself no longer scrolls. */
    <div className="sticky bottom-0 z-40 shrink-0 border-t border-rule bg-paper/95 backdrop-blur">
      {rejectOpen && !approved ? (
        <div className="mx-auto w-full max-w-[100rem] px-5 pt-4 sm:px-8">
          <label htmlFor="reject-reason" className="text-xs font-medium text-ink">
            Why is this deal being rejected?
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => onRejectReason(e.target.value)}
              placeholder="e.g. Wrong document — this is the LOI, not the executed lease"
              className="focus-ring flex-1 rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink"
            />
            <button
              type="button"
              onClick={onReject}
              disabled={rejecting || rejectReason.trim().length < 3}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3.5 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              {rejecting ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirm rejection
            </button>
          </div>
          {rejectError ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {rejectError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-8 sm:py-3.5">
        <div className="flex-1">
          <ConfidenceMeter summary={summary} />
        </div>

        <div className="flex items-center gap-2 max-sm:w-full">
          {approved ? (
            <>
              <span className="text-xs text-ink-muted">Approved and written.</span>
              {recordHref ? (
                <Link
                  href={recordHref}
                  className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  View record <ExternalLink size={14} />
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleReject}
                className="focus-ring shrink-0 rounded-md border border-rule bg-white px-3.5 py-2.5 text-sm text-ink transition-colors hover:border-ink-faint"
              >
                {rejected ? 'Reject again' : 'Reject'}
              </button>
              <button
                type="button"
                onClick={onApprove}
                className="focus-ring inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:flex-none"
              >
                {/* The full label does not fit beside Reject on a phone. */}
                <span className="sm:hidden">Approve &amp; Write</span>
                <span className="hidden sm:inline">Approve &amp; Write to Salesforce</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'danger';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'success'
      ? 'border-accent-ring bg-accent-soft text-accent'
      : 'border-red-200 bg-red-50 text-red-800';
  return (
    <div className={`mt-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-xs ${styles}`}>
      <span className="shrink-0">{icon}</span>
      {children}
    </div>
  );
}
