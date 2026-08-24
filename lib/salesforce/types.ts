import type { SalesforceMode, SalesforceWriteResult } from '@/shared/deal';

/**
 * The objects Artificer writes.
 *
 * These are not invented: they mirror the schema observed behind nnnpro.com,
 * whose public API serves `sf-opportunities` records with a nested `sf_property`
 * and a `salesforce_id` on each — i.e. a Salesforce replica. An Opportunity is
 * the listing; Property__c is the asset it sits on.
 */
export type SObjectName = 'Property__c' | 'Opportunity';

export type RecordPayload = Record<string, string | number | boolean | null>;

/** The related payloads produced from one approved extraction. */
export type DealPayloads = Record<SObjectName, RecordPayload>;

/** A persisted record set — what the mock CRM record view renders. */
export interface SalesforceRecordSet {
  /** The Opportunity id; also the /records/[id] route parameter. */
  id: string;
  dealId: string;
  dealHash: string;
  mode: SalesforceMode;
  createdAt: string;
  updatedAt: string;
  approvedBy: string;
  ids: Record<SObjectName, string>;
  records: Record<SObjectName, RecordPayload>;
}

export interface WriteRequest {
  dealId: string;
  dealHash: string;
  approvedBy: string;
  payloads: DealPayloads;
}

/**
 * The Salesforce seam. Callers hand over an approved deal and get back record
 * ids; whether that hit a mock store or a real org is not their concern.
 */
export interface SalesforceAdapter {
  readonly mode: SalesforceMode;
  /** Creates the record set, or updates it when `dealHash` already exists. */
  write(request: WriteRequest): Promise<SalesforceWriteResult>;
  /** Mock mode returns the stored set; real mode returns null (link out instead). */
  getRecordSet(recordId: string): Promise<SalesforceRecordSet | null>;
}
