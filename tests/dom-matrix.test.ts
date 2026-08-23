import { describe, expect, it } from 'vitest';
import { Affine2D, installPdfGlobals } from '@/lib/extraction/dom-matrix';

/**
 * This polyfill exists so PDF parsing works on a linux deployment. If its maths
 * were wrong it would not crash — it would quietly shift text positions, which
 * would corrupt paragraph anchoring and therefore every source citation. So the
 * maths is pinned against hand-computed results.
 */

/**
 * Negating zero yields -0, which a browser's DOMMatrix produces too but which
 * `toEqual` treats as distinct from 0. Normalise it in the comparison rather
 * than paper over it in the implementation.
 */
const of = (m: Affine2D) => [m.a, m.b, m.c, m.d, m.e, m.f].map((n) => (Object.is(n, -0) ? 0 : n));

describe('Affine2D construction', () => {
  it('defaults to the identity matrix', () => {
    expect(of(new Affine2D())).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('accepts a six-element initialiser', () => {
    expect(of(new Affine2D([2, 3, 4, 5, 6, 7]))).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('takes the 2D components out of a 4x4 initialiser', () => {
    const m4 = [2, 3, 0, 0, 4, 5, 0, 0, 0, 0, 1, 0, 6, 7, 0, 1];
    expect(of(new Affine2D(m4))).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('copies another matrix without aliasing it', () => {
    const source = new Affine2D([2, 3, 4, 5, 6, 7]);
    const copy = new Affine2D(source);
    copy.translateSelf(10, 10);
    expect(of(source)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});

describe('Affine2D multiplication', () => {
  it('multiplySelf applies the argument on the right', () => {
    // translate(10, 20) then scale(2, 3) == matrix(2, 0, 0, 3, 10, 20)
    const m = new Affine2D([1, 0, 0, 1, 10, 20]).multiplySelf([2, 0, 0, 3, 0, 0]);
    expect(of(m)).toEqual([2, 0, 0, 3, 10, 20]);
  });

  it('preMultiplySelf applies the argument on the left', () => {
    const m = new Affine2D([1, 0, 0, 1, 10, 20]).preMultiplySelf([2, 0, 0, 3, 0, 0]);
    // Pre-multiplying by a scale also scales the existing translation.
    expect(of(m)).toEqual([2, 0, 0, 3, 20, 60]);
  });

  it('is not commutative, and the two forms differ', () => {
    const a = new Affine2D([1, 0, 0, 1, 10, 20]).multiplySelf([2, 0, 0, 3, 0, 0]);
    const b = new Affine2D([1, 0, 0, 1, 10, 20]).preMultiplySelf([2, 0, 0, 3, 0, 0]);
    expect(of(a)).not.toEqual(of(b));
  });

  it('composes a rotation-like matrix correctly', () => {
    // [0,1,-1,0] is a 90° rotation; applying it twice is a 180° rotation.
    const m = new Affine2D([0, 1, -1, 0, 0, 0]).multiplySelf([0, 1, -1, 0, 0, 0]);
    expect(of(m).map((n) => Math.round(n) || 0)).toEqual([-1, 0, 0, -1, 0, 0]);
  });
});

describe('Affine2D translate and scale', () => {
  it('translate returns a new matrix and leaves the original alone', () => {
    const original = new Affine2D();
    const moved = original.translate(5, 6);
    expect(of(original)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(of(moved)).toEqual([1, 0, 0, 1, 5, 6]);
  });

  it('translateSelf mutates in place', () => {
    const m = new Affine2D();
    expect(m.translateSelf(5, 6)).toBe(m);
    expect(of(m)).toEqual([1, 0, 0, 1, 5, 6]);
  });

  it('scale defaults sy to sx, as the DOM spec requires', () => {
    expect(of(new Affine2D().scale(3))).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it('supports the negative-y scale pdf.js uses to flip text', () => {
    expect(of(new Affine2D().scale(12, -12))).toEqual([12, 0, 0, -12, 0, 0]);
  });

  it('chains the way pdf.js chains it', () => {
    const m = new Affine2D([1, 0, 0, 1, 0, 0]).translate(10, 20).scale(2, -2);
    expect(of(m)).toEqual([2, 0, 0, -2, 10, 20]);
  });
});

describe('Affine2D inversion', () => {
  it('inverts a scale-and-translate matrix', () => {
    const m = new Affine2D([2, 0, 0, 4, 10, 20]).invertSelf();
    expect(of(m)).toEqual([0.5, 0, 0, 0.25, -5, -5]);
  });

  it('round-trips a point through a matrix and its inverse', () => {
    const m = new Affine2D([2, 1, -1, 3, 15, -7]);
    const inverse = new Affine2D(m).invertSelf();
    const point = { x: 37, y: -12 };
    const back = inverse.transformPoint(m.transformPoint(point));
    expect(back.x).toBeCloseTo(point.x, 10);
    expect(back.y).toBeCloseTo(point.y, 10);
  });

  it('yields NaN rather than throwing on a singular matrix', () => {
    const m = new Affine2D([0, 0, 0, 0, 5, 5]).invertSelf();
    expect(of(m).every(Number.isNaN)).toBe(true);
  });
});

describe('transformPoint', () => {
  it('applies the full affine transform', () => {
    const m = new Affine2D([2, 0, 0, 3, 10, 20]);
    expect(m.transformPoint({ x: 4, y: 5 })).toEqual({ x: 18, y: 35 });
  });
});

describe('installPdfGlobals', () => {
  it('installs DOMMatrix and Path2D when the runtime has neither', () => {
    const scope: Record<string, unknown> = {};
    installPdfGlobals(scope);
    expect(scope.DOMMatrix).toBe(Affine2D);
    expect(typeof scope.Path2D).toBe('function');
  });

  it('never displaces an implementation the runtime already provides', () => {
    const real = function RealDOMMatrix() {};
    const scope: Record<string, unknown> = { DOMMatrix: real };
    installPdfGlobals(scope);
    expect(scope.DOMMatrix).toBe(real);
  });

  it('is safe to run twice', () => {
    const scope: Record<string, unknown> = {};
    installPdfGlobals(scope);
    const first = scope.DOMMatrix;
    installPdfGlobals(scope);
    expect(scope.DOMMatrix).toBe(first);
  });
});
