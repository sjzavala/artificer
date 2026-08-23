import crypto from 'node:crypto';
import { getStore } from './store';
import { FIELD_SPECS, getField, summarise } from '@/shared/schema';
import type { NetLeaseExtraction } from '@/shared/schema';
import type { Deal, DealSummary } from '@/shared/deal';

const dealKey = (id: string) => `deals/${id}.json`;

export async function getDeal(id: string): Promise<Deal | null> {
  if (!/^[a-z0-9_]+$/i.test(id)) return null;
  return getStore().read<Deal>(dealKey(id));
}

export async function putDeal(deal: Deal): Promise<void> {
  await getStore().write(dealKey(deal.id), { ...deal, updatedAt: new Date().toISOString() });
}

export async function listDeals(): Promise<Deal[]> {
  const store = getStore();
  const keys = await store.list('deals/');
  const deals = await Promise.all(keys.map((k) => store.read<Deal>(k)));
  return deals
    .filter((d): d is Deal => Boolean(d))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listDealSummaries(): Promise<DealSummary[]> {
  return (await listDeals()).map(toSummary);
}

export function toSummary(deal: Deal): DealSummary {
  const s = summarise(deal.extraction);
  const city = getField(deal.extraction, 'property.city')?.value as string | null;
  const state = getField(deal.extraction, 'property.state')?.value as string | null;
  const street = getField(deal.extraction, 'property.streetAddress')?.value as string | null;
  const addressLine = [street, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(' — ') || null;

  return {
    id: deal.id,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    status: deal.status,
    fileName: deal.document.fileName,
    tenantTradeName: (getField(deal.extraction, 'tenant.tradeName')?.value as string | null) ?? null,
    addressLine,
    askingPrice: (getField(deal.extraction, 'economics.askingPrice')?.value as number | null) ?? null,
    capRate: (getField(deal.extraction, 'economics.capRate')?.value as number | null) ?? null,
    needsAttention: s.needsAttention.length,
    highConfidence: s.high,
    totalFields: s.total,
    seeded: Boolean(deal.seeded),
  };
}

/**
 * Fingerprints the *business values* of an extraction — not the envelope, not
 * the document, not the confidence scores. Re-approving a deal whose values are
 * unchanged therefore lands on the same hash, which is what makes the
 * Salesforce write idempotent instead of duplicating a record set.
 */
export function computeDealHash(extraction: NetLeaseExtraction): string {
  const canonical = FIELD_SPECS.map((spec) => {
    const value = getField(extraction, spec.path)?.value ?? null;
    return `${spec.path}=${value === null ? '' : String(value).trim().toLowerCase()}`;
  }).join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}
