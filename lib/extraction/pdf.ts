import type { DocumentParagraph } from '@/shared/deal';

/**
 * We deliberately do not render the PDF visually. The approval screen's core
 * interaction is "click a field, see the sentence it came from", and that is far
 * more reliable against extracted text with stable anchors than against a
 * canvas whose coordinates shift with every viewer version.
 */

export interface ParsedDocument {
  pageCount: number;
  charCount: number;
  paragraphs: DocumentParagraph[];
}

/** Paragraphs longer than this are split so a highlight stays readable. */
const MAX_PARAGRAPH_CHARS = 900;

/** A vertical gap this many times the page's typical line gap starts a paragraph. */
const PARAGRAPH_GAP_RATIO = 1.45;

/**
 * Loaded lazily and by its internal path. pdf-parse's package entry point runs a
 * debug branch that reads a bundled test PDF off disk, which fails the moment it
 * is packaged into a serverless bundle; the lib entry is the library itself.
 */
async function loadPdfParse() {
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  return (mod as unknown as { default?: PdfParseFn } & PdfParseFn).default ?? (mod as unknown as PdfParseFn);
}

type PdfParseFn = (
  buffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ numpages: number; text: string }>;

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const pdfParse = await loadPdfParse();
  const pages: string[] = [];

  const result = await pdfParse(buffer, {
    // Capture text page by page so every paragraph anchor carries a real page
    // number — "p. 7" in the UI has to mean page 7 of the source document.
    pagerender: async (pageData: {
      getTextContent: (opts: Record<string, boolean>) => Promise<{ items: Array<{ str: string; transform: number[] }> }>;
    }) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      const text = pageTextFromItems(content.items);
      pages.push(text);
      return text;
    },
  });

  const paragraphs = buildParagraphs(pages);
  return {
    pageCount: result.numpages || pages.length,
    charCount: paragraphs.reduce((n, p) => n + p.text.length, 0),
    paragraphs,
  };
}

interface TextItem {
  str: string;
  transform: number[];
}

interface TextLine {
  y: number;
  text: string;
}

/**
 * Turns positioned glyph runs into lines, and lines into paragraphs.
 *
 * A PDF has no notion of a paragraph — only text at coordinates — so the only
 * signal available is vertical spacing. Splitting on *any* line change would
 * make every line its own anchor; splitting on none would make a whole page one
 * anchor and render click-to-highlight useless. So we measure the document's own
 * typical line gap and treat anything noticeably larger as a paragraph break.
 */
export function pageTextFromItems(items: TextItem[]): string {
  const lines: TextLine[] = [];

  for (const item of items) {
    const y = item.transform[5];
    const previous = lines[lines.length - 1];
    // Sub-pixel drift within a line is common; treat near-equal y as the same line.
    if (previous && Math.abs(previous.y - y) < 0.5) previous.text += item.str;
    else lines.push({ y, text: item.str });
  }

  if (lines.length === 0) return '';

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) gaps.push(Math.abs(lines[i - 1].y - lines[i].y));

  // Median, not mean: a single large gap (a heading, a footer) must not drag
  // the baseline up and suppress every real paragraph break on the page.
  const sorted = [...gaps].sort((a, b) => a - b);
  const medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const paragraphGap = medianGap * PARAGRAPH_GAP_RATIO;

  let text = lines[0].text;
  for (let i = 1; i < lines.length; i += 1) {
    const gap = Math.abs(lines[i - 1].y - lines[i].y);
    text += paragraphGap > 0 && gap > paragraphGap ? `\n\n${lines[i].text}` : `\n${lines[i].text}`;
  }
  return text;
}

export function buildParagraphs(pages: string[]): DocumentParagraph[] {
  const paragraphs: DocumentParagraph[] = [];
  let counter = 0;

  pages.forEach((pageText, index) => {
    for (const block of splitIntoBlocks(pageText)) {
      for (const piece of splitLongBlock(block)) {
        counter += 1;
        paragraphs.push({ id: `p-${counter}`, page: index + 1, text: piece });
      }
    }
  });

  return paragraphs;
}

/**
 * Offering memos are laid out in short lines, so blank-line splitting alone
 * produces one paragraph per line. Consecutive non-empty lines are joined into
 * a block, which keeps a quoted sentence inside a single anchor.
 */
function splitIntoBlocks(pageText: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) blocks.push(joined);
    current = [];
  };

  for (const rawLine of pageText.split('\n')) {
    const line = rawLine.trim();
    if (!line) flush();
    else current.push(line);
  }
  flush();

  return blocks;
}

/** Splits an over-long block on sentence boundaries where possible. */
function splitLongBlock(block: string): string[] {
  if (block.length <= MAX_PARAGRAPH_CHARS) return [block];

  const sentences = block.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [block];
  const out: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > MAX_PARAGRAPH_CHARS) {
      out.push(buffer.trim());
      buffer = '';
    }
    buffer += sentence;
  }
  if (buffer.trim()) out.push(buffer.trim());

  return out;
}

/** Renders paragraphs for the model, tagged so it can cite an anchor directly. */
export function paragraphsToPrompt(paragraphs: DocumentParagraph[]): string {
  return paragraphs.map((p) => `[${p.id} | page ${p.page}] ${p.text}`).join('\n\n');
}
