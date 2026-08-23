/**
 * A minimal 2D DOMMatrix, installed before pdf.js loads.
 *
 * Why this exists: pdf.js constructs a `new DOMMatrix()` at module scope in
 * Node, and satisfies it from `@napi-rs/canvas` — an *optional* dependency
 * whose platform-specific binary npm resolves for the machine that ran the
 * install. A lockfile written on macOS therefore carries only the darwin build,
 * and the package cannot load on a linux deployment: pdf.js warns, DOMMatrix
 * stays undefined, and every upload fails with "DOMMatrix is not defined" —
 * while parsing the identical bytes locally works perfectly.
 *
 * Artificer only ever extracts text; it never rasterises a page. Shipping a
 * 40 MB native canvas library to satisfy one constructor would be the wrong
 * trade, so we provide the matrix ourselves. pdf.js assigns its own polyfill
 * only when `globalThis.DOMMatrix` is absent, so installing this first wins.
 *
 * The maths is real rather than stubbed: a silently wrong matrix would corrupt
 * text positions instead of failing loudly, and text positions are what the
 * whole provenance feature is built on.
 */

type MatrixInit = number[] | { a: number; b: number; c: number; d: number; e: number; f: number } | undefined;

/**
 * Column-major 2D affine transform, matching the DOM's a–f convention:
 *
 *   | a  c  e |
 *   | b  d  f |
 *   | 0  0  1 |
 */
export class Affine2D {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  readonly is2D = true;

  constructor(init?: MatrixInit) {
    if (!init) return;

    if (Array.isArray(init)) {
      if (init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else if (init.length === 16) {
        // A 4x4 initialiser; take the 2D components and ignore the rest.
        this.a = init[0]; this.b = init[1];
        this.c = init[4]; this.d = init[5];
        this.e = init[12]; this.f = init[13];
      }
      return;
    }

    this.a = init.a; this.b = init.b; this.c = init.c;
    this.d = init.d; this.e = init.e; this.f = init.f;
  }

  private static of(a: number, b: number, c: number, d: number, e: number, f: number): Affine2D {
    return new Affine2D([a, b, c, d, e, f]);
  }

  /** this = this × other */
  multiplySelf(other: MatrixInit): this {
    const m = new Affine2D(other);
    const { a, b, c, d, e, f } = this;
    this.a = a * m.a + c * m.b;
    this.b = b * m.a + d * m.b;
    this.c = a * m.c + c * m.d;
    this.d = b * m.c + d * m.d;
    this.e = a * m.e + c * m.f + e;
    this.f = b * m.e + d * m.f + f;
    return this;
  }

  /** this = other × this */
  preMultiplySelf(other: MatrixInit): this {
    const m = new Affine2D(other);
    const { a, b, c, d, e, f } = this;
    this.a = m.a * a + m.c * b;
    this.b = m.b * a + m.d * b;
    this.c = m.a * c + m.c * d;
    this.d = m.b * c + m.d * d;
    this.e = m.a * e + m.c * f + m.e;
    this.f = m.b * e + m.d * f + m.f;
    return this;
  }

  /** Returns a new matrix, per the DOM spec — `translateSelf` is the mutating form. */
  translate(tx = 0, ty = 0): Affine2D {
    return new Affine2D(this).multiplySelf([1, 0, 0, 1, tx, ty]);
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf([1, 0, 0, 1, tx, ty]);
  }

  /** Returns a new matrix. `sy` defaults to `sx`, as the DOM spec requires. */
  scale(sx = 1, sy?: number): Affine2D {
    return new Affine2D(this).multiplySelf([sx, 0, 0, sy ?? sx, 0, 0]);
  }

  scaleSelf(sx = 1, sy?: number): this {
    return this.multiplySelf([sx, 0, 0, sy ?? sx, 0, 0]);
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;

    if (!det || !Number.isFinite(det)) {
      // The spec makes a non-invertible matrix all-NaN rather than throwing.
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }

    const { a, b, c, d, e, f } = this;
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = (c * f - d * e) / det;
    this.f = (b * e - a * f) / det;
    return this;
  }

  transformPoint(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.a * point.x + this.c * point.y + this.e,
      y: this.b * point.x + this.d * point.y + this.f,
    };
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/**
 * Render-only stub. pdf.js warns when Path2D is missing but never needs it for
 * text extraction; supplying an inert one keeps that warning out of the logs on
 * every cold start. Nothing in Artificer's code path constructs or reads it.
 */
class InertPath2D {
  addPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  rect(): void {}
}

/** Idempotent: never replaces a real implementation the runtime already provides. */
export function installPdfGlobals(scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): void {
  if (!scope.DOMMatrix) scope.DOMMatrix = Affine2D;
  if (!scope.Path2D) scope.Path2D = InertPath2D;
}
