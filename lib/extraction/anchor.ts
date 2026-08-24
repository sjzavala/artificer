import { allFields } from '@/shared/schema';
import type { NetLeaseExtraction } from '@/shared/schema';
import type { DocumentParagraph } from '@/shared/deal';

/**
 * Provenance resolution.
 *
 * Clicking a field must always land on the right passage — that single moment
 * is what makes the tool trustworthy. Rather than believing the anchor the model
 * reports, we locate the quote in the document ourselves and correct the anchor
 * to match. The model's anchor is treated as a hint, not as truth.
 *
 * This module is deliberately dependency-free so the browser can run the same
 * matching logic when it highlights a range inside a paragraph.
 */

interface NormalisedText {
  /** Lowercased, punctuation-stripped, whitespace-collapsed. */
  text: string;
  /** normalised index -> index in the original string. */
  map: number[];
}

const PUNCTUATION_FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', ' ': ' ',
};

export function normalise(input: string): NormalisedText {
  let text = '';
  const map: number[] = [];
  let lastWasSpace = true; // suppresses a leading space

  for (let i = 0; i < input.length; i += 1) {
    const folded = (PUNCTUATION_FOLD[input[i]] ?? input[i]).toLowerCase();
    const isAlnum = /[a-z0-9]/.test(folded);

    if (isAlnum) {
      text += folded;
      map.push(i);
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      // Every non-alphanumeric run collapses to one space, so "$1,250,000."
      // and "1 250 000" compare the same way a reader would read them.
      text += ' ';
      map.push(i);
      lastWasSpace = true;
    }
  }

  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export interface QuoteRange {
  start: number;
  end: number;
}

/** Locates `quote` inside `haystack`, tolerant of punctuation and whitespace. */
export function findQuoteRange(haystack: string, quote: string): QuoteRange | null {
  if (!quote?.trim()) return null;

  const hay = normalise(haystack);
  const needle = normalise(quote);
  if (!needle.text) return null;

  let at = hay.text.indexOf(needle.text);

  // A quote that spans a page break or drops a stray word still deserves a
  // highlight, so fall back to the longest leading fragment that does match.
  if (at === -1) {
    const fragment = longestMatchingPrefix(hay.text, needle.text);
    if (!fragment) return null;
    at = hay.text.indexOf(fragment);
    if (at === -1) return null;
    return {
      start: hay.map[at],
      end: (hay.map[at + fragment.length - 1] ?? hay.map[hay.map.length - 1]) + 1,
    };
  }

  return {
    start: hay.map[at],
    end: extendOverTrailingSymbols(
      haystack,
      (hay.map[at + needle.text.length - 1] ?? hay.map[hay.map.length - 1]) + 1,
    ),
  };
}

/**
 * Normalisation drops trailing symbols, so a match on "cap rate 6 75" would end
 * just before the "%" and highlight "Cap Rate: 6.75" — visibly clipped. These
 * are pulled back in so the highlight reads as a whole figure.
 */
function extendOverTrailingSymbols(haystack: string, end: number): number {
  let cursor = end;
  while (cursor < haystack.length && /[%)\]}"'\u2019\u201d]/.test(haystack[cursor])) cursor += 1;
  return cursor;
}

/** Shrinks the needle word by word from the end until it is found, or gives up. */
function longestMatchingPrefix(hay: string, needle: string): string | null {
  const words = needle.split(' ');
  const MIN_WORDS = 4;
  for (let count = words.length - 1; count >= MIN_WORDS; count -= 1) {
    const candidate = words.slice(0, count).join(' ');
    if (hay.includes(candidate)) return candidate;
  }
  return null;
}

export interface AnchorResolution {
  anchorId: string | null;
  /** True when the model's own sourceLocation already pointed at the right place. */
  modelAnchorCorrect: boolean;
}

export function resolveAnchor(
  quote: string | null,
  reportedLocation: string | null,
  paragraphs: DocumentParagraph[],
): AnchorResolution {
  if (!quote?.trim()) return { anchorId: null, modelAnchorCorrect: false };

  const reported = reportedLocation ? paragraphs.find((p) => p.id === reportedLocation) : undefined;
  if (reported && findQuoteRange(reported.text, quote)) {
    return { anchorId: reported.id, modelAnchorCorrect: true };
  }

  for (const paragraph of paragraphs) {
    if (findQuoteRange(paragraph.text, quote)) {
      return { anchorId: paragraph.id, modelAnchorCorrect: false };
    }
  }

  // The quote is not in the document at all — a fabricated citation. Keeping the
  // model's anchor would be worse than admitting we cannot place it.
  return { anchorId: null, modelAnchorCorrect: false };
}

export interface AnchorStats {
  cited: number;
  resolved: number;
  corrected: number;
  unresolvable: number;
}

/**
 * Rewrites every sourceLocation to a verified anchor id. A quote that cannot be
 * found anywhere in the document loses its location and is downgraded to "low",
 * because an unverifiable citation is exactly the case a reviewer must see.
 */
export function resolveAnchors(
  extraction: NetLeaseExtraction,
  paragraphs: DocumentParagraph[],
): AnchorStats {
  const stats: AnchorStats = { cited: 0, resolved: 0, corrected: 0, unresolvable: 0 };

  for (const { field } of allFields(extraction)) {
    // An alternative is a citation like any other, and an unverifiable one is
    // worse here than useless: it would offer a reviewer a value to adopt that
    // the document never stated.
    field.alternatives = (field.alternatives ?? []).filter((alternative) => {
      if (alternative.value === null || alternative.value === undefined) return false;
      if (!alternative.sourceQuote) return false;

      stats.cited += 1;
      const resolved = resolveAnchor(alternative.sourceQuote, alternative.sourceLocation, paragraphs);
      if (!resolved.anchorId) {
        stats.unresolvable += 1;
        return false;
      }
      stats.resolved += 1;
      if (!resolved.modelAnchorCorrect) stats.corrected += 1;
      alternative.sourceLocation = resolved.anchorId;
      return true;
    });

    if (!field.sourceQuote) continue;
    stats.cited += 1;

    const { anchorId, modelAnchorCorrect } = resolveAnchor(field.sourceQuote, field.sourceLocation, paragraphs);

    if (anchorId) {
      stats.resolved += 1;
      if (!modelAnchorCorrect) stats.corrected += 1;
      field.sourceLocation = anchorId;
    } else {
      stats.unresolvable += 1;
      field.sourceLocation = null;
      if (field.confidence === 'high') field.confidence = 'low';
    }
  }

  return stats;
}
