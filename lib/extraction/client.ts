import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt';
import { parseExtractionResponse } from './parse';
import { paragraphsToPrompt } from './pdf';
import { resolveAnchors, type AnchorStats } from './anchor';
import { allFields, emptyExtraction, getField, withField, type NetLeaseExtraction, type Confidence } from '@/shared/schema';
import type { DocumentParagraph, ExtractionMeta } from '@/shared/deal';

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/** Roughly 25k tokens of document per call — well inside limits, with headroom. */
const MAX_CHARS_PER_CHUNK = 90_000;
const MAX_OUTPUT_TOKENS = 8_192;

export class ExtractionError extends Error {
  constructor(message: string, readonly detail?: string[]) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractionOutcome {
  extraction: NetLeaseExtraction;
  meta: ExtractionMeta;
  anchors: AnchorStats;
}

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractionError('ANTHROPIC_API_KEY is not configured on the server.');
  }
  return new Anthropic({ apiKey });
}

export async function extractDeal(
  paragraphs: DocumentParagraph[],
  options: { fileName?: string; client?: Anthropic; model?: string } = {},
): Promise<ExtractionOutcome> {
  const client = options.client ?? getAnthropicClient();
  const model = options.model ?? DEFAULT_MODEL;
  const startedAt = Date.now();

  const chunks = chunkParagraphs(paragraphs);
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  const partials: NetLeaseExtraction[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const result = await extractChunk(client, model, chunk, {
      fileName: options.fileName,
      chunkIndex: index,
      chunkCount: chunks.length,
    });
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    attempts += result.attempts;
    partials.push(result.extraction);
  }

  const extraction = partials.length === 1 ? partials[0] : mergeExtractions(partials);
  const anchors = resolveAnchors(extraction, paragraphs);
  const durationMs = Date.now() - startedAt;

  const meta: ExtractionMeta = {
    model,
    inputTokens,
    outputTokens,
    durationMs,
    attempts,
    chunks: chunks.length,
  };

  // Token accounting is a demo stat worth seeing, and the anchor counts are the
  // cheapest early warning that the model started fabricating citations.
  console.log(
    `[artificer] extraction complete file=${options.fileName ?? 'unknown'} model=${model} ` +
      `chunks=${chunks.length} attempts=${attempts} in=${inputTokens} out=${outputTokens} ` +
      `ms=${durationMs} anchors=${anchors.resolved}/${anchors.cited} corrected=${anchors.corrected} ` +
      `unresolvable=${anchors.unresolvable}`,
  );

  return { extraction, meta, anchors };
}

// ---------------------------------------------------------------------------
// One chunk, with a single schema-repair retry
// ---------------------------------------------------------------------------

interface ChunkResult {
  extraction: NetLeaseExtraction;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

async function extractChunk(
  client: Anthropic,
  model: string,
  chunk: DocumentParagraph[],
  context: { fileName?: string; chunkIndex: number; chunkCount: number },
): Promise<ChunkResult> {
  const document = paragraphsToPrompt(chunk);
  const header = buildUserHeader(context);

  let inputTokens = 0;
  let outputTokens = 0;
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const userContent =
      attempt === 1
        ? `${header}\n\n<document>\n${document}\n</document>`
        : `${header}\n\n<document>\n${document}\n</document>\n\n` +
          `Your previous response could not be used. It failed validation with these errors:\n` +
          lastErrors.map((e) => `- ${e}`).join('\n') +
          `\n\nReturn the corrected JSON object only. No prose, no code fences, every schema key present.`;

    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userContent },
        // Prefilling the opening brace removes the model's easiest way to add
        // a preamble, which is the most common cause of a failed parse.
        { role: 'assistant', content: '{' },
      ],
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    const body = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const parsed = parseExtractionResponse(`{${body}`);
    if (parsed.ok) {
      return { extraction: parsed.data, inputTokens, outputTokens, attempts: attempt };
    }

    lastErrors = parsed.errors;
    console.warn(
      `[artificer] extraction attempt ${attempt} failed (${parsed.stage}): ${parsed.errors.slice(0, 5).join('; ')}`,
    );
  }

  throw new ExtractionError(
    'Claude returned data that did not match the deal schema, twice. The document may not be a net-lease deal document.',
    lastErrors,
  );
}

function buildUserHeader(context: { fileName?: string; chunkIndex: number; chunkCount: number }): string {
  const lines = [`Extract the net-lease deal data from the document below.`];
  if (context.fileName) lines.push(`Source file: ${context.fileName}`);
  if (context.chunkCount > 1) {
    lines.push(
      `This is part ${context.chunkIndex + 1} of ${context.chunkCount} of a long document. ` +
        `Extract only what this part supports; mark everything else "not_found". Another part will supply the rest.`,
    );
  }
  lines.push(`Every paragraph is tagged [p-N | page M]. Use those ids for "sourceLocation".`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Chunking and merging
// ---------------------------------------------------------------------------

/**
 * Splits on paragraph boundaries with one paragraph of overlap, so a fact that
 * straddles a boundary is still fully visible in at least one chunk.
 */
export function chunkParagraphs(
  paragraphs: DocumentParagraph[],
  maxChars = MAX_CHARS_PER_CHUNK,
): DocumentParagraph[][] {
  const total = paragraphs.reduce((n, p) => n + p.text.length, 0);
  if (total <= maxChars || paragraphs.length <= 1) return [paragraphs];

  const chunks: DocumentParagraph[][] = [];
  let current: DocumentParagraph[] = [];
  let size = 0;

  for (const paragraph of paragraphs) {
    if (size + paragraph.text.length > maxChars && current.length > 0) {
      chunks.push(current);
      const overlap = current[current.length - 1];
      current = [overlap];
      size = overlap.text.length;
    }
    current.push(paragraph);
    size += paragraph.text.length;
  }
  if (current.length) chunks.push(current);

  return chunks;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1, not_found: 0 };

/**
 * Field-by-field, the best-supported answer wins. Ties go to the earlier chunk,
 * which in an offering memo is usually the summary page — the most authoritative
 * statement of a figure.
 */
export function mergeExtractions(partials: NetLeaseExtraction[]): NetLeaseExtraction {
  if (partials.length === 0) return emptyExtraction();

  let merged = emptyExtraction();
  for (const { spec } of allFields(merged)) {
    let best = getField(merged, spec.path)!;
    for (const partial of partials) {
      const candidate = getField(partial, spec.path);
      if (!candidate) continue;
      if (CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[best.confidence]) best = candidate;
    }
    merged = withField(merged, spec.path, best);
  }
  return merged;
}
