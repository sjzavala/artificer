import type { SalesforceMode, SalesforceWriteResult } from '@/shared/deal';

export type SObjectName = 'Property__c' | 'Tenant__c' | 'Lease__c' | 'Deal__c';

export type RecordPayload = Record<string, string | number | boolean | null>;

/** The four related payloads produced from one approved extraction. */
export interface DealPayloads {
  Property__c: RecordPayload;
  Tenant__c: RecordPayload;
  Lease__c: RecordPayload;
  Deal__c: RecordPayload;
}

/** A persisted record set — what the mock CRM record view renders. */
export interface SalesforceRecordSet {
  /** The Deal__c record id; also the /records/[id] route parameter. */
  id: string;
  dealId: string;
  dealHash: string;
  mode: SalesforceMode;
  createdAt: string;
  updatedAt: string;
  approvedBy: string;
  ids: { Property__c: string; Tenant__c: string; Lease__c: string; Deal__c: string };
  records: {
    Property__c: RecordPayload;
    Tenant__c: RecordPayload;
    Lease__c: RecordPayload;
    Deal__c: RecordPayload;
  };
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
