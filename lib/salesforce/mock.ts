import crypto from 'node:crypto';
import { getStore } from '@/lib/store';
import type { Store } from '@/lib/store';
import type { SalesforceWriteResult } from '@/shared/deal';
import { SOBJECT_ORDER } from './mapping';
import type { SalesforceAdapter, SalesforceRecordSet, SObjectName, WriteRequest } from './types';

const recordKey = (id: string) => `salesforce/records/${id}.json`;
const hashKey = (hash: string) => `salesforce/by-hash/${hash}.json`;

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

    const ids = existing
      ? existing.ids
      : (Object.fromEntries(SOBJECT_ORDER.map((n) => [n, mockSalesforceId(n)])) as Record<SObjectName, string>);

    const set: SalesforceRecordSet = {
      id: ids.Deal__c,
      dealId: request.dealId,
      dealHash: request.dealHash,
      mode: 'mock',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      approvedBy: request.approvedBy,
      ids,
      records: {
        // Lookups are materialised here so the mock record view can show the
        // same relationship fields a real org would.
        Property__c: { ...request.payloads.Property__c, Id: ids.Property__c },
        Tenant__c: { ...request.payloads.Tenant__c, Id: ids.Tenant__c },
        Lease__c: {
          ...request.payloads.Lease__c,
          Id: ids.Lease__c,
          Property__c: ids.Property__c,
          Tenant__c: ids.Tenant__c,
        },
        Deal__c: {
          ...request.payloads.Deal__c,
          Id: ids.Deal__c,
          Property__c: ids.Property__c,
          Tenant__c: ids.Tenant__c,
          Lease__c: ids.Lease__c,
        },
      },
    };

    await this.store.write(recordKey(set.id), set);
    await this.store.write(hashKey(request.dealHash), { recordId: set.id });

    return {
      mode: 'mock',
      writtenAt: now,
      updated: Boolean(existing),
      propertyId: ids.Property__c,
      tenantId: ids.Tenant__c,
      leaseId: ids.Lease__c,
      dealId: ids.Deal__c,
    };
  }

  async getRecordSet(recordId: string): Promise<SalesforceRecordSet | null> {
    if (!/^[a-zA-Z0-9]+$/.test(recordId)) return null;
    return this.store.read<SalesforceRecordSet>(recordKey(recordId));
  }
}

const KEY_PREFIXES: Record<SObjectName, string> = {
  Property__c: 'a01',
  Tenant__c: 'a02',
  Lease__c: 'a03',
  Deal__c: 'a04',
};

/** Shaped like a real 18-character Salesforce id so the demo reads correctly. */
export function mockSalesforceId(object: SObjectName): string {
  const body = crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, '0');
  return `${KEY_PREFIXES[object]}${body}`.slice(0, 18).padEnd(18, '0');
}
