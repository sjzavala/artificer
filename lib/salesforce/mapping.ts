import { getField } from '@/shared/schema';
import type { NetLeaseExtraction } from '@/shared/schema';
import type { Deal } from '@/shared/deal';
import type { DealPayloads, RecordPayload, SObjectName } from './types';

/**
 * The one place the schema meets Salesforce API names. docs/salesforce-schema.md
 * is written against this mapping, so a Developer Edition org can be wired up by
 * copying field names straight across.
 */
export const SOBJECT_ORDER: SObjectName[] = ['Property__c', 'Tenant__c', 'Lease__c', 'Deal__c'];

export const SOBJECT_LABELS: Record<SObjectName, string> = {
  Property__c: 'Property',
  Tenant__c: 'Tenant',
  Lease__c: 'Lease',
  Deal__c: 'Deal',
};

const str = (e: NetLeaseExtraction, path: string): string | null => {
  const v = getField(e, path)?.value;
  return v === null || v === undefined ? null : String(v);
};

const num = (e: NetLeaseExtraction, path: string): number | null => {
  const v = getField(e, path)?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export function buildPayloads(deal: Deal): DealPayloads {
  const e = deal.extraction;

  const street = str(e, 'property.streetAddress');
  const city = str(e, 'property.city');
  const state = str(e, 'property.state');
  const tenant = str(e, 'tenant.tradeName');

  const propertyName = [street, city, state].filter(Boolean).join(', ') || deal.document.fileName;
  const dealName = [tenant, city && state ? `${city}, ${state}` : city ?? state]
    .filter(Boolean)
    .join(' — ') || `Deal ${deal.id}`;

  return {
    Property__c: {
      Name: propertyName,
      Street_Address__c: street,
      City__c: city,
      State__c: state,
      Postal_Code__c: str(e, 'property.zip'),
      Property_Type__c: str(e, 'property.propertyType'),
      Building_SF__c: num(e, 'property.buildingSf'),
      Lot_Size_Acres__c: num(e, 'property.lotSizeAcres'),
      Year_Built__c: num(e, 'property.yearBuilt'),
    },
    Tenant__c: {
      Name: tenant ?? 'Unknown Tenant',
      Legal_Entity_Name__c: str(e, 'tenant.legalEntityName'),
      Guarantor_Name__c: str(e, 'tenant.guarantorName'),
      Guarantor_Type__c: str(e, 'tenant.guarantorType'),
      Credit_Rating__c: str(e, 'tenant.creditRating'),
    },
    Lease__c: {
      Name: `${tenant ?? 'Lease'} — ${str(e, 'lease.leaseType') ?? 'Net Lease'}`,
      Lease_Type__c: str(e, 'lease.leaseType'),
      Commencement_Date__c: str(e, 'lease.commencementDate'),
      Expiration_Date__c: str(e, 'lease.expirationDate'),
      Remaining_Term_Years__c: num(e, 'lease.remainingTermYears'),
      Renewal_Options__c: str(e, 'lease.renewalOptions'),
      Rent_Escalations__c: str(e, 'lease.rentEscalations'),
      Landlord_Responsibilities__c: str(e, 'lease.landlordResponsibilities'),
    },
    Deal__c: {
      Name: dealName,
      Asking_Price__c: num(e, 'economics.askingPrice'),
      Annual_Base_Rent__c: num(e, 'economics.annualBaseRent'),
      Cap_Rate__c: num(e, 'economics.capRate'),
      Price_Per_SF__c: num(e, 'economics.pricePerSf'),
      Status__c: 'Approved',
      Source_Document__c: deal.document.fileName,
      Artificer_Deal_Id__c: deal.id,
      Deal_Hash__c: deal.dealHash,
    },
  };
}

/** Non-null field count per object — shown in the pre-approval confirmation. */
export function payloadFieldCounts(payloads: DealPayloads): Record<SObjectName, number> {
  const counts = {} as Record<SObjectName, number>;
  for (const name of SOBJECT_ORDER) {
    counts[name] = Object.values(payloads[name] as RecordPayload).filter(
      (v) => v !== null && v !== undefined && v !== '',
    ).length;
  }
  return counts;
}
