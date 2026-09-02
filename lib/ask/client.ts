import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, describeApiError, getAnthropicClient } from '@/lib/extraction/client';
import { paragraphsToPrompt } from '@/lib/extraction/pdf';
import { resolveAnchor } from '@/lib/extraction/anchor';
import type { DocumentParagraph } from '@/shared/deal';
import type { AskOutcome, Citation } from './types';

/**
 * Ask a question of one deal document.
 *
 * Two things make this different from a chat-with-your-PDF box.
 *
 * The first is that citations are *verified*. The model returns a quote and
 * where it thinks the quote lives; we search the document for that quote and
 * keep the citation only if it is actually there. A model that invents a
 * plausible passage gets its citation dropped, and an answer whose every
 * citation was invented is reported as unsupported rather than rendered as
 * fact. `resolveAnchor` is the same function the extraction pipeline uses, so
 * a quote here is held to exactly the standard a field value is.
 *
 * The second is that the document is cached. A lease is most of the prompt and
 * it does not change between questions, so it sits in its own cached block and
 * only the question varies — the difference between paying for the whole
 * document on every question and paying for it once.
 */

const MAX_OUTPUT_TOKENS = 2_048;

const SYSTEM_PROMPT = [
  'You answer questions about a single commercial real-estate document — an offering',
  'memorandum, a lease, an LOI — for a net-lease broker who will act on the answer.',
  '',
  'Every substantive claim must be supported by a passage from the document. Quote the',
  'passage exactly as it appears, character for character; do not tidy punctuation,',
  'expand an abbreviation, join two sentences, or paraphrase. A quote that is not a',
  'literal substring of the document cannot be verified and will be discarded.',
  '',
  'Mark each claim in your answer with the marker of the citation supporting it, like',
  '[1]. Number citations from 1 in the order they first appear.',
  '',
  'If the document does not answer the question, set answered to false and say what the',
  'document does cover that is adjacent. Do not reason from general knowledge of how',
  'net-lease deals usually work — the reader needs to know what *this* document says.',
  'Saying "the document does not state this" is a useful answer; guessing is not.',
  '',
  'Be brief. A broker reading this has the document open next to it.',
].join('\n');

const ANSWER_TOOL: Anthropic.Tool = {
  name: 'answer_from_document',
  description: 'Answer the question using only the supplied document, with verifiable citations.',
  input_schema: {
    type: 'object',
    properties: {
      answered: {
        type: 'boolean',
        description: 'False when the document does not address the question at all.',
      },
      answer: {
        type: 'string',
        description:
          'The answer in prose, carrying [n] markers that match the citations. When answered is false, explain what the document does not say.',
      },
      citations: {
        type: 'array',
        description: 'The passages supporting the answer. Empty when answered is false.',
        items: {
          type: 'object',
          properties: {
            marker: { type: 'integer', description: 'The [n] marker this passage supports.' },
            quote: {
              type: 'string',
              description:
                'The supporting text, copied exactly from the document. A near-miss is treated as a fabrication.',
            },
            sourceLocation: {
              type: 'string',
              description: 'The paragraph id the quote came from, e.g. "p-34".',
            },
          },
          required: ['marker', 'quote', 'sourceLocation'],
        },
      },
    },
    required: ['answered', 'answer'],
  },
};

export class AskError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = 'AskError';
  }
}

export async function askDocument(
  question: string,
  paragraphs: DocumentParagraph[],
  options: { client?: Anthropic; model?: string; fileName?: string } = {},
): Promise<AskOutcome> {
  const client = options.client ?? getAnthropicClient();
  const model = options.model ?? DEFAULT_MODEL;
  const startedAt = Date.now();

  const document = paragraphsToPrompt(paragraphs);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [ANSWER_TOOL],
      tool_choice: { type: 'tool', name: ANSWER_TOOL.name },
      // Reading a lease closely is not a low-effort task, but this sits in front
      // of someone waiting for an answer. Medium is the balance.
      output_config: { effort: 'medium' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `The document${options.fileName ? ` (${options.fileName})` : ''}. Every paragraph is ` +
                `tagged [p-N | page M]; use those ids for sourceLocation.\n\n` +
                `<document>\n${document}\n</document>`,
              // The document is the stable prefix and the question is not, so
              // the cache boundary goes here. Everything before this block —
              // the tool definition and the system prompt — is stable too, so
              // the whole prefix is reused. A short document may fall under the
              // model's minimum cacheable length and simply not cache; that
              // costs nothing beyond the saving not arriving.
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: `Question: ${question}` },
          ],
        },
      ],
    });
  } catch (error) {
    const described = describeApiError(error);
    throw new AskError(described ?? 'Could not reach the Anthropic API. Try again shortly.');
  }

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === ANSWER_TOOL.name,
  );
  if (!call) {
    throw new AskError('The model did not return an answer. Try rephrasing the question.');
  }

  const raw = call.input as {
    answered?: unknown;
    answer?: unknown;
    citations?: unknown;
  };

  const answered = raw.answered === true;
  const answerText = typeof raw.answer === 'string' ? raw.answer.trim() : '';

  const { citations, dropped } = verifyCitations(raw.citations, paragraphs);

  // Markers whose citation did not survive would point at nothing, so they are
  // stripped rather than left dangling in the prose.
  const kept = new Set(citations.map((c) => c.marker));
  const cleaned = stripOrphanMarkers(answerText, kept);

  const usage = response.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };

  const outcome: AskOutcome = {
    answered,
    answer: cleaned || 'The model returned an empty answer.',
    citations,
    // The model claimed an answer, offered support for it, and none of the
    // support was real.
    unsupported: answered && dropped > 0 && citations.length === 0,
    droppedCitations: dropped,
    model: response.model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    durationMs: Date.now() - startedAt,
  };

  console.log(
    `[artificer] ask model=${outcome.model} in=${outcome.inputTokens} out=${outcome.outputTokens} ` +
      `cacheWrite=${outcome.cacheCreationTokens} cacheRead=${outcome.cacheReadTokens} ` +
      `ms=${outcome.durationMs} answered=${outcome.answered} ` +
      `cited=${citations.length} dropped=${dropped}`,
  );

  return outcome;
}

/**
 * Keeps only the citations whose quote genuinely appears in this document.
 *
 * The model's own `sourceLocation` is a hint, not an answer: `resolveAnchor`
 * checks the reported paragraph first and then the rest of the document, so a
 * real quote filed under the wrong id is corrected rather than discarded, and
 * an invented one is discarded rather than displayed.
 */
function verifyCitations(
  raw: unknown,
  paragraphs: DocumentParagraph[],
): { citations: Citation[]; dropped: number } {
  if (!Array.isArray(raw)) return { citations: [], dropped: 0 };

  const citations: Citation[] = [];
  let dropped = 0;

  for (const entry of raw) {
    const candidate = entry as { marker?: unknown; quote?: unknown; sourceLocation?: unknown };
    const quote = typeof candidate.quote === 'string' ? candidate.quote.trim() : '';
    const marker = Number(candidate.marker);
    if (!quote || !Number.isInteger(marker)) {
      dropped += 1;
      continue;
    }

    const reported = typeof candidate.sourceLocation === 'string' ? candidate.sourceLocation : null;
    const { anchorId, modelAnchorCorrect } = resolveAnchor(quote, reported, paragraphs);

    if (!anchorId) {
      dropped += 1;
      continue;
    }

    citations.push({ marker, quote, sourceLocation: anchorId, modelAnchorCorrect });
  }

  // One passage per marker; a repeat is the model citing the same place twice.
  const seen = new Set<number>();
  const unique = citations.filter((c) => (seen.has(c.marker) ? false : (seen.add(c.marker), true)));

  return { citations: unique.sort((a, b) => a.marker - b.marker), dropped };
}

/** Removes `[n]` markers with no surviving citation, and tidies the space they leave. */
export function stripOrphanMarkers(text: string, keep: Set<number>): string {
  return text
    .replace(/\[(\d+)\]/g, (match, digits) => (keep.has(Number(digits)) ? match : ''))
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
