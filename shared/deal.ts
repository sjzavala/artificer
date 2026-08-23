import type { NetLeaseExtraction } from './schema';

/**
 * Records that flow through Artificer's one workflow:
 * upload -> extract -> human review -> approve/reject -> (optional) OM draft.
 */

export type DealStatus = 'extracted' | 'approved' | 'rejected';

/**
 * A stable, addressable chunk of the source document. The approval screen
 * renders these in order and scrolls to `id` when a field is clicked, which is
 * why anchors are assigned once at extraction time and never recomputed.
 */
export interface DocumentParagraph {
  id: string;
  page: number;
  text: string;
}

export interface ExtractionMeta {
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** 1 on a clean parse, 2 when the schema-repair retry was needed. */
  attempts: number;
  chunks: number;
}

export interface SourceDocument {
  fileName: string;
  byteSize: number;
  pageCount: number;
  charCount: number;
  paragraphs: DocumentParagraph[];
}

export type SalesforceMode = 'mock' | 'real';

export interface SalesforceWriteResult {
  mode: SalesforceMode;
  writtenAt: string;
  /** True when an existing record set was updated rather than created. */
  updated: boolean;
  propertyId: string;
  tenantId: string;
  leaseId: string;
  dealId: string;
  /** Present in real mode so the UI can link out to the org. */
  instanceUrl?: string;
}

export interface Rejection {
  reason: string;
  by: string;
  at: string;
}

export interface OmDraft {
  markdown: string;
  generatedAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Deal {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: DealStatus;
  /** Stable hash of the approved business values; drives idempotent writes. */
  dealHash: string | null;
  document: SourceDocument;
  extraction: NetLeaseExtraction;
  /**
   * The extraction exactly as Claude produced it, frozen at intake. Human edits
   * only ever touch `extraction`, so this stays available to show what the AI
   * originally said — provenance for the correction, not just for the value.
   */
  originalExtraction: NetLeaseExtraction;
  extractionMeta: ExtractionMeta;
  salesforce?: SalesforceWriteResult;
  rejection?: Rejection;
  omDraft?: OmDraft;
  /** True for the deal planted by `npm run seed` so the app is never empty. */
  seeded?: boolean;
}

/** Lightweight projection for the deals list — avoids shipping document text. */
export interface DealSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: DealStatus;
  fileName: string;
  tenantTradeName: string | null;
  addressLine: string | null;
  askingPrice: number | null;
  capRate: number | null;
  needsAttention: number;
  highConfidence: number;
  totalFields: number;
  seeded: boolean;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'document_uploaded',
  'extraction_completed',
  'extraction_failed',
  'field_edited',
  'deal_approved',
  'deal_rejected',
  'om_draft_generated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  /** ISO-8601 timestamp. Entries are appended, never mutated or removed. */
  at: string;
  dealId: string | null;
  /** The reviewer name set once in the UI. The access gate is the only auth. */
  actor: string;
  action: AuditAction;
  /** One-line human-readable summary rendered on the audit timeline. */
  summary: string;
  details?: Record<string, unknown>;
}
