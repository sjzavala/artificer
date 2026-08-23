'use client';

import { useState } from 'react';
import { Check, Copy, Download, Loader2, ScrollText, TriangleAlert } from 'lucide-react';
import { Markdown } from './Markdown';
import { requireReviewerName } from '@/lib/reviewer';
import { completeStep } from '@/lib/walkthrough';
import { formatTimestamp } from '@/lib/format';
import type { OmDraft } from '@/shared/deal';

/**
 * Generates a deal summary from the approved record. It appears only after
 * approval, which is deliberate: the draft is written from reviewed data, so
 * offering it earlier would invite someone to circulate unreviewed numbers.
 */
export function OmDraftPanel({
  dealId,
  existing,
  fileName,
}: {
  dealId: string;
  existing: OmDraft | null;
  fileName: string;
}) {
  const [draft, setDraft] = useState<OmDraft | null>(existing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/om-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dealId, actor: requireReviewerName() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { draft?: OmDraft; error?: string };
      if (!res.ok || !payload.draft) {
        setError(payload.error ?? 'The draft could not be generated.');
        return;
      }
      setDraft(payload.draft);
      completeStep('draft-om');
    } catch {
      setError('The draft could not be generated. Check your connection.');
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('The browser blocked clipboard access.');
    }
  }

  function download() {
    if (!draft) return;
    const blob = new Blob([draft.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace(/\.pdf$/i, '')} — OM summary (draft).md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mb-6 rounded-lg border border-rule bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="flex items-center gap-2">
          <ScrollText size={14} className="text-ink-faint" />
          <h2 className="text-xs font-medium text-ink">Offering memo summary</h2>
          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-px text-2xs font-medium uppercase tracking-wider text-amber-800">
            Draft
          </span>
        </div>

        <div className="flex items-center gap-2">
          {draft ? (
            <>
              <button
                type="button"
                onClick={copy}
                className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink-faint"
              >
                {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={download}
                className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink-faint"
              >
                <Download size={12} /> Markdown
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => void generate()}
            disabled={pending}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : null}
            {pending ? 'Drafting…' : draft ? 'Regenerate' : 'Draft OM Summary'}
          </button>
        </div>
      </header>

      <div className="px-4 py-4">
        {error ? (
          <p role="alert" className="mb-3 flex items-start gap-2 text-xs text-red-700">
            <TriangleAlert size={14} className="mt-px shrink-0" />
            {error}
          </p>
        ) : null}

        {draft ? (
          <>
            <Markdown source={draft.markdown} />
            <p className="mt-5 border-t border-rule pt-3 text-2xs leading-relaxed text-ink-faint">
              Draft generated {formatTimestamp(draft.generatedAt)} with {draft.model} from the approved
              record — not from the source document. Review before it goes to anyone outside the firm.
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-ink-muted">
            Generate a deal summary — investment highlights, property and tenant overviews, and an
            economics table — from the approved record. Nothing is drawn from the original document, so
            the draft reflects the values you signed off on.
          </p>
        )}
      </div>
    </section>
  );
}
