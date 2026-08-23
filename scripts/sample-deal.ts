import { buildParagraphs } from '@/lib/extraction/pdf';
import { resolveAnchors } from '@/lib/extraction/anchor';
import { emptyExtraction, withField, type NetLeaseExtraction, type Confidence } from '@/shared/schema';
import type { DocumentParagraph } from '@/shared/deal';

/**
 * The seeded deal: a fictional Dollar General in Mount Vernon, Ohio.
 *
 * It is written to exercise the parts of the screen that matter — a
 * high-confidence majority, one derived value, one genuine gap, and one
 * conflicting figure the reviewer is meant to catch. Every quote below is
 * copied out of the page text above it, so provenance highlighting works on
 * first load without an API call.
 */

const PAGES: string[] = [
  // ---- Page 1 -------------------------------------------------------------
  `OFFERING MEMORANDUM

DOLLAR GENERAL

1487 Coshocton Avenue, Mount Vernon, Ohio 43050

Single-Tenant Absolute NNN Investment Opportunity

INVESTMENT SUMMARY

Price: $1,842,000
Cap Rate: 6.75%
Net Operating Income: $124,335
Building Size: 9,100 SF
Lot Size: 54,014 square feet
Year Built: 2019
Lease Type: Absolute NNN
Remaining Term: 8.1 years

This information has been secured from sources believed to be reliable, but no representation or warranty is made as to its accuracy.`,

  // ---- Page 2 -------------------------------------------------------------
  `INVESTMENT HIGHLIGHTS

Absolute NNN lease with zero landlord responsibilities, providing a completely passive income stream for the investor.

Corporate guaranty from Dollar General Corporation (NYSE: DG), one of the largest discount retailers in the United States by store count.

Newly constructed 2019 build-to-suit featuring the tenant's current prototype, positioned on a signalized corner along the primary retail corridor.

Four remaining five-year renewal options provide long-term income durability well beyond the primary term.

TENANT OVERVIEW

The subject property is occupied by Dolgencorp, LLC, a wholly owned subsidiary of Dollar General Corporation, which guarantees all obligations under the lease.

Dollar General Corporation operates more than 19,000 stores across 47 states and is one of the most active net-lease tenants in the United States. The company reported net sales of $38.7 billion in its most recent fiscal year.`,

  // ---- Page 3 -------------------------------------------------------------
  `LEASE ABSTRACT

Tenant: Dolgencorp, LLC
Guarantor: Dollar General Corporation
Lease Commencement: October 1, 2019
Lease Expiration: September 30, 2034
Primary Term: Fifteen (15) years
Remaining Term: 8.1 years as of August 1, 2026
Renewal Options: Four (4) five-year options
Rent Escalations: 10% increase at the commencement of each option period
Base Rent: $124,335 per annum

Landlord Responsibilities: None. The lease is absolute triple net and the tenant is responsible for all taxes, insurance, maintenance, roof, structure and replacement.

PROPERTY DESCRIPTION

The improvements consist of a freestanding single-tenant retail building containing approximately 9,026 square feet of gross leasable area situated on a 54,014 square foot parcel.

The property was constructed in 2019 and features 42 surface parking spaces, a dedicated receiving area and pylon signage along Coshocton Avenue.`,
];

interface SeedField {
  path: string;
  value: string | number | null;
  confidence: Confidence;
  quote: string | null;
}

const SEED_FIELDS: SeedField[] = [
  // Property
  { path: 'property.streetAddress', value: '1487 Coshocton Avenue', confidence: 'high', quote: '1487 Coshocton Avenue, Mount Vernon, Ohio 43050' },
  { path: 'property.city', value: 'Mount Vernon', confidence: 'high', quote: '1487 Coshocton Avenue, Mount Vernon, Ohio 43050' },
  { path: 'property.state', value: 'OH', confidence: 'high', quote: '1487 Coshocton Avenue, Mount Vernon, Ohio 43050' },
  { path: 'property.zip', value: '43050', confidence: 'high', quote: '1487 Coshocton Avenue, Mount Vernon, Ohio 43050' },
  { path: 'property.propertyType', value: 'retail', confidence: 'high', quote: 'a freestanding single-tenant retail building' },
  // The two stated figures disagree — exactly the kind of thing a reviewer, not
  // a model, should settle. Graded low so it lands in "Needs attention".
  { path: 'property.buildingSf', value: 9100, confidence: 'low', quote: 'containing approximately 9,026 square feet of gross leasable area' },
  { path: 'property.lotSizeAcres', value: 1.24, confidence: 'medium', quote: 'situated on a 54,014 square foot parcel' },
  { path: 'property.yearBuilt', value: 2019, confidence: 'high', quote: 'The property was constructed in 2019' },

  // Tenant
  { path: 'tenant.tradeName', value: 'Dollar General', confidence: 'high', quote: 'DOLLAR GENERAL' },
  { path: 'tenant.legalEntityName', value: 'Dolgencorp, LLC', confidence: 'high', quote: 'The subject property is occupied by Dolgencorp, LLC, a wholly owned subsidiary of Dollar General Corporation' },
  { path: 'tenant.guarantorName', value: 'Dollar General Corporation', confidence: 'high', quote: 'Corporate guaranty from Dollar General Corporation (NYSE: DG)' },
  { path: 'tenant.guarantorType', value: 'corporate', confidence: 'medium', quote: 'a wholly owned subsidiary of Dollar General Corporation, which guarantees all obligations under the lease' },
  // The memo calls the tenant investment grade but never states a rating.
  { path: 'tenant.creditRating', value: null, confidence: 'not_found', quote: null },

  // Lease
  { path: 'lease.leaseType', value: 'absolute NNN', confidence: 'high', quote: 'Landlord Responsibilities: None. The lease is absolute triple net' },
  { path: 'lease.commencementDate', value: '2019-10-01', confidence: 'high', quote: 'Lease Commencement: October 1, 2019' },
  { path: 'lease.expirationDate', value: '2034-09-30', confidence: 'high', quote: 'Lease Expiration: September 30, 2034' },
  { path: 'lease.remainingTermYears', value: 8.1, confidence: 'high', quote: 'Remaining Term: 8.1 years as of August 1, 2026' },
  { path: 'lease.renewalOptions', value: '4 x 5yr', confidence: 'high', quote: 'Renewal Options: Four (4) five-year options' },
  { path: 'lease.rentEscalations', value: '10% at each option period', confidence: 'high', quote: 'Rent Escalations: 10% increase at the commencement of each option period' },
  { path: 'lease.landlordResponsibilities', value: 'None — tenant bears all taxes, insurance, maintenance, roof, structure and replacement.', confidence: 'high', quote: 'the tenant is responsible for all taxes, insurance, maintenance, roof, structure and replacement' },

  // Economics
  { path: 'economics.askingPrice', value: 1842000, confidence: 'high', quote: 'Price: $1,842,000' },
  { path: 'economics.annualBaseRent', value: 124335, confidence: 'high', quote: 'Net Operating Income: $124,335' },
  { path: 'economics.capRate', value: 6.75, confidence: 'high', quote: 'Cap Rate: 6.75%' },
  // Not stated anywhere; derived from price / building SF, so medium at best.
  { path: 'economics.pricePerSf', value: 202.42, confidence: 'medium', quote: 'Price: $1,842,000' },
];

export interface SampleDeal {
  paragraphs: DocumentParagraph[];
  extraction: NetLeaseExtraction;
  pageCount: number;
  charCount: number;
  unresolved: string[];
}

export function buildSampleDeal(): SampleDeal {
  const paragraphs = buildParagraphs(PAGES);

  let extraction = emptyExtraction();
  for (const seed of SEED_FIELDS) {
    extraction = withField(extraction, seed.path, {
      value: seed.value,
      confidence: seed.confidence,
      sourceQuote: seed.quote,
      sourceLocation: null,
      edited: false,
    });
  }

  // Anchors are resolved the same way a live extraction resolves them, so the
  // seeded deal cannot drift away from how real data behaves.
  resolveAnchors(extraction, paragraphs);

  const unresolved = SEED_FIELDS.filter((seed) => {
    if (!seed.quote) return false;
    const [section, key] = seed.path.split('.');
    const bucket = (extraction as unknown as Record<string, Record<string, { sourceLocation: string | null }>>)[section];
    return !bucket[key].sourceLocation;
  }).map((seed) => seed.path);

  return {
    paragraphs,
    extraction,
    pageCount: PAGES.length,
    charCount: paragraphs.reduce((n, p) => n + p.text.length, 0),
    unresolved,
  };
}

export const SAMPLE_FILE_NAME = 'Dollar General — Mount Vernon OH — Offering Memorandum.pdf';
export const SAMPLE_DEAL_ID = 'd_sample_dollar_general_oh';
