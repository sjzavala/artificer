/**
 * Content for the generated sample offering memoranda.
 *
 * The deals are fictional — invented addresses, prices and lease terms — but
 * they are written the way real net-lease memoranda are written: the same
 * figure restated across a summary table and a lease abstract, an occasional
 * internal inconsistency, and facts a broker would simply omit. Extraction that
 * only works on tidy documents is not worth measuring.
 */

export interface SampleBlock {
  style: 'title' | 'subtitle' | 'heading' | 'body' | 'kv' | 'bullet';
  text: string;
}

export interface SamplePage {
  blocks: SampleBlock[];
}

export interface SampleDoc {
  id: string;
  fileName: string;
  label: string;
  pages: SamplePage[];
}

export const SAMPLES: SampleDoc[] = [
  // -------------------------------------------------------------------------
  {
    id: 'dollar-general-oh',
    fileName: 'dollar-general-mount-vernon-oh.pdf',
    label: 'Dollar General — Mount Vernon, OH — absolute NNN retail',
    pages: [
      {
        blocks: [
          { style: 'subtitle', text: 'OFFERING MEMORANDUM' },
          { style: 'title', text: 'DOLLAR GENERAL' },
          { style: 'subtitle', text: '1487 Coshocton Avenue, Mount Vernon, Ohio 43050' },
          { style: 'body', text: 'Single-Tenant Absolute NNN Investment Opportunity' },
          { style: 'heading', text: 'INVESTMENT SUMMARY' },
          { style: 'kv', text: 'Price: $1,842,000' },
          { style: 'kv', text: 'Cap Rate: 6.75%' },
          { style: 'kv', text: 'Net Operating Income: $124,335' },
          { style: 'kv', text: 'Building Size: 9,100 SF' },
          { style: 'kv', text: 'Lot Size: 54,014 square feet' },
          { style: 'kv', text: 'Year Built: 2019' },
          { style: 'kv', text: 'Lease Type: Absolute NNN' },
          { style: 'kv', text: 'Remaining Term: 8.1 years' },
          {
            style: 'body',
            text: 'This information has been secured from sources believed to be reliable, but no representation or warranty is made as to its accuracy.',
          },
        ],
      },
      {
        blocks: [
          { style: 'heading', text: 'INVESTMENT HIGHLIGHTS' },
          { style: 'bullet', text: 'Absolute NNN lease with zero landlord responsibilities, providing a completely passive income stream for the investor.' },
          { style: 'bullet', text: 'Corporate guaranty from Dollar General Corporation (NYSE: DG), one of the largest discount retailers in the United States by store count.' },
          { style: 'bullet', text: "Newly constructed 2019 build-to-suit featuring the tenant's current prototype, positioned on a signalized corner along the primary retail corridor." },
          { style: 'bullet', text: 'Four remaining five-year renewal options provide long-term income durability well beyond the primary term.' },
          { style: 'heading', text: 'TENANT OVERVIEW' },
          { style: 'body', text: 'The subject property is occupied by Dolgencorp, LLC, a wholly owned subsidiary of Dollar General Corporation, which guarantees all obligations under the lease.' },
          { style: 'body', text: 'Dollar General Corporation operates more than 19,000 stores across 47 states and is one of the most active net-lease tenants in the United States. The company reported net sales of $38.7 billion in its most recent fiscal year.' },
        ],
      },
      {
        blocks: [
          { style: 'heading', text: 'LEASE ABSTRACT' },
          { style: 'kv', text: 'Tenant: Dolgencorp, LLC' },
          { style: 'kv', text: 'Guarantor: Dollar General Corporation' },
          { style: 'kv', text: 'Lease Commencement: October 1, 2019' },
          { style: 'kv', text: 'Lease Expiration: September 30, 2034' },
          { style: 'kv', text: 'Primary Term: Fifteen (15) years' },
          { style: 'kv', text: 'Remaining Term: 8.1 years as of August 1, 2026' },
          { style: 'kv', text: 'Renewal Options: Four (4) five-year options' },
          { style: 'kv', text: 'Rent Escalations: 10% increase at the commencement of each option period' },
          { style: 'kv', text: 'Base Rent: $124,335 per annum' },
          { style: 'body', text: 'Landlord Responsibilities: None. The lease is absolute triple net and the tenant is responsible for all taxes, insurance, maintenance, roof, structure and replacement.' },
          { style: 'heading', text: 'PROPERTY DESCRIPTION' },
          // Deliberately inconsistent with the 9,100 SF on the summary page.
          { style: 'body', text: 'The improvements consist of a freestanding single-tenant retail building containing approximately 9,026 square feet of gross leasable area situated on a 54,014 square foot parcel.' },
          { style: 'body', text: 'The property was constructed in 2019 and features 42 surface parking spaces, a dedicated receiving area and pylon signage along Coshocton Avenue.' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'qsr-ground-lease-tx',
    fileName: 'qsr-ground-lease-round-rock-tx.pdf',
    label: 'Chick-fil-A ground lease — Round Rock, TX',
    pages: [
      {
        blocks: [
          { style: 'subtitle', text: 'NET LEASE OFFERING' },
          { style: 'title', text: 'CHICK-FIL-A' },
          { style: 'subtitle', text: '3320 Gattis School Road, Round Rock, TX 78664' },
          { style: 'body', text: 'Absolute NNN Ground Lease — Corporate Guaranty' },
          { style: 'heading', text: 'FINANCIAL SUMMARY' },
          { style: 'kv', text: 'List Price: $4,310,000' },
          { style: 'kv', text: 'Annual Rent: $215,500' },
          { style: 'kv', text: 'Capitalization Rate: 5.00%' },
          { style: 'kv', text: 'Land Area: 1.38 acres' },
          { style: 'kv', text: 'Building Area: 4,980 SF' },
          { style: 'kv', text: 'Price Per Square Foot: $865.46' },
          { style: 'kv', text: 'Year Constructed: 2022' },
          { style: 'body', text: 'All figures are fictional and provided for demonstration purposes.' },
        ],
      },
      {
        blocks: [
          { style: 'heading', text: 'INVESTMENT HIGHLIGHTS' },
          { style: 'bullet', text: 'Absolute NNN ground lease. The landlord has no responsibilities of any kind, including roof, structure, parking lot and all capital expenditures.' },
          { style: 'bullet', text: 'Corporate guaranty from Chick-fil-A, Inc. — not a franchisee — providing exceptional income security.' },
          { style: 'bullet', text: 'Located on Gattis School Road with over 38,000 vehicles per day, adjacent to a regional grocery anchor.' },
          { style: 'bullet', text: 'Rent increases of 10% every five years throughout the primary term and all option periods.' },
          { style: 'heading', text: 'TENANT PROFILE' },
          { style: 'body', text: 'The lease is held by Chick-fil-A, Inc., a privately held Georgia corporation. The company does not carry a published credit rating from any rating agency.' },
          { style: 'body', text: 'Chick-fil-A operates over 3,000 restaurants nationally and reported system-wide sales in excess of $21 billion.' },
        ],
      },
      {
        blocks: [
          { style: 'heading', text: 'LEASE SUMMARY' },
          { style: 'kv', text: 'Tenant Entity: Chick-fil-A, Inc.' },
          { style: 'kv', text: 'Guarantor: Chick-fil-A, Inc. (Corporate)' },
          { style: 'kv', text: 'Lease Structure: Absolute NNN Ground Lease' },
          { style: 'kv', text: 'Commencement Date: March 15, 2022' },
          { style: 'kv', text: 'Expiration Date: March 31, 2042' },
          { style: 'kv', text: 'Primary Term: Twenty (20) years' },
          { style: 'kv', text: 'Options to Extend: Five (5) five-year options' },
          { style: 'kv', text: 'Rent Increases: 10% every five (5) years' },
          { style: 'body', text: 'Landlord Obligations: None. This is an absolute net ground lease under which the tenant constructed the improvements at its own cost and is responsible for all operating expenses, taxes, insurance and capital repairs.' },
          { style: 'heading', text: 'SITE DESCRIPTION' },
          { style: 'body', text: 'The site comprises 1.38 acres improved with a 4,980 square foot freestanding restaurant building constructed by the tenant in 2022, with a dual drive-thru lane and 52 parking spaces.' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'industrial-sale-leaseback-az',
    fileName: 'industrial-sale-leaseback-tempe-az.pdf',
    label: 'Industrial sale-leaseback — Tempe, AZ',
    pages: [
      {
        blocks: [
          { style: 'subtitle', text: 'CONFIDENTIAL OFFERING MEMORANDUM' },
          { style: 'title', text: 'SONORAN PRECISION COMPONENTS' },
          { style: 'subtitle', text: '2245 West Elliot Road, Tempe, AZ 85284' },
          { style: 'body', text: 'Industrial Sale-Leaseback Opportunity' },
          { style: 'heading', text: 'OFFERING SUMMARY' },
          { style: 'kv', text: 'Offering Price: $12,400,000' },
          { style: 'kv', text: 'Year One NOI: $806,000' },
          { style: 'kv', text: 'Going-In Cap Rate: 6.50%' },
          { style: 'kv', text: 'Building Area: 84,300 SF' },
          { style: 'kv', text: 'Site Area: 5.62 acres' },
          { style: 'kv', text: 'Year Built: 2004' },
          { style: 'kv', text: 'Lease Structure: NN' },
          { style: 'body', text: 'A fictional offering prepared solely to demonstrate document extraction.' },
        ],
      },
      {
        blocks: [
          { style: 'heading', text: 'TRANSACTION OVERVIEW' },
          { style: 'body', text: 'The seller, Sonoran Precision Components, LLC, will execute a new fifteen-year lease at closing and continue to occupy the entire facility as its headquarters and primary manufacturing site.' },
          { style: 'bullet', text: 'New 15-year lease executed simultaneously with closing, providing immediate long-term occupancy.' },
          { style: 'bullet', text: 'Mission-critical facility housing the tenant’s only cleanroom production line, with substantial tenant investment in fit-out.' },
          { style: 'bullet', text: 'Annual rent escalations of 2.5% provide a hedge against inflation over the term.' },
          { style: 'heading', text: 'TENANT OVERVIEW' },
          { style: 'body', text: 'Sonoran Precision Components, LLC is a privately held Arizona limited liability company supplying machined components to the aerospace and semiconductor industries. The company is not rated by any credit agency and does not publish audited financial statements.' },
          // No guarantor is mentioned anywhere in this document, on purpose.
          { style: 'body', text: 'Financial statements will be made available to qualified prospects under a confidentiality agreement.' },
        ],
      },
      {
        blocks: [
          { style: 'heading', text: 'LEASE ABSTRACT' },
          { style: 'kv', text: 'Tenant: Sonoran Precision Components, LLC' },
          { style: 'kv', text: 'Lease Commencement: January 1, 2027' },
          { style: 'kv', text: 'Lease Expiration: December 31, 2041' },
          { style: 'kv', text: 'Primary Term: Fifteen (15) years' },
          { style: 'kv', text: 'Renewal Options: Two (2) five-year options' },
          { style: 'kv', text: 'Rent Escalations: 2.5% annually' },
          { style: 'kv', text: 'Base Rent: $806,000 per annum' },
          { style: 'body', text: 'Landlord Responsibilities: The landlord is responsible for the roof and structure. The tenant pays all real estate taxes, insurance premiums and routine maintenance, making this a double net (NN) lease.' },
          { style: 'heading', text: 'PROPERTY DESCRIPTION' },
          { style: 'body', text: 'The improvements consist of an 84,300 square foot concrete tilt-up industrial building constructed in 2004, situated on approximately 5.62 acres. Clear height is 28 feet with eight dock-high doors and two grade-level doors.' },
          { style: 'body', text: 'The property received a full roof replacement in 2019 and the parking field was resurfaced in 2021.' },
        ],
      },
    ],
  },
];
