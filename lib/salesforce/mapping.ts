import { FIELD_SPECS_BY_PATH, getField } from '@/shared/schema';
import type { Deal } from '@/shared/deal';
import type { DealPayloads, RecordPayload, SObjectName } from './types';

/**
 * The one place Artificer's schema meets Salesforce.
 *
 * The field names here are not invented. They were derived from the public API
 * behind nnnpro.com (`api.surmount.com/sf-opportunities`), which serves a
 * Salesforce replica: every record carries a `salesforce_id`, and the replica's
 * snake_case column names map back to Salesforce API names by the usual
 * convention. `x1031_exchange` is the tell — Salesforce prefixes an `X` to any
 * API name that would otherwise start with a digit, so that column can only
 * have come from `X1031_Exchange__c`. Standard Opportunity fields corroborate
 * it: `stage_name` ← `StageName`, `close_date` ← `CloseDate`.
 *
 * Every mapping records where its name came from, so `origin` can be read
 * honestly rather than presented as fact — see docs/salesforce-schema.md, which
 * is generated from this table.
 */

export const SOBJECT_ORDER: SObjectName[] = ['Property__c', 'Opportunity'];

export const SOBJECT_LABELS: Record<SObjectName, string> = {
  Property__c: 'Property',
  Opportunity: 'Opportunity (listing)',
};

export type FieldOrigin =
  /** Seen on the live API; the API name follows from the replica column. */
  | 'observed'
  /** Standard Salesforce field, corroborated by the replica. */
  | 'standard'
  /** Artificer extracts this but no matching field was observed. */
  | 'proposed';

export interface FieldMapping {
  object: SObjectName;
  /** Salesforce API name. */
  api: string;
  /** The column seen on api.surmount.com, when there was one. */
  replica: string | null;
  origin: FieldOrigin;
  label: string;
  /** Dotted path into the extraction, when the value is copied directly. */
  path?: string;
  /** Used when the value is derived rather than copied. */
  resolve?: (deal: Deal) => string | number | null;
  note?: string;
}

const str = (deal: Deal, path: string): string | null => {
  const value = getField(deal.extraction, path)?.value;
  return value === null || value === undefined ? null : String(value);
};

const num = (deal: Deal, path: string): number | null => {
  const value = getField(deal.extraction, path)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export const FIELD_MAPPINGS: readonly FieldMapping[] = [
  // -- Property__c ----------------------------------------------------------
  {
    object: 'Property__c', api: 'Name', replica: null, origin: 'standard',
    label: 'Property Name',
    resolve: (deal) => {
      const parts = [str(deal, 'property.streetAddress'), str(deal, 'property.city'), str(deal, 'property.state')];
      return parts.filter(Boolean).join(', ') || deal.document.fileName;
    },
  },
  { object: 'Property__c', api: 'Property_Address_Street__c', replica: 'property_address_street', origin: 'observed', label: 'Street', path: 'property.streetAddress' },
  { object: 'Property__c', api: 'Property_Address_City__c', replica: 'property_address_city', origin: 'observed', label: 'City', path: 'property.city' },
  { object: 'Property__c', api: 'Property_Address_State__c', replica: 'property_address_state', origin: 'observed', label: 'State', path: 'property.state', note: 'Drives the State filter on the public site.' },
  { object: 'Property__c', api: 'Property_Address_Postal_Code__c', replica: 'property_address_postal_code', origin: 'observed', label: 'Postal Code', path: 'property.zip' },
  { object: 'Property__c', api: 'Property_Type__c', replica: 'property_type', origin: 'observed', label: 'Property Type', path: 'property.propertyType', note: 'Picklist. Options are served publicly at /sf-opportunities/public/visible-property-types.' },
  { object: 'Property__c', api: 'Building_Size_SF__c', replica: 'building_size_sf', origin: 'observed', label: 'Building Size (SF)', path: 'property.buildingSf' },
  { object: 'Property__c', api: 'Lot_Size_AC__c', replica: 'lot_size_ac', origin: 'observed', label: 'Lot Size (acres)', path: 'property.lotSizeAcres' },
  { object: 'Property__c', api: 'Year_Built__c', replica: 'year_built', origin: 'observed', label: 'Year Built', path: 'property.yearBuilt' },
  {
    object: 'Property__c', api: 'Concept__c', replica: 'concept', origin: 'observed',
    label: 'Concept', path: 'tenant.tradeName',
    note: 'Picklist. Options are served at /sf-opportunities/public/property-dropdown-options/concept, and it drives the Concept filter — a free-text value would produce a listing no filter can find.',
  },
  {
    object: 'Property__c', api: 'Credit_Type__c', replica: 'credit_type', origin: 'observed',
    label: 'Credit Type', path: 'tenant.guarantorType',
    note: "Artificer's guarantor classification (corporate / franchisee / personal / none) is the closest match; the org's picklist values should be confirmed.",
  },
  { object: 'Property__c', api: 'Renewal_Options_Remaining__c', replica: 'renewal_options_remaining', origin: 'observed', label: 'Renewal Options', path: 'lease.renewalOptions' },
  { object: 'Property__c', api: 'Landlord_Responsibility__c', replica: 'landlord_responsibility', origin: 'observed', label: 'Landlord Responsibility', path: 'lease.landlordResponsibilities' },

  // Extracted, but no matching field was observed on the public model.
  { object: 'Property__c', api: 'Tenant_Legal_Entity__c', replica: null, origin: 'proposed', label: 'Tenant Legal Entity', path: 'tenant.legalEntityName', note: 'The signing entity is not exposed publicly, but it is what a buyer underwrites.' },
  { object: 'Property__c', api: 'Guarantor_Name__c', replica: null, origin: 'proposed', label: 'Guarantor', path: 'tenant.guarantorName' },
  { object: 'Property__c', api: 'Credit_Rating__c', replica: null, origin: 'proposed', label: 'Credit Rating', path: 'tenant.creditRating' },

  // -- Opportunity ----------------------------------------------------------
  {
    object: 'Opportunity', api: 'Name', replica: 'name', origin: 'standard',
    label: 'Opportunity Name',
    resolve: (deal) => {
      const concept = str(deal, 'tenant.tradeName');
      const city = str(deal, 'property.city');
      const state = str(deal, 'property.state');
      const where = [city, state].filter(Boolean).join(', ');
      return [concept, where].filter(Boolean).join(' — ') || `Deal ${deal.id}`;
    },
  },
  { object: 'Opportunity', api: 'StageName', replica: 'stage_name', origin: 'standard', label: 'Stage', resolve: () => 'Proposal', note: 'Artificer writes an early-funnel stage; a deal reaching the public site is a later, human decision.' },
  { object: 'Opportunity', api: 'List_Price__c', replica: 'list_price', origin: 'observed', label: 'List Price', path: 'economics.askingPrice' },
  { object: 'Opportunity', api: 'List_Net_Operating_Income__c', replica: 'list_net_operating_income', origin: 'observed', label: 'List NOI', path: 'economics.annualBaseRent' },
  { object: 'Opportunity', api: 'Lease_Type__c', replica: 'lease_type', origin: 'observed', label: 'Lease Type', path: 'lease.leaseType' },
  { object: 'Opportunity', api: 'Lease_Commencement__c', replica: 'lease_commencement', origin: 'observed', label: 'Lease Commencement', path: 'lease.commencementDate' },
  { object: 'Opportunity', api: 'Lease_Expiration__c', replica: 'lease_expiration', origin: 'observed', label: 'Lease Expiration', path: 'lease.expirationDate' },
  { object: 'Opportunity', api: 'Lease_Term_Remaining__c', replica: 'lease_term_remaining', origin: 'observed', label: 'Lease Term Remaining', path: 'lease.remainingTermYears' },
  { object: 'Opportunity', api: 'Rental_Increases__c', replica: 'rental_increases', origin: 'observed', label: 'Rental Increases', path: 'lease.rentEscalations' },
  { object: 'Opportunity', api: 'Description__c', replica: 'description', origin: 'standard', label: 'Description', resolve: (deal) => `Intake from ${deal.document.fileName} via Artificer.` },
  { object: 'Opportunity', api: 'Artificer_Deal_Id__c', replica: null, origin: 'proposed', label: 'Artificer Deal Id', resolve: (deal) => deal.id, note: 'Links the CRM record back to the reviewed deal and its audit trail.' },
  { object: 'Opportunity', api: 'Deal_Hash__c', replica: null, origin: 'proposed', label: 'Deal Hash', resolve: (deal) => deal.dealHash, note: 'External ID + Unique. This is what makes re-approval idempotent.' },
];

/**
 * Cap rate is deliberately absent.
 *
 * The public model carries `list_price` and `list_net_operating_income` and
 * derives the rate from them, so writing a separately-extracted cap rate would
 * create a second source of truth that can disagree with the arithmetic. It
 * still earns its place in the schema — it is stated in the document, a
 * reviewer should check it, and it is worth surfacing when it does not match.
 */
export const UNWRITTEN_FIELDS: ReadonlyArray<{ path: string; reason: string }> = [
  { path: 'economics.capRate', reason: 'Derived downstream from list price and NOI.' },
  { path: 'economics.pricePerSf', reason: 'Derived downstream from list price and building size.' },
];

export function buildPayloads(deal: Deal): DealPayloads {
  const payloads = Object.fromEntries(SOBJECT_ORDER.map((name) => [name, {} as RecordPayload])) as DealPayloads;

  for (const mapping of FIELD_MAPPINGS) {
    payloads[mapping.object][mapping.api] = resolveValue(deal, mapping);
  }
  return payloads;
}

function resolveValue(deal: Deal, mapping: FieldMapping): string | number | null {
  if (mapping.resolve) return mapping.resolve(deal);
  if (!mapping.path) return null;

  const spec = FIELD_SPECS_BY_PATH[mapping.path];
  return spec?.kind === 'number' ? num(deal, mapping.path) : str(deal, mapping.path);
}

/** Non-null field count per object — shown in the pre-approval confirmation. */
export function payloadFieldCounts(payloads: DealPayloads): Record<SObjectName, number> {
  const counts = {} as Record<SObjectName, number>;
  for (const name of SOBJECT_ORDER) {
    counts[name] = Object.values(payloads[name]).filter((v) => v !== null && v !== undefined && v !== '').length;
  }
  return counts;
}

/** Mappings whose API name Artificer proposes rather than observed in the org. */
export function proposedMappings(): FieldMapping[] {
  return FIELD_MAPPINGS.filter((mapping) => mapping.origin === 'proposed');
}
