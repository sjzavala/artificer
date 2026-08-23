import { FIELD_SPECS_BY_PATH, type FieldSpec } from '@/shared/schema';

/**
 * Field-level comparison against ground truth.
 *
 * Kept as a pure module so the matching rules are unit-testable. An eval whose
 * own comparison logic is untested measures nothing you can trust.
 */

/** A ground-truth entry: a literal, one of several acceptable values, a set of
 *  required substrings for free text, or null meaning "must not be found". */
export type Expectation =
  | string
  | number
  | null
  | { any: Expectation[] }
  | { contains: string[] };

export type Outcome =
  | 'correct'
  | 'wrong'
  | 'missed'        // ground truth has a value, extraction returned nothing
  | 'hallucinated'; // ground truth is null, extraction invented a value

export interface FieldComparison {
  path: string;
  expected: Expectation;
  actual: unknown;
  outcome: Outcome;
}

/** Numbers rarely round identically; 0.5% absorbs that without hiding errors. */
const NUMERIC_TOLERANCE = 0.005;

export function compareField(path: string, expected: Expectation, actual: unknown): FieldComparison {
  const spec = FIELD_SPECS_BY_PATH[path];
  const present = actual !== null && actual !== undefined && actual !== '';

  if (expected === null) {
    // The single metric that matters most: a value where the document has none.
    return { path, expected, actual, outcome: present ? 'hallucinated' : 'correct' };
  }
  if (!present) {
    return { path, expected, actual, outcome: 'missed' };
  }

  return { path, expected, actual, outcome: matches(expected, actual, spec) ? 'correct' : 'wrong' };
}

function matches(expected: Expectation, actual: unknown, spec: FieldSpec | undefined): boolean {
  if (expected === null) return false;

  if (typeof expected === 'object' && 'any' in expected) {
    return expected.any.some((option) => matches(option, actual, spec));
  }

  if (typeof expected === 'object' && 'contains' in expected) {
    const haystack = normalise(String(actual));
    return expected.contains.every((needle) => haystack.includes(normalise(needle)));
  }

  if (typeof expected === 'number') {
    const value = typeof actual === 'number' ? actual : Number(String(actual).replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(value)) return false;
    if (expected === 0) return value === 0;
    return Math.abs(value - expected) / Math.abs(expected) <= NUMERIC_TOLERANCE;
  }

  return normalise(String(actual)) === normalise(expected);
}

/** Case, punctuation and spacing are formatting, not correctness. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface Totals {
  correct: number;
  wrong: number;
  missed: number;
  hallucinated: number;
  total: number;
}

export function tally(comparisons: FieldComparison[]): Totals {
  const totals: Totals = { correct: 0, wrong: 0, missed: 0, hallucinated: 0, total: comparisons.length };
  for (const c of comparisons) totals[c.outcome] += 1;
  return totals;
}

export function accuracy(totals: Totals): number {
  return totals.total === 0 ? 0 : totals.correct / totals.total;
}
