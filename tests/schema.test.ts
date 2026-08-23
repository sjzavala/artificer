import { describe, expect, it } from 'vitest';
import {
  FIELD_SPECS,
  FIELD_SPECS_BY_PATH,
  SECTIONS,
  allFields,
  emptyExtraction,
  fieldsForSection,
  getField,
  netLeaseExtractionSchema,
  summarise,
  withField,
} from '@/shared/schema';

/**
 * The schema is the contract three separate consumers rely on — the prompt, the
 * UI and the eval harness. These tests protect the invariants that keep those
 * three in step, so a field added in one place cannot silently go missing in
 * another.
 */

describe('field registry', () => {
  it('covers every field defined in the zod schema, and no more', () => {
    const zodPaths = new Set<string>();
    const shape = netLeaseExtractionSchema.shape;
    for (const section of Object.keys(shape) as Array<keyof typeof shape>) {
      for (const key of Object.keys(shape[section].shape)) zodPaths.add(`${section}.${key}`);
    }
    const specPaths = new Set(FIELD_SPECS.map((s) => s.path));

    expect([...specPaths].sort()).toEqual([...zodPaths].sort());
  });

  it('assigns every field to a declared section', () => {
    const sections = new Set(SECTIONS.map((s) => s.key));
    for (const spec of FIELD_SPECS) expect(sections.has(spec.section)).toBe(true);
  });

  it('accounts for every field in exactly one section grouping', () => {
    const grouped = SECTIONS.flatMap((s) => fieldsForSection(s.key));
    expect(grouped).toHaveLength(FIELD_SPECS.length);
    expect(new Set(grouped.map((s) => s.path)).size).toBe(FIELD_SPECS.length);
  });

  it('gives every field a description the prompt can use', () => {
    for (const spec of FIELD_SPECS) {
      expect(spec.description.length, `${spec.path} needs a description`).toBeGreaterThan(20);
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });

  it('declares allowed values for every enum field', () => {
    for (const spec of FIELD_SPECS) {
      if (spec.kind === 'enum') expect(spec.enumValues?.length ?? 0).toBeGreaterThan(1);
      else expect(spec.enumValues).toBeUndefined();
    }
  });

  it('indexes by path without collisions', () => {
    expect(Object.keys(FIELD_SPECS_BY_PATH)).toHaveLength(FIELD_SPECS.length);
  });
});

describe('empty extraction', () => {
  it('validates against the schema', () => {
    expect(netLeaseExtractionSchema.safeParse(emptyExtraction()).success).toBe(true);
  });

  it('starts with every field not_found and uncited', () => {
    for (const { field } of allFields(emptyExtraction())) {
      expect(field.value).toBeNull();
      expect(field.confidence).toBe('not_found');
      expect(field.sourceQuote).toBeNull();
      expect(field.edited).toBe(false);
    }
  });
});

describe('path helpers', () => {
  it('reads and writes a field by dotted path', () => {
    const updated = withField(emptyExtraction(), 'economics.capRate', {
      value: 6.75,
      confidence: 'high',
      sourceQuote: 'Cap Rate: 6.75%',
      sourceLocation: 'p-4',
      edited: false,
    });
    expect(getField(updated, 'economics.capRate')?.value).toBe(6.75);
  });

  it('does not mutate the extraction it was given', () => {
    const original = emptyExtraction();
    withField(original, 'economics.capRate', {
      value: 6.75, confidence: 'high', sourceQuote: null, sourceLocation: null, edited: false,
    });
    expect(getField(original, 'economics.capRate')?.value).toBeNull();
  });

  it('returns undefined for an unknown path rather than throwing', () => {
    expect(getField(emptyExtraction(), 'property.nonexistent')).toBeUndefined();
    expect(getField(emptyExtraction(), 'nonexistent.field')).toBeUndefined();
  });

  it('rejects a write to an unknown section', () => {
    expect(() =>
      withField(emptyExtraction(), 'nope.field', {
        value: 1, confidence: 'high', sourceQuote: null, sourceLocation: null, edited: false,
      }),
    ).toThrow();
  });
});

describe('summarise', () => {
  it('counts an empty extraction as entirely needing attention', () => {
    const summary = summarise(emptyExtraction());
    expect(summary.total).toBe(FIELD_SPECS.length);
    expect(summary.notFound).toBe(FIELD_SPECS.length);
    expect(summary.needsAttention).toHaveLength(FIELD_SPECS.length);
  });

  it('flags low confidence and missing fields, but not medium ones', () => {
    let extraction = emptyExtraction();
    extraction = withField(extraction, 'property.city', {
      value: 'Mount Vernon', confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: false,
    });
    extraction = withField(extraction, 'property.state', {
      value: 'OH', confidence: 'medium', sourceQuote: 'q', sourceLocation: 'p-1', edited: false,
    });
    extraction = withField(extraction, 'property.zip', {
      value: '43050', confidence: 'low', sourceQuote: 'q', sourceLocation: 'p-1', edited: true,
    });

    const summary = summarise(extraction);
    expect(summary.high).toBe(1);
    expect(summary.medium).toBe(1);
    expect(summary.low).toBe(1);
    expect(summary.edited).toBe(1);
    expect(summary.needsAttention).toContain('property.zip');
    expect(summary.needsAttention).not.toContain('property.state');
    expect(summary.needsAttention).not.toContain('property.city');
  });
});
