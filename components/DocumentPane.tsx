'use client';

import { useEffect, useMemo, useRef } from 'react';
import { findQuoteRange } from '@/lib/extraction/anchor';
import type { DocumentParagraph } from '@/shared/deal';

/**
 * The left pane: the document as extracted text, every paragraph individually
 * addressable. When a field is selected we scroll its cited paragraph to the
 * middle of the pane and highlight the exact quoted range inside it.
 *
 * The quote is located here, in the browser, using the same matching used
 * server-side — so a highlight can never drift out of step with the anchor.
 */
export function DocumentPane({
  paragraphs,
  activeAnchor,
  activeQuote,
  fileName,
  pageCount,
}: {
  paragraphs: DocumentParagraph[];
  activeAnchor: string | null;
  activeQuote: string | null;
  fileName: string;
  pageCount: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeAnchor) return;
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(activeAnchor)}"]`);
    if (!container || !target) return;

    // Measured with rects rather than offsetTop: the pane sits inside a sticky
    // wrapper, which becomes the offsetParent and would make offsetTop the
    // distance from the wrapper instead of from the scroll container.
    const delta = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    // Centring the passage rather than scrolling it to the top keeps the
    // surrounding sentences visible, which is how a reviewer verifies context.
    const top = container.scrollTop + delta - container.clientHeight / 2 + target.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    target.classList.remove('anchor-pulse');
    // Force a reflow so the animation restarts when the same anchor is re-clicked.
    void target.offsetWidth;
    target.classList.add('anchor-pulse');
  }, [activeAnchor, activeQuote]);

  const pageBreaks = useMemo(() => firstParagraphOfEachPage(paragraphs), [paragraphs]);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-rule bg-panel"
      aria-label="Source document"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h2 className="truncate text-xs font-medium text-ink" title={fileName}>
          {fileName}
        </h2>
        <span className="shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
          {pageCount} page{pageCount === 1 ? '' : 's'} · text extract
        </span>
      </header>

      <div ref={scrollRef} className="scroll-pane min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-[46rem]">
          {paragraphs.map((paragraph) => (
            <div key={paragraph.id}>
              {pageBreaks.has(paragraph.id) && paragraph.page > 1 ? <PageRule page={paragraph.page} /> : null}
              <p
                data-anchor={paragraph.id}
                id={`anchor-${paragraph.id}`}
                className={`scroll-mt-8 rounded px-1.5 py-1 text-[0.8125rem] leading-[1.65] transition-colors ${
                  activeAnchor === paragraph.id ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {activeAnchor === paragraph.id && activeQuote
                  ? renderWithHighlight(paragraph.text, activeQuote)
                  : paragraph.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function renderWithHighlight(text: string, quote: string) {
  const range = findQuoteRange(text, quote);
  if (!range) return text;

  return (
    <>
      {text.slice(0, range.start)}
      <mark className="provenance is-active">{text.slice(range.start, range.end)}</mark>
      {text.slice(range.end)}
    </>
  );
}

function PageRule({ page }: { page: number }) {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-rule" />
      <span className="text-2xs uppercase tracking-wider text-ink-faint">Page {page}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

function firstParagraphOfEachPage(paragraphs: DocumentParagraph[]): Set<string> {
  const seen = new Set<number>();
  const ids = new Set<string>();
  for (const paragraph of paragraphs) {
    if (!seen.has(paragraph.page)) {
      seen.add(paragraph.page);
      ids.add(paragraph.id);
    }
  }
  return ids;
}
