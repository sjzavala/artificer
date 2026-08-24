import crypto from 'node:crypto';
import { getStore } from '@/lib/store';
import type { Store } from '@/lib/store';
import type { SalesforceWriteResult } from '@/shared/deal';
import { SOBJECT_ORDER } from './mapping';
import type { SalesforceAdapter, SalesforceRecordSet, SObjectName, WriteRequest } from './types';

const recordKey = (id: string) => `salesforce/records/${id}.json`;
const hashKey = (hash: string) => `salesforce/by-hash/${hash}.json`;

/** The Opportunity is what a reviewer is sent to; the Property hangs off it. */
const PRIMARY: SObjectName = 'Opportunity';

/**
 * The default adapter. Persists through the storage seam, so a mock write in
 * production lands in Vercel Blob exactly as a local one lands in /data — and
 * /records/[id] has something convincing to render without a real org.
 */
export class MockSalesforceAdapter implements SalesforceAdapter {
  readonly mode = 'mock' as const;

  constructor(private readonly store: Store = getStore()) {}

  async write(request: WriteRequest): Promise<SalesforceWriteResult> {
    const now = new Date().toISOString();
    const existingId = await this.store.read<{ recordId: string }>(hashKey(request.dealHash));
    const existing = existingId ? await this.store.read<SalesforceRecordSet>(recordKey(existingId.recordId)) : null;

    const ids =
      existing?.ids ??
      (Object.fromEntries(SOBJECT_ORDER.map((name) => [name, mockSalesforceId(name)])) as Record<SObjectName, string>);

    const records = Object.fromEntries(
      SOBJECT_ORDER.map((name) => [name, { ...request.payloads[name], Id: ids[name] }]),
    ) as unknown as SalesforceRecordSet['records'];

    // The lookup is materialised so the record view shows the same relationship
    // a real org would hold.
    records.Opportunity.Property__c = ids.Property__c;

    const set: SalesforceRecordSet = {
      id: ids[PRIMARY],
      dealId: request.dealId,
      dealHash: request.dealHash,
      mode: 'mock',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      approvedBy: request.approvedBy,
      ids,
      records,
    };

    await this.store.write(recordKey(set.id), set);
    await this.store.write(hashKey(request.dealHash), { recordId: set.id });

    return {
      mode: 'mock',
      writtenAt: now,
      updated: Boolean(existing),
      ids,
      primaryId: ids[PRIMARY],
    };
  }

  async getRecordSet(recordId: string): Promise<SalesforceRecordSet | null> {
    if (!/^[a-zA-Z0-9]+$/.test(recordId)) return null;
    return this.store.read<SalesforceRecordSet>(recordKey(recordId));
  }
}

/** Salesforce key prefixes: 006 is the standard Opportunity prefix. */
const KEY_PREFIXES: Record<SObjectName, string> = {
  Property__c: 'a01',
  Opportunity: '006',
};

/** Shaped like a real 18-character Salesforce id so the demo reads correctly. */
export function mockSalesforceId(object: SObjectName): string {
  const body = crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, '0');
  return `${KEY_PREFIXES[object]}${body}`.slice(0, 18).padEnd(18, '0');
}
