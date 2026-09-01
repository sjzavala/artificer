import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, describeApiError, getAnthropicClient } from '@/lib/extraction/client';
import { normalizeQuery } from './queries';
import { BORROWER_STATUSES, SORT_KEYS, type BorrowerQuery } from './types';

export { AI_QUERY_MAX_LENGTH } from './types';

/**
 * Natural language into a structured search.
 *
 * The translator, not a chat: one turn, one forced tool call, and the result is
 * a set of filters the user can see and edit. That shape is deliberate — the
 * model proposes the filters and the controls show what it chose, which is the
 * same bargain the extraction screen makes. An answer nobody can inspect is not
 * something a lender should act on.
 */

/**
 * The tool is the schema. Forcing a call to it is what turns free text into
 * fields — the model has no route by which to return prose instead.
 *
 * Every parameter is optional: "show me the Smiths" should set a name and
 * nothing else, and a model obliged to fill in a status would invent one.
 */
const SEARCH_TOOL: Anthropic.Tool = {
  name: 'search_borrowers',
  description:
    'Search and filter the loan borrower book. Call this once with whatever the ' +
    "request actually constrains, and omit everything it does not mention.",
  input_schema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description:
          "A borrower's first or last name, if one is named. Names only — this does not search email addresses, states or any other field.",
      },
      status: {
        type: 'string',
        enum: [...BORROWER_STATUSES],
        description:
          'The application status. "Withdrawn" means the borrower pulled out; there is no "under review" status.',
      },
      state: {
        type: 'string',
        description:
          'Two-letter US state code, upper case. Convert a spelled-out state ("California" → "CA").',
      },
      minScore: {
        type: 'integer',
        description:
          'Minimum credit score, 300–850. The bound is inclusive: a borrower scoring exactly this number is included, so "at least 700" is 700 and a strict "above 700" is 701.',
      },
      sortBy: {
        type: 'string',
        enum: [...SORT_KEYS],
        description:
          'Ordering. creditScore, loanAmount and submittedAt sort highest or most recent first; lastName sorts A–Z; id is the default order.',
      },
      interpretation: {
        type: 'string',
        description:
          'One short sentence, addressed to the user, restating the filters you chose. Say so plainly if part of the request could not be expressed.',
      },
    },
    required: ['interpretation'],
  },
};

const SYSTEM_PROMPT = [
  'You turn a loan officer’s question into filters for a borrower search.',
  '',
  'Call search_borrowers exactly once. Set only the parameters the request actually',
  'constrains — an unmentioned filter must be omitted, never guessed.',
  '',
  'The book holds sixty borrowers, each with a name, email, SSN, credit score, loan',
  'amount, US state, application status and submission date.',
  '',
  'Some requests cannot be expressed by these filters: there is no maximum credit',
  'score, no loan-amount filter, no date range and no email search. When you meet',
  'one, set the parameters you can, and say which part you could not apply in your',
  'interpretation. Do not substitute a filter that approximates it.',
].join('\n');

export interface AiQueryOutcome {
  /** Validated filters, ready to drive the search. */
  query: BorrowerQuery;
  /** The model's one-line account of what it did, shown to the user. */
  interpretation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiQueryError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = 'AiQueryError';
  }
}

export async function translateQuery(
  text: string,
  options: { client?: Anthropic; model?: string } = {},
): Promise<AiQueryOutcome> {
  const client = options.client ?? getAnthropicClient();
  const model = options.model ?? DEFAULT_MODEL;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [SEARCH_TOOL],
      // Forced, so the reply is a tool call rather than a sentence about one.
      tool_choice: { type: 'tool', name: SEARCH_TOOL.name },
      // Translating one line into five fields does not need deliberation, and
      // this sits behind a search box where latency is the whole experience.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: text }],
    });
  } catch (error) {
    const described = describeApiError(error);
    throw new AiQueryError(described ?? 'Could not reach the Anthropic API. Try again shortly.');
  }

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === SEARCH_TOOL.name,
  );
  if (!call) {
    throw new AiQueryError('The model did not return a search. Try rephrasing the question.');
  }

  const input = call.input as Record<string, unknown>;

  return {
    // Straight through the same validator the URL parameters use. Model output
    // is input like any other: an out-of-range score or an invented status is
    // dropped here rather than reaching SQL.
    query: normalizeQuery(toSearchParams(input)),
    interpretation:
      typeof input.interpretation === 'string' && input.interpretation.trim()
        ? input.interpretation.trim()
        : 'Applied the filters below.',
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * The tool call, re-expressed as query parameters.
 *
 * Going through URLSearchParams rather than building a BorrowerQuery directly
 * is what guarantees the AI path and the typed-in path are validated by exactly
 * the same code, instead of by two functions that agree until one is edited.
 */
function toSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['q', 'status', 'state', 'minScore', 'sortBy'] as const) {
    const value = input[key];
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params;
}
