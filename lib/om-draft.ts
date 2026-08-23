import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, getAnthropicClient } from './extraction/client';
import { FIELD_SPECS, getField, type NetLeaseExtraction } from '@/shared/schema';
import { formatValue } from './format';
import type { Deal } from '@/shared/deal';

/**
 * Drafts an offering-memo summary from the *approved record* — never from the
 * original document.
 *
 * That distinction is the whole point: by this stage a human has reviewed every
 * value, so the draft is grounded in reviewed data rather than in whatever the
 * model thought the PDF said. It also means the draft cannot reintroduce a
 * figure the reviewer corrected.
 */

const SYSTEM_PROMPT = `You are a net-lease investment sales analyst drafting the summary section of an offering memorandum.

You will be given the approved, human-reviewed deal record for a single-tenant net-lease property. Write a professional deal summary from it.

Structure your response as markdown with exactly these sections, in this order:

## Investment Highlights
Between five and seven bullets. Lead with what a net-lease buyer actually underwrites: lease structure and landlord burden, tenant and guarantor credit, remaining term, rent escalations, and location or real-estate quality. Each bullet is one sentence, specific, and quantified wherever the record supports it.

## Property Overview
One paragraph on the physical asset: address, property type, building size, site size, year built, and anything the record says about construction or configuration.

## Tenant & Lease Overview
One paragraph covering the tenant, the legal entity on the lease, the guarantor and the strength of that guaranty, then the lease structure, term, expiration, renewal options and escalations.

## Deal Economics
A markdown table with the columns "Metric" and "Value". Include price, annual base rent / NOI, cap rate, price per square foot, and remaining term. Format money with a dollar sign and thousands separators, and cap rate as a percentage.

Rules that are not negotiable:

1. Every factual claim must trace to a value in the record. You know a great deal about these tenants from outside this document, and none of it may appear here. Do not state that a company is publicly traded, Fortune 500, investment grade, the largest in its sector, or how many locations it operates, unless the record itself says so. If the record gives you a guarantor name and nothing more, the guarantor is that name and nothing more.
2. A field marked "not stated" is genuinely unknown. Do not fill it in, estimate it, or imply it. Omit the point, or say the record does not state it.
3. Do not describe a guaranty the record does not show, and never upgrade a franchisee or personal guaranty to a corporate one.
4. Do not add market commentary, demographics, traffic counts, comparable sales, submarket analysis or tenant history. None of that is in the record.
5. Characterising what IS in the record is fine — calling a 2019 building recently constructed, or a 15-year term long — as long as the underlying fact is present.
6. Write in the measured register of an institutional offering memorandum. No marketing superlatives, no exclamation marks, no emoji.
7. Output the markdown only. No preamble, no closing commentary, and no horizontal rules.`;

export interface OmDraftResult {
  markdown: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateOmDraft(
  deal: Deal,
  options: { client?: Anthropic; model?: string } = {},
): Promise<OmDraftResult> {
  const client = options.client ?? getAnthropicClient();
  const model = options.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 2_000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderRecord(deal) }],
  });

  const markdown = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  console.log(
    `[artificer] om draft generated deal=${deal.id} model=${model} ` +
      `in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
  );

  return {
    markdown: stripFences(markdown),
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Renders the approved record as a flat, labelled list. Missing values are
 * stated as "not stated" rather than omitted, so the model sees the gap
 * explicitly instead of inferring the field was never relevant.
 */
export function renderRecord(deal: Deal): string {
  const lines = [
    'Approved net-lease deal record.',
    `Source document: ${deal.document.fileName}`,
    '',
    ...FIELD_SPECS.map((spec) => {
      const field = getField(deal.extraction, spec.path);
      const value = field?.value ?? null;
      const rendered = value === null ? 'not stated' : formatValue(value, spec);
      const reviewed = field?.edited ? ' (corrected by the reviewer)' : '';
      return `${spec.label}: ${rendered}${reviewed}`;
    }),
    '',
    'Write the offering memorandum summary for this deal.',
  ];
  return lines.join('\n');
}

/** The prompt forbids fences, but a stray wrapper must not reach the preview. */
function stripFences(markdown: string): string {
  const fenced = markdown.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/);
  return (fenced ? fenced[1] : markdown).trim();
}

/** Convenience for callers that only have an extraction, e.g. the eval harness. */
export function recordSummaryLines(extraction: NetLeaseExtraction): string[] {
  return FIELD_SPECS.map((spec) => {
    const value = getField(extraction, spec.path)?.value ?? null;
    return `${spec.label}: ${value === null ? 'not stated' : formatValue(value, spec)}`;
  });
}
