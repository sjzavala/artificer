import { describe, expect, it } from 'vitest';
import {
  extractJsonObject,
  normaliseExtraction,
  parseExtractionResponse,
  stripCodeFences,
} from '@/lib/extraction/parse';
import { emptyExtraction, getField, withField, FIELD_SPECS } from '@/shared/schema';

/**
 * The parser is the boundary between a probabilistic model and a typed system.
 * Its job is to be forgiving about formatting and unforgiving about meaning, and
 * these tests hold it to exactly that line.
 */

function completeResponse(overrides: Record<string, unknown> = {}) {
  const body: Record<string, Record<string, unknown>> = {};
  for (const spec of FIELD_SPECS) {
    body[spec.section] ??= {};
    body[spec.section][spec.key] = {
      value: null,
      confidence: 'not_found',
      sourceQuote: null,
      sourceLocation: null,
      edited: false,
    };
  }
  return JSON.stringify({ ...body, ...overrides });
}

describe('stripCodeFences', () => {
  it('unwraps a fenced json block', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('unwraps an unlabelled fence', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves bare json untouched', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('extractJsonObject', () => {
  it('pulls the object out of surrounding prose', () => {
    expect(extractJsonObject('Here you go: {"a":1} — hope that helps')).toBe('{"a":1}');
  });

  it('balances nested objects', () => {
    expect(extractJsonObject('{"a":{"b":{"c":2}}}')).toBe('{"a":{"b":{"c":2}}}');
  });

  it('ignores braces inside string values', () => {
    const input = '{"quote":"the lease states {see exhibit B}"}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it('ignores braces inside escaped quotes', () => {
    const input = '{"quote":"he said \\"{a}\\" once"}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });

  it('returns null for an unterminated object', () => {
    expect(extractJsonObject('{"a":1')).toBeNull();
  });
});

describe('parseExtractionResponse', () => {
  it('accepts a well-formed response', () => {
    const result = parseExtractionResponse(completeResponse());
    expect(result.ok).toBe(true);
  });

  it('accepts a response wrapped in fences and prose', () => {
    const result = parseExtractionResponse('Certainly.\n```json\n' + completeResponse() + '\n```');
    expect(result.ok).toBe(true);
  });

  it('coerces model-formatted numbers rather than discarding a correct answer', () => {
    const result = parseExtractionResponse(
      completeResponse({
        economics: {
          askingPrice: { value: '$1,842,000', confidence: 'high', sourceQuote: 'Price: $1,842,000', sourceLocation: 'p-4', edited: false },
          annualBaseRent: { value: 124335, confidence: 'high', sourceQuote: 'NOI $124,335', sourceLocation: 'p-4', edited: false },
          capRate: { value: '6.75%', confidence: 'high', sourceQuote: 'Cap Rate: 6.75%', sourceLocation: 'p-4', edited: false },
          pricePerSf: { value: null, confidence: 'not_found', sourceQuote: null, sourceLocation: null, edited: false },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getField(result.data, 'economics.askingPrice')?.value).toBe(1842000);
    expect(getField(result.data, 'economics.capRate')?.value).toBe(6.75);
  });

  it('defaults the edited flag the model is told never to set', () => {
    const withoutEdited = JSON.parse(completeResponse());
    delete withoutEdited.property.city.edited;
    const result = parseExtractionResponse(JSON.stringify(withoutEdited));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getField(result.data, 'property.city')?.edited).toBe(false);
  });

  it('reports a schema failure with actionable paths for the retry prompt', () => {
    const broken = JSON.parse(completeResponse());
    delete broken.lease.leaseType;
    broken.property.propertyType.confidence = 'quite sure';

    const result = parseExtractionResponse(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('schema');
    expect(result.errors.join('\n')).toContain('lease.leaseType');
    expect(result.errors.join('\n')).toContain('property.propertyType.confidence');
  });

  it('rejects an enum value outside the allowed set', () => {
    const bad = JSON.parse(completeResponse());
    bad.lease.leaseType = { value: 'super net', confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: false };

    const result = parseExtractionResponse(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('lease.leaseType');
  });

  it('rejects a date that is not normalised', () => {
    const bad = JSON.parse(completeResponse());
    bad.lease.commencementDate = { value: 'October 1, 2019', confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: false };

    const result = parseExtractionResponse(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it('distinguishes an empty response from an unparseable one', () => {
    expect(parseExtractionResponse('   ')).toMatchObject({ ok: false, stage: 'empty' });
    expect(parseExtractionResponse('I could not read that document.')).toMatchObject({ ok: false, stage: 'no_json' });
    expect(parseExtractionResponse('{"property": }')).toMatchObject({ ok: false, stage: 'invalid_json' });
  });
});

describe('normaliseExtraction', () => {
  it('strips citations from a null value so nothing is orphaned', () => {
    const extraction = withField(emptyExtraction(), 'property.city', {
      value: null,
      confidence: 'high',
      sourceQuote: 'Mount Vernon, Ohio',
      sourceLocation: 'p-3',
      edited: false,
    });

    const field = getField(normaliseExtraction(extraction), 'property.city')!;
    expect(field.confidence).toBe('not_found');
    expect(field.sourceQuote).toBeNull();
    expect(field.sourceLocation).toBeNull();
  });

  it('downgrades a not_found grade on a real value instead of dropping the value', () => {
    const extraction = withField(emptyExtraction(), 'property.city', {
      value: 'Mount Vernon',
      confidence: 'not_found',
      sourceQuote: 'Mount Vernon, Ohio',
      sourceLocation: 'p-3',
      edited: false,
    });

    const field = getField(normaliseExtraction(extraction), 'property.city')!;
    expect(field.value).toBe('Mount Vernon');
    expect(field.confidence).toBe('low');
  });

  it('collapses whitespace in quotes so they match the document text', () => {
    const extraction = withField(emptyExtraction(), 'property.city', {
      value: 'Mount Vernon',
      confidence: 'high',
      sourceQuote: '  Mount   Vernon,\n  Ohio ',
      sourceLocation: 'p-3',
      edited: false,
    });

    expect(getField(normaliseExtraction(extraction), 'property.city')?.sourceQuote).toBe('Mount Vernon, Ohio');
  });
});
