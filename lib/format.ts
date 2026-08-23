import type { FieldSpec, FieldUnit } from '@/shared/schema';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-US');
const twoDp = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDp = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Display formatting for a field value. Editing always shows the raw value. */
export function formatValue(value: unknown, spec: Pick<FieldSpec, 'kind' | 'unit'>): string {
  if (value === null || value === undefined || value === '') return '—';
  if (spec.kind === 'number' && typeof value === 'number') return formatNumber(value, spec.unit);
  if (spec.kind === 'date' && typeof value === 'string') return formatDate(value);
  return String(value);
}

export function formatNumber(value: number, unit?: FieldUnit): string {
  switch (unit) {
    case 'usd':
      return usd.format(value);
    case 'usd_per_sf':
      return `${usdCents.format(value)} / SF`;
    case 'sf':
      return `${plain.format(value)} SF`;
    case 'acres':
      return `${twoDp.format(value)} acres`;
    case 'percent':
      return `${twoDp.format(value)}%`;
    case 'years':
      return `${oneDp.format(value)} yrs`;
    case 'year':
      return String(Math.round(value));
    default:
      return plain.format(value);
  }
}

export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : usd.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${twoDp.format(value)}%`;
}

/** Parses a date string as calendar-local so a lease date never slips a day. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatRelative(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(new Date(then).toISOString().slice(0, 10));
}

/**
 * Turns typed text back into a schema value. Kept permissive on purpose — a
 * reviewer typing "$1,250,000" into a currency field means 1250000, and making
 * them delete the formatting would be the tool getting in the way.
 */
export function parseInputValue(raw: string, spec: Pick<FieldSpec, 'kind'>): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (spec.kind !== 'number') return trimmed;

  const cleaned = trimmed.replace(/[$,%\s]/g, '').replace(/(sf|acres?|yrs?|years?)/gi, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : trimmed;
}

/** The raw string shown when a field enters edit mode. */
export function toInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}
