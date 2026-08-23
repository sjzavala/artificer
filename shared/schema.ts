import { z } from 'zod';

/**
 * The single source of truth for Artificer's net-lease deal schema.
 *
 * Everything downstream reads from here: the extraction prompt is generated
 * from FIELD_SPECS, the API validates Claude's output with the zod schema
 * below, the approval UI renders rows from the same specs, and the eval
 * harness compares ground truth field-by-field using the same paths. If a
 * field needs to change, it changes once, here.
 */

// ---------------------------------------------------------------------------
// Field envelope
// ---------------------------------------------------------------------------

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'not_found'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface ExtractedField<T> {
  /** The extracted value, or null when the document does not state it. */
  value: T | null;
  /** How directly the document supports the value. */
  confidence: Confidence;
  /** Verbatim passage from the document, <= 40 words. Never paraphrased. */
  sourceQuote: string | null;
  /** Paragraph anchor id (e.g. "p-42") or page reference the quote came from. */
  sourceLocation: string | null;
  /** True once a human has changed the value on the approval screen. */
  edited: boolean;
}

const confidenceSchema = z.enum(CONFIDENCE_LEVELS);

/** Wraps an inner value schema in the ExtractedField envelope. */
function field<T extends z.ZodTypeAny>(inner: T) {
  return z.object({
    value: inner.nullable(),
    confidence: confidenceSchema,
    sourceQuote: z.string().nullable().default(null),
    sourceLocation: z.string().nullable().default(null),
    // Claude never emits `edited`; only the approval UI sets it.
    edited: z.boolean().default(false),
  });
}

/**
 * Claude regularly returns numbers as strings ("$1,250,000", "6.25%", "9,100 SF").
 * Rejecting those would mean discarding a correct answer over formatting, so we
 * coerce here and let the confidence score carry the uncertainty instead.
 */
const looseNumber = z.preprocess((raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return raw;
  const cleaned = raw.replace(/[$,%\s]/g, '').replace(/(sf|sqft|squarefeet|acres?|years?|yrs?)/gi, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : raw;
}, z.number());

/** ISO-8601 date (YYYY-MM-DD). Claude is instructed to normalise to this form. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const PROPERTY_TYPES = ['retail', 'industrial', 'office', 'other'] as const;
export const GUARANTOR_TYPES = ['corporate', 'franchisee', 'personal', 'none'] as const;
export const LEASE_TYPES = ['NNN', 'NN', 'absolute NNN', 'gross', 'modified gross'] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type GuarantorType = (typeof GUARANTOR_TYPES)[number];
export type LeaseType = (typeof LEASE_TYPES)[number];

// ---------------------------------------------------------------------------
// The extraction schema
// ---------------------------------------------------------------------------

export const netLeaseExtractionSchema = z.object({
  property: z.object({
    streetAddress: field(z.string()),
    city: field(z.string()),
    state: field(z.string()),
    zip: field(z.string()),
    propertyType: field(z.enum(PROPERTY_TYPES)),
    buildingSf: field(looseNumber),
    lotSizeAcres: field(looseNumber),
    yearBuilt: field(looseNumber),
  }),
  tenant: z.object({
    tradeName: field(z.string()),
    legalEntityName: field(z.string()),
    guarantorName: field(z.string()),
    guarantorType: field(z.enum(GUARANTOR_TYPES)),
    creditRating: field(z.string()),
  }),
  lease: z.object({
    leaseType: field(z.enum(LEASE_TYPES)),
    commencementDate: field(isoDate),
    expirationDate: field(isoDate),
    remainingTermYears: field(looseNumber),
    renewalOptions: field(z.string()),
    rentEscalations: field(z.string()),
    landlordResponsibilities: field(z.string()),
  }),
  economics: z.object({
    askingPrice: field(looseNumber),
    annualBaseRent: field(looseNumber),
    capRate: field(looseNumber),
    pricePerSf: field(looseNumber),
  }),
});

export type NetLeaseExtraction = z.infer<typeof netLeaseExtractionSchema>;

// ---------------------------------------------------------------------------
// Field registry — drives the prompt, the UI, and the eval comparison
// ---------------------------------------------------------------------------

export const SECTIONS = [
  { key: 'property', label: 'Property' },
  { key: 'tenant', label: 'Tenant' },
  { key: 'lease', label: 'Lease' },
  { key: 'economics', label: 'Deal Economics' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export type FieldKind = 'string' | 'number' | 'date' | 'enum';
export type FieldUnit = 'usd' | 'usd_per_sf' | 'sf' | 'acres' | 'percent' | 'years' | 'year';

export interface FieldSpec {
  /** Dotted path into NetLeaseExtraction, e.g. "property.streetAddress". */
  path: string;
  section: SectionKey;
  key: string;
  label: string;
  kind: FieldKind;
  unit?: FieldUnit;
  enumValues?: readonly string[];
  /** Guidance handed verbatim to Claude in the extraction prompt. */
  description: string;
  /** True when the value may legitimately be derived rather than quoted. */
  computable?: boolean;
}

export const FIELD_SPECS: readonly FieldSpec[] = [
  // -- Property -------------------------------------------------------------
  {
    path: 'property.streetAddress', section: 'property', key: 'streetAddress',
    label: 'Street Address', kind: 'string',
    description: 'Street number and street name of the subject property only. Exclude city, state and ZIP.',
  },
  {
    path: 'property.city', section: 'property', key: 'city',
    label: 'City', kind: 'string',
    description: 'City or municipality of the subject property.',
  },
  {
    path: 'property.state', section: 'property', key: 'state',
    label: 'State', kind: 'string',
    description: 'Two-letter USPS state abbreviation, uppercase (e.g. "OH", "TX").',
  },
  {
    path: 'property.zip', section: 'property', key: 'zip',
    label: 'ZIP', kind: 'string',
    description: '5-digit ZIP code. Include the +4 extension only if the document states it.',
  },
  {
    path: 'property.propertyType', section: 'property', key: 'propertyType',
    label: 'Property Type', kind: 'enum', enumValues: PROPERTY_TYPES,
    description:
      'Asset class. "retail" covers single-tenant retail, QSR, drug store, dollar store, c-store and bank branches. ' +
      '"industrial" covers warehouse, distribution, flex and manufacturing. "office" covers medical and general office. ' +
      'Use "other" only when the document describes something none of these cover.',
  },
  {
    path: 'property.buildingSf', section: 'property', key: 'buildingSf',
    label: 'Building SF', kind: 'number', unit: 'sf',
    description: 'Gross building area in square feet, as a plain number (e.g. 9100, not "9,100 SF").',
  },
  {
    path: 'property.lotSizeAcres', section: 'property', key: 'lotSizeAcres',
    label: 'Lot Size', kind: 'number', unit: 'acres', computable: true,
    description:
      'Land area in acres, as a plain number. If the document gives only square feet of land, convert ' +
      '(1 acre = 43,560 SF), round to two decimals, and mark confidence "medium".',
  },
  {
    path: 'property.yearBuilt', section: 'property', key: 'yearBuilt',
    label: 'Year Built', kind: 'number', unit: 'year',
    description: 'Four-digit year of original construction. If the document only gives a renovation year, this is not_found.',
  },

  // -- Tenant ---------------------------------------------------------------
  {
    path: 'tenant.tradeName', section: 'tenant', key: 'tradeName',
    label: 'Tenant Trade Name', kind: 'string',
    description: 'The brand the public sees on the building (e.g. "Dollar General", "Chick-fil-A").',
  },
  {
    path: 'tenant.legalEntityName', section: 'tenant', key: 'legalEntityName',
    label: 'Legal Entity Name', kind: 'string',
    description:
      'The full legal name of the entity signing the lease, including its suffix (LLC, Inc., L.P.). ' +
      'This is often different from the trade name and appears in the lease preamble or signature block.',
  },
  {
    path: 'tenant.guarantorName', section: 'tenant', key: 'guarantorName',
    label: 'Guarantor', kind: 'string',
    description: 'Name of the party guaranteeing the lease obligations. If the document states there is no guaranty, this is not_found.',
  },
  {
    path: 'tenant.guarantorType', section: 'tenant', key: 'guarantorType',
    label: 'Guarantor Type', kind: 'enum', enumValues: GUARANTOR_TYPES, computable: true,
    description:
      'Classify the guaranty: "corporate" when the parent or an investment-grade corporate entity guarantees; ' +
      '"franchisee" when a franchise operator guarantees; "personal" when named individuals guarantee; ' +
      '"none" when the document explicitly states the lease is unguaranteed. Classification from a described ' +
      'guaranty is "medium" confidence unless the document uses the label itself.',
  },
  {
    path: 'tenant.creditRating', section: 'tenant', key: 'creditRating',
    label: 'Credit Rating', kind: 'string',
    description:
      'Credit rating exactly as stated, including the agency if given (e.g. "BBB (S&P)", "Baa2 (Moody’s)"). ' +
      'Never infer a rating from the tenant’s reputation — if the document does not state one, this is not_found.',
  },

  // -- Lease ----------------------------------------------------------------
  {
    path: 'lease.leaseType', section: 'lease', key: 'leaseType',
    label: 'Lease Type', kind: 'enum', enumValues: LEASE_TYPES,
    description:
      'Structure of expense responsibility. "absolute NNN" means the tenant bears every expense including roof, ' +
      'structure and replacement, with no landlord obligations. "NNN" means tenant pays taxes, insurance and ' +
      'maintenance but the landlord retains roof/structure. "NN" means the tenant pays taxes and insurance only. ' +
      'Only use "absolute NNN" when the document says so or lists zero landlord responsibilities.',
  },
  {
    path: 'lease.commencementDate', section: 'lease', key: 'commencementDate',
    label: 'Commencement Date', kind: 'date',
    description: 'Lease commencement (rent start) date, normalised to YYYY-MM-DD.',
  },
  {
    path: 'lease.expirationDate', section: 'lease', key: 'expirationDate',
    label: 'Expiration Date', kind: 'date',
    description: 'Expiration of the current (primary) lease term, normalised to YYYY-MM-DD. Do not include renewal options.',
  },
  {
    path: 'lease.remainingTermYears', section: 'lease', key: 'remainingTermYears',
    label: 'Remaining Term', kind: 'number', unit: 'years', computable: true,
    description:
      'Years remaining on the primary term. If the document states it, quote it and use "high". If you compute it ' +
      'from the expiration date, round to one decimal and use "medium".',
  },
  {
    path: 'lease.renewalOptions', section: 'lease', key: 'renewalOptions',
    label: 'Renewal Options', kind: 'string',
    description: 'Count and length of renewal options in the compact form "4 x 5yr". If there are none, this is not_found.',
  },
  {
    path: 'lease.rentEscalations', section: 'lease', key: 'rentEscalations',
    label: 'Rent Escalations', kind: 'string',
    description:
      'Escalation structure and amount in a short phrase, e.g. "10% every 5 years", "2% annually", ' +
      '"flat through primary term". Include escalations during option periods only if they differ.',
  },
  {
    path: 'lease.landlordResponsibilities', section: 'lease', key: 'landlordResponsibilities',
    label: 'Landlord Responsibilities', kind: 'string',
    description:
      'One short sentence summarising what the landlord remains responsible for. If the document states the ' +
      'landlord has no responsibilities, say exactly that.',
  },

  // -- Economics ------------------------------------------------------------
  {
    path: 'economics.askingPrice', section: 'economics', key: 'askingPrice',
    label: 'Asking Price', kind: 'number', unit: 'usd',
    description: 'List / asking price in whole US dollars as a plain number (e.g. 2145000).',
  },
  {
    path: 'economics.annualBaseRent', section: 'economics', key: 'annualBaseRent',
    label: 'Annual Base Rent / NOI', kind: 'number', unit: 'usd',
    description:
      'Current annual base rent in whole US dollars. If the document states NOI separately and it differs from ' +
      'base rent, use NOI and say so in the quote.',
  },
  {
    path: 'economics.capRate', section: 'economics', key: 'capRate',
    label: 'Cap Rate', kind: 'number', unit: 'percent', computable: true,
    description:
      'Capitalisation rate as a percentage number (6.25 means 6.25%, not 0.0625). If stated, use "high". ' +
      'If you compute it as NOI / price, round to two decimals and use "medium".',
  },
  {
    path: 'economics.pricePerSf', section: 'economics', key: 'pricePerSf',
    label: 'Price / SF', kind: 'number', unit: 'usd_per_sf', computable: true,
    description:
      'Price per building square foot in US dollars. If stated, use "high". If you compute it as price / building SF, ' +
      'round to two decimals and use "medium".',
  },
];

export const FIELD_COUNT = FIELD_SPECS.length;

export const FIELD_SPECS_BY_PATH: Readonly<Record<string, FieldSpec>> = Object.freeze(
  Object.fromEntries(FIELD_SPECS.map((s) => [s.path, s])),
);

export function fieldsForSection(section: SectionKey): FieldSpec[] {
  return FIELD_SPECS.filter((s) => s.section === section);
}

// ---------------------------------------------------------------------------
// Path helpers — used by the UI, the audit log and the eval harness
// ---------------------------------------------------------------------------

/** Reads an ExtractedField out of an extraction by dotted path. */
export function getField(
  extraction: NetLeaseExtraction,
  path: string,
): ExtractedField<unknown> | undefined {
  const [section, key] = path.split('.');
  const bucket = (extraction as unknown as Record<string, Record<string, unknown>>)[section];
  if (!bucket) return undefined;
  return bucket[key] as ExtractedField<unknown> | undefined;
}

/** Returns a copy of `extraction` with the field at `path` replaced. */
export function withField(
  extraction: NetLeaseExtraction,
  path: string,
  next: ExtractedField<unknown>,
): NetLeaseExtraction {
  const [section, key] = path.split('.');
  const clone = structuredClone(extraction) as unknown as Record<string, Record<string, unknown>>;
  if (!clone[section]) throw new Error(`Unknown section "${section}" in path "${path}"`);
  clone[section][key] = next;
  return clone as unknown as NetLeaseExtraction;
}

/** Every field in registry order, paired with its spec. */
export function allFields(
  extraction: NetLeaseExtraction,
): Array<{ spec: FieldSpec; field: ExtractedField<unknown> }> {
  return FIELD_SPECS.map((spec) => ({
    spec,
    field: getField(extraction, spec.path) ?? emptyField(),
  }));
}

export function emptyField<T>(): ExtractedField<T> {
  return { value: null, confidence: 'not_found', sourceQuote: null, sourceLocation: null, edited: false };
}

/** An extraction with every field empty — the shape a failed parse falls back to. */
export function emptyExtraction(): NetLeaseExtraction {
  const out: Record<string, Record<string, unknown>> = {};
  for (const spec of FIELD_SPECS) {
    out[spec.section] ??= {};
    out[spec.section][spec.key] = emptyField();
  }
  return out as unknown as NetLeaseExtraction;
}

// ---------------------------------------------------------------------------
// Completeness / triage
// ---------------------------------------------------------------------------

export interface CompletenessSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  notFound: number;
  edited: number;
  /** Paths a reviewer should look at first: low confidence or missing. */
  needsAttention: string[];
}

export function summarise(extraction: NetLeaseExtraction): CompletenessSummary {
  const summary: CompletenessSummary = {
    total: FIELD_SPECS.length, high: 0, medium: 0, low: 0, notFound: 0, edited: 0, needsAttention: [],
  };
  for (const { spec, field: f } of allFields(extraction)) {
    if (f.edited) summary.edited += 1;
    switch (f.confidence) {
      case 'high': summary.high += 1; break;
      case 'medium': summary.medium += 1; break;
      case 'low': summary.low += 1; summary.needsAttention.push(spec.path); break;
      case 'not_found': summary.notFound += 1; summary.needsAttention.push(spec.path); break;
    }
  }
  return summary;
}
