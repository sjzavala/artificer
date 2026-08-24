import { describe, expect, it } from 'vitest';
import { findQuoteRange, normalise, resolveAnchor, resolveAnchors } from '@/lib/extraction/anchor';
import { buildParagraphs, pageTextFromItems, paragraphsToPrompt } from '@/lib/extraction/pdf';
import { emptyExtraction, getField, withField } from '@/shared/schema';
import type { DocumentParagraph } from '@/shared/deal';

/**
 * Provenance is the product claim: clicking a field shows the passage it came
 * from. These tests cover the two ways that claim can break — landing on the
 * wrong passage, and silently accepting a citation that is not in the document
 * at all.
 */

const PARAGRAPHS: DocumentParagraph[] = [
  { id: 'p-1', page: 1, text: 'OFFERING MEMORANDUM — 1487 Coshocton Avenue, Mount Vernon, Ohio 43050' },
  { id: 'p-2', page: 1, text: 'Price: $1,842,000 Cap Rate: 6.75% Net Operating Income: $124,335' },
  { id: 'p-3', page: 2, text: 'Lease Commencement: October 1, 2019. Lease Expiration: September 30, 2034.' },
  { id: 'p-4', page: 2, text: 'The tenant is responsible for all taxes, insurance, maintenance, roof and structure.' },
];

describe('normalise', () => {
  it('folds case, punctuation and whitespace into a comparable form', () => {
    expect(normalise('  Price:  $1,842,000  ').text).toBe('price 1 842 000');
  });

  it('folds typographic quotes and dashes to their ascii equivalents', () => {
    expect(normalise('“Absolute NNN” — yes').text).toBe(normalise('"Absolute NNN" - yes').text);
  });

  it('maps every normalised index back into the original string', () => {
    const source = 'Cap Rate:  6.75%';
    const { text, map } = normalise(source);
    expect(map).toHaveLength(text.length);
    for (const index of map) expect(index).toBeLessThan(source.length);
  });
});

describe('findQuoteRange', () => {
  it('locates an exact quote and returns the original-string offsets', () => {
    const text = PARAGRAPHS[1].text;
    const range = findQuoteRange(text, 'Cap Rate: 6.75%')!;
    expect(text.slice(range.start, range.end)).toBe('Cap Rate: 6.75%');
  });

  it('locates a quote whose case and spacing differ from the document', () => {
    const text = PARAGRAPHS[1].text;
    const range = findQuoteRange(text, 'price:   $1,842,000')!;
    expect(text.slice(range.start, range.end)).toBe('Price: $1,842,000');
  });

  it('includes a trailing symbol so a percentage is not visibly clipped', () => {
    const text = PARAGRAPHS[1].text;
    const range = findQuoteRange(text, 'Cap Rate: 6.75%')!;
    expect(text.slice(range.start, range.end)).toBe('Cap Rate: 6.75%');
  });

  it('is case-insensitive', () => {
    expect(findQuoteRange(PARAGRAPHS[0].text, 'mount vernon, ohio')).not.toBeNull();
  });

  it('falls back to the longest matching prefix when the quote runs past the passage', () => {
    const text = PARAGRAPHS[3].text;
    const range = findQuoteRange(text, 'The tenant is responsible for all taxes, insurance, maintenance and replacement costs')!;
    expect(text.slice(range.start, range.end)).toContain('The tenant is responsible for all taxes, insurance, maintenance');
  });

  it('refuses to match a short fragment that is not present', () => {
    expect(findQuoteRange(PARAGRAPHS[1].text, 'ground lease')).toBeNull();
  });

  it('returns null for an empty quote', () => {
    expect(findQuoteRange(PARAGRAPHS[1].text, '   ')).toBeNull();
  });
});

describe('resolveAnchor', () => {
  it('keeps the model anchor when it is right', () => {
    expect(resolveAnchor('Cap Rate: 6.75%', 'p-2', PARAGRAPHS)).toEqual({ anchorId: 'p-2', modelAnchorCorrect: true });
  });

  it('corrects a model anchor that points at the wrong passage', () => {
    expect(resolveAnchor('Cap Rate: 6.75%', 'p-4', PARAGRAPHS)).toEqual({ anchorId: 'p-2', modelAnchorCorrect: false });
  });

  it('finds the passage when the model gave no anchor at all', () => {
    expect(resolveAnchor('Lease Expiration: September 30, 2034', null, PARAGRAPHS).anchorId).toBe('p-3');
  });

  it('refuses to place a quote that is not in the document', () => {
    expect(resolveAnchor('Ground lease with 20 years remaining', 'p-2', PARAGRAPHS).anchorId).toBeNull();
  });
});

describe('resolveAnchors', () => {
  it('rewrites anchors and reports what it corrected', () => {
    let extraction = emptyExtraction();
    extraction = withField(extraction, 'economics.capRate', {
      value: 6.75, confidence: 'high', sourceQuote: 'Cap Rate: 6.75%', sourceLocation: 'p-4', edited: false, confirmed: false, alternatives: [],
    });
    extraction = withField(extraction, 'lease.expirationDate', {
      value: '2034-09-30', confidence: 'high', sourceQuote: 'Lease Expiration: September 30, 2034', sourceLocation: 'p-3', edited: false, confirmed: false, alternatives: [],
    });

    const stats = resolveAnchors(extraction, PARAGRAPHS);

    expect(stats).toEqual({ cited: 2, resolved: 2, corrected: 1, unresolvable: 0 });
    expect(getField(extraction, 'economics.capRate')?.sourceLocation).toBe('p-2');
  });

  it('downgrades a high-confidence field whose citation is not in the document', () => {
    const extraction = withField(emptyExtraction(), 'tenant.creditRating', {
      value: 'BBB (S&P)', confidence: 'high', sourceQuote: 'rated BBB by Standard & Poor', sourceLocation: 'p-2', edited: false, confirmed: false, alternatives: [],
    });

    const stats = resolveAnchors(extraction, PARAGRAPHS);
    const field = getField(extraction, 'tenant.creditRating')!;

    expect(stats.unresolvable).toBe(1);
    expect(field.sourceLocation).toBeNull();
    // The value survives for a human to judge; the confidence does not.
    expect(field.value).toBe('BBB (S&P)');
    expect(field.confidence).toBe('low');
  });

  it('ignores fields with no citation at all', () => {
    const stats = resolveAnchors(emptyExtraction(), PARAGRAPHS);
    expect(stats).toEqual({ cited: 0, resolved: 0, corrected: 0, unresolvable: 0 });
  });
});

describe('buildParagraphs', () => {
  const pages = [
    'OFFERING MEMORANDUM\n\nPrice: $1,842,000\nCap Rate: 6.75%',
    'LEASE ABSTRACT\n\nCommencement: October 1, 2019',
  ];

  it('assigns unique, sequential anchor ids across pages', () => {
    const paragraphs = buildParagraphs(pages);
    expect(new Set(paragraphs.map((p) => p.id)).size).toBe(paragraphs.length);
    expect(paragraphs[0].id).toBe('p-1');
  });

  it('records the page each paragraph came from, one-indexed', () => {
    const paragraphs = buildParagraphs(pages);
    expect(paragraphs.filter((p) => p.page === 1).length).toBeGreaterThan(0);
    expect(paragraphs.filter((p) => p.page === 2).length).toBeGreaterThan(0);
    expect(paragraphs.every((p) => p.page >= 1)).toBe(true);
  });

  it('joins consecutive lines so a quoted sentence stays inside one anchor', () => {
    const [, financials] = buildParagraphs(pages);
    expect(financials.text).toBe('Price: $1,842,000 Cap Rate: 6.75%');
  });

  it('drops blank blocks entirely', () => {
    expect(buildParagraphs(['\n\n   \n\n'])).toEqual([]);
  });

  it('splits an over-long block on sentence boundaries', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the lease terms.`).join(' ');
    const paragraphs = buildParagraphs([long]);
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs.every((p) => p.text.length <= 1000)).toBe(true);
  });
});

describe('paragraphsToPrompt', () => {
  it('tags every paragraph with the anchor id the model must cite', () => {
    const rendered = paragraphsToPrompt(PARAGRAPHS);
    expect(rendered).toContain('[p-1 | page 1]');
    expect(rendered).toContain('[p-3 | page 2]');
  });
});

describe('pageTextFromItems', () => {
  /** pdf.js reports positions bottom-up, so a later line has a *smaller* y. */
  const line = (str: string, y: number) => ({ str, transform: [1, 0, 0, 1, 54, y] });

  it('joins glyph runs that share a baseline into one line', () => {
    const text = pageTextFromItems([line('Cap Rate: ', 700), line('6.75%', 700)]);
    expect(text).toBe('Cap Rate: 6.75%');
  });

  it('tolerates sub-pixel baseline drift within a line', () => {
    const text = pageTextFromItems([line('Price: ', 700), line('$1,842,000', 699.8)]);
    expect(text).toBe('Price: $1,842,000');
  });

  it('separates normally spaced lines with a single newline', () => {
    const text = pageTextFromItems([line('Line one', 700), line('Line two', 686), line('Line three', 672)]);
    expect(text).toBe('Line one\nLine two\nLine three');
  });

  it('starts a new paragraph where the vertical gap exceeds the typical one', () => {
    const text = pageTextFromItems([
      line('Body line one', 700),
      line('Body line two', 686),
      line('Body line three', 672),
      line('NEXT SECTION', 620), // a much larger gap
      line('Body of next section', 606),
    ]);
    expect(text).toBe('Body line one\nBody line two\nBody line three\n\nNEXT SECTION\nBody of next section');
  });

  it('uses the median gap so one outlier cannot suppress every break', () => {
    const items = [
      line('a', 700), line('b', 686), line('c', 672),
      line('HEADING', 500), // a huge outlier gap
      line('d', 486), line('e', 472),
      line('NEXT', 420),   // a real, more modest paragraph break
    ];
    const text = pageTextFromItems(items);
    expect(text.split('\n\n')).toHaveLength(3);
  });

  it('produces paragraphs that buildParagraphs turns into separate anchors', () => {
    const text = pageTextFromItems([
      line('Summary figures follow', 700),
      line('Price: $1,842,000', 686),
      line('LEASE ABSTRACT', 600),
      line('Commencement: October 1, 2019', 586),
    ]);
    const paragraphs = buildParagraphs([text]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe('Summary figures follow Price: $1,842,000');
    expect(paragraphs[1].text).toBe('LEASE ABSTRACT Commencement: October 1, 2019');
  });

  it('returns an empty string for a page with no text items', () => {
    expect(pageTextFromItems([])).toBe('');
  });

  it('handles a single-line page without inventing a break', () => {
    expect(pageTextFromItems([line('Only line', 700)])).toBe('Only line');
  });
});

describe('alternatives — the competing value a document also states', () => {
  const withAlternative = () => {
    const extraction = withField(emptyExtraction(), 'property.buildingSf', {
      value: 9100,
      confidence: 'low',
      sourceQuote: 'Price: $1,842,000',
      sourceLocation: 'p-2',
      edited: false,
      confirmed: false,
      alternatives: [
        {
          value: 9026,
          sourceQuote: 'The tenant is responsible for all taxes',
          sourceLocation: null,
          note: 'stated later',
        },
      ],
    });
    return extraction;
  };

  it('resolves an alternative to its own anchor, separate from the chosen value', () => {
    const extraction = withAlternative();
    resolveAnchors(extraction, PARAGRAPHS);

    const field = getField(extraction, 'property.buildingSf')!;
    expect(field.sourceLocation).toBe('p-2');
    // The whole point: the competing figure carries its own citation, so
    // adopting it does not inherit a passage that supports the other number.
    expect(field.alternatives[0].sourceLocation).toBe('p-4');
  });

  it('counts an alternative citation in the resolution stats', () => {
    const stats = resolveAnchors(withAlternative(), PARAGRAPHS);
    expect(stats.cited).toBe(2);
    expect(stats.resolved).toBe(2);
  });

  it('discards an alternative whose quote is not in the document', () => {
    const extraction = withField(emptyExtraction(), 'property.buildingSf', {
      value: 9100,
      confidence: 'low',
      sourceQuote: 'Price: $1,842,000',
      sourceLocation: 'p-2',
      edited: false,
      confirmed: false,
      alternatives: [
        { value: 9026, sourceQuote: 'a passage that does not appear anywhere', sourceLocation: 'p-3', note: null },
      ],
    });

    resolveAnchors(extraction, PARAGRAPHS);
    // Offering a reviewer a value to adopt on the strength of an invented quote
    // would be worse than offering nothing at all.
    expect(getField(extraction, 'property.buildingSf')!.alternatives).toHaveLength(0);
  });

  it('discards an alternative with no value to adopt', () => {
    const extraction = withField(emptyExtraction(), 'property.buildingSf', {
      value: 9100,
      confidence: 'low',
      sourceQuote: 'Price: $1,842,000',
      sourceLocation: 'p-2',
      edited: false,
      confirmed: false,
      alternatives: [{ value: null, sourceQuote: 'Cap Rate: 6.75%', sourceLocation: 'p-2', note: null }],
    });

    resolveAnchors(extraction, PARAGRAPHS);
    expect(getField(extraction, 'property.buildingSf')!.alternatives).toHaveLength(0);
  });
});
