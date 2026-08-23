import { describe, expect, it } from 'vitest';
import { accuracy, compareField, normalise, tally, type Expectation } from '@/evals/compare';

/**
 * The eval harness is a measuring instrument, so its own comparison logic is
 * tested. An eval that scores generously is worse than no eval — it reports
 * confidence you have not earned.
 */

const outcome = (path: string, expected: Expectation, actual: unknown) =>
  compareField(path, expected, actual).outcome;

describe('exact and near matches', () => {
  it('accepts an identical string', () => {
    expect(outcome('property.city', 'Mount Vernon', 'Mount Vernon')).toBe('correct');
  });

  it('ignores case, punctuation and spacing differences', () => {
    expect(outcome('tenant.legalEntityName', 'Dolgencorp, LLC', 'dolgencorp llc')).toBe('correct');
    expect(outcome('lease.leaseType', 'absolute NNN', 'Absolute NNN')).toBe('correct');
  });

  it('rejects a genuinely different string', () => {
    expect(outcome('property.city', 'Mount Vernon', 'Columbus')).toBe('wrong');
  });

  it('does not let normalisation collapse distinct values', () => {
    expect(outcome('lease.leaseType', 'NN', 'NNN')).toBe('wrong');
  });
});

describe('numeric comparison', () => {
  it('accepts an exact number', () => {
    expect(outcome('economics.askingPrice', 1842000, 1842000)).toBe('correct');
  });

  it('accepts a formatted number string', () => {
    expect(outcome('economics.askingPrice', 1842000, '$1,842,000')).toBe('correct');
  });

  it('tolerates rounding within half a percent', () => {
    expect(outcome('economics.pricePerSf', 202.42, 202.4)).toBe('correct');
  });

  it('rejects a number outside tolerance', () => {
    expect(outcome('economics.capRate', 6.75, 6.5)).toBe('wrong');
  });

  it('handles an expected zero without dividing by it', () => {
    expect(outcome('property.yearBuilt', 0, 0)).toBe('correct');
    expect(outcome('property.yearBuilt', 0, 1)).toBe('wrong');
  });

  it('rejects a non-numeric answer for a numeric field', () => {
    expect(outcome('economics.capRate', 6.75, 'market rate')).toBe('wrong');
  });
});

describe('the hallucination metric', () => {
  it('flags a value where the document had none', () => {
    expect(outcome('tenant.creditRating', null, 'BBB (S&P)')).toBe('hallucinated');
  });

  it('counts a correct absence as correct', () => {
    expect(outcome('tenant.creditRating', null, null)).toBe('correct');
  });

  it('treats an empty string as an absence, not an invention', () => {
    expect(outcome('tenant.creditRating', null, '')).toBe('correct');
  });

  it('separates a miss from a hallucination', () => {
    expect(outcome('property.city', 'Tempe', null)).toBe('missed');
    expect(outcome('property.city', null, 'Tempe')).toBe('hallucinated');
  });
});

describe('alternative and partial expectations', () => {
  it('accepts any listed alternative', () => {
    const expected: Expectation = { any: [9100, 9026] };
    expect(outcome('property.buildingSf', expected, 9026)).toBe('correct');
    expect(outcome('property.buildingSf', expected, 9100)).toBe('correct');
    expect(outcome('property.buildingSf', expected, 8000)).toBe('wrong');
  });

  it('requires every substring for free text', () => {
    const expected: Expectation = { contains: ['10', 'option'] };
    expect(outcome('lease.rentEscalations', expected, '10% at each option period')).toBe('correct');
    expect(outcome('lease.rentEscalations', expected, '10% every five years')).toBe('wrong');
  });

  it('supports nesting contains inside any, for phrasings that both mean the same thing', () => {
    const expected: Expectation = {
      any: [{ contains: ['none'] }, { contains: ['no responsibilit'] }],
    };
    expect(outcome('lease.landlordResponsibilities', expected, 'None.')).toBe('correct');
    expect(outcome('lease.landlordResponsibilities', expected, 'The landlord has no responsibilities.')).toBe('correct');
    expect(outcome('lease.landlordResponsibilities', expected, 'Landlord maintains the roof.')).toBe('wrong');
  });
});

describe('normalise', () => {
  it('reduces formatting noise to a comparable form', () => {
    expect(normalise('  Dolgencorp,  LLC. ')).toBe('dolgencorp llc');
    expect(normalise('“Absolute NNN”')).toBe('absolute nnn');
  });
});

describe('tally and accuracy', () => {
  it('counts each outcome and computes accuracy', () => {
    const comparisons = [
      compareField('property.city', 'Tempe', 'Tempe'),
      compareField('property.state', 'AZ', 'TX'),
      compareField('property.zip', '85284', null),
      compareField('tenant.creditRating', null, 'AAA'),
    ];
    const totals = tally(comparisons);

    expect(totals).toEqual({ correct: 1, wrong: 1, missed: 1, hallucinated: 1, total: 4 });
    expect(accuracy(totals)).toBe(0.25);
  });

  it('reports zero accuracy for an empty run rather than dividing by zero', () => {
    expect(accuracy(tally([]))).toBe(0);
  });
});
