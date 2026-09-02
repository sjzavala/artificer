import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, describeApiError, getAnthropicClient } from '@/lib/extraction/client';
import { BUYER_STATUSES, CAPITAL_SOURCES, IDENTIFICATION_DAYS } from '@/shared/buyer';
import { GUARANTOR_TYPES, PROPERTY_TYPES } from '@/shared/schema';
import { normalizeQuery } from './queries';
import { SORT_KEYS, type BuyerQuery } from './types';

export { AI_QUERY_MAX_LENGTH } from './types';

/**
 * Natural language into a structured search.
 *
 * The translator, not a chat: one turn, one forced tool call, and the result is
 * a set of filters the user can see and edit. That shape is deliberate — the
 * model proposes the filters and the controls show what it chose, which is the
 * same bargain the extraction screen makes.
 *
 * It earns its place here in a way it would not on a simpler list. "Buyers with
 * two million to place who need to identify inside a month" spans three fields
 * and a date calculation, and nobody wants to assemble that from dropdowns.
 */

/**
 * The tool is the schema. Forcing a call to it is what turns free text into
 * fields — the model has no route by which to return prose instead.
 *
 * The enums come from the domain modules rather than being retyped, so a new
 * property type reaches the model, the database constraint and the UI from one
 * edit.
 */
const SEARCH_TOOL: Anthropic.Tool = {
  name: 'search_buyers',
  description:
    'Search the brokerage’s buyer pipeline. Call this once with whatever the ' +
    'request actually constrains, and omit everything it does not mention.',
  input_schema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description:
          'Part of a buying entity’s name or the contact’s name, if one is named. Names only — this does not search markets, emails or anything else.',
      },
      status: {
        type: 'string',
        enum: [...BUYER_STATUSES],
        description:
          'Where the buyer sits in the pipeline. "active" means still looking; "under contract" means they are in escrow on something.',
      },
      capitalSource: {
        type: 'string',
        enum: [...CAPITAL_SOURCES],
        description:
          'How the purchase is funded. "1031 exchange" buyers are the ones with statutory deadlines; "institutional" means a fund or REIT rather than a private investor.',
      },
      market: {
        type: 'string',
        description:
          'A single two-letter USPS state code, upper case, matched against the states the buyer will buy in. Convert a spelled-out state ("California" → "CA"). For a region, pick the single most representative state and say so in your interpretation.',
      },
      propertyType: {
        type: 'string',
        enum: [...PROPERTY_TYPES],
        description: 'An asset class the buyer will consider.',
      },
      minGuarantor: {
        type: 'string',
        enum: [...GUARANTOR_TYPES],
        description:
          'The weakest lease guaranty the buyer accepts. "corporate" is the investment-grade end — a buyer who will only take corporate-guaranteed deals. "none" means they will take an unguaranteed lease.',
      },
      minEquity: {
        type: 'integer',
        description:
          'Minimum equity available to deploy, in whole dollars ("$2M" → 2000000). The bound is inclusive: a buyer with exactly this much is included, so "at least $2M" is 2000000 and a strict "more than $2M" is 2000001.',
      },
      identifyWithinDays: {
        type: 'integer',
        description:
          `Only 1031 buyers whose ${IDENTIFICATION_DAYS}-day identification deadline falls between today and this many days out. Use it for urgency questions — "running out of time" is about 14, "this month" about 30. Buyers whose window has already closed are never returned.`,
      },
      sortBy: {
        type: 'string',
        enum: [...SORT_KEYS],
        description:
          'Ordering. "equity" is largest first, "identifyBy" is soonest deadline first, "addedOn" is most recently added first, "entityName" is A–Z, "id" is the default order.',
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
  'You turn a net-lease broker’s question into filters over their buyer pipeline.',
  '',
  'Call search_buyers exactly once. Set only the parameters the request actually',
  'constrains — an unmentioned filter must be omitted, never guessed.',
  '',
  'A buyer is an investor looking to acquire single-tenant net-leased property.',
  'Each has a buying entity and a contact, a capital source, equity available, a',
  'target cap rate band, the asset classes and states they buy in, the weakest',
  'lease guaranty they will accept, and a pipeline status. A buyer in a 1031',
  `exchange also has a clock: ${IDENTIFICATION_DAYS} days from their sale closing to identify`,
  'replacement property in writing, and 180 to close.',
  '',
  'Some requests cannot be expressed by these filters: there is no cap-rate',
  'filter, no maximum equity, no closing-deadline filter and no way to search by',
  'email or by how long someone has been in the pipeline. When you meet one, set',
  'the parameters you can and say which part you could not apply. Do not',
  'substitute a filter that approximates it.',
].join('\n');

export interface AiQueryOutcome {
  query: BuyerQuery;
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
      // Translating one line into a handful of fields does not need
      // deliberation, and this sits behind a search box where latency is the
      // whole experience.
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
    // is input like any other: an invented status or an out-of-range number is
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
 * Going through URLSearchParams rather than building a BuyerQuery directly is
 * what guarantees the AI path and the typed-in path are validated by exactly
 * the same code, instead of by two functions that agree until one is edited.
 */
function toSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const keys = [
    'q',
    'status',
    'capitalSource',
    'market',
    'propertyType',
    'minGuarantor',
    'minEquity',
    'identifyWithinDays',
    'sortBy',
  ] as const;

  for (const key of keys) {
    const value = input[key];
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params;
}
