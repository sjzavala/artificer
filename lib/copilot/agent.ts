import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, describeApiError, getAnthropicClient } from '@/lib/extraction/client';
import { runTool, TOOLS } from './tools';
import type { CopilotReply, CopilotTurn, ToolRun } from './types';

/**
 * The agent loop.
 *
 * Written out rather than delegated to a helper, because the interesting part
 * is what happens between the turns: every tool result is kept so the UI can
 * show what was looked up, and the loop is bounded so a model that keeps asking
 * for one more thing stops rather than spending the afternoon.
 */

/**
 * Enough lookups to actually work a question — check a deal, read its fields,
 * match the book, then chase a detail in the document — rather than only enough
 * for a single hop. A ceiling still exists so a model that keeps asking for one
 * more thing stops, but six was low enough that ordinary broker questions hit
 * it.
 */
const MAX_ITERATIONS = 12;
const MAX_OUTPUT_TOKENS = 4_096;

const SYSTEM_PROMPT = [
  'You are a net-lease brokerage assistant, working alongside a broker over their own',
  'deals, their documents, their buyer pipeline and their audit trail.',
  '',
  'Behave like a capable colleague, not a search box. A broker will ask you things that do',
  'not map onto a single lookup — what is worth worrying about in a deal, how to position',
  'it, what to say to a buyer, what a set of numbers adds up to. Answer those. Look up what',
  'you need, then think about it.',
  '',
  '## Two kinds of statement, held to different standards',
  '',
  'A **fact about their business** — a buyer, a deal, a figure, a date, a lease term, who',
  'did something and when — comes from a tool or you do not say it. Never invent one, never',
  'estimate one, never carry one over from what a deal like this usually looks like. If a',
  'lookup did not return it, say it is not in the system.',
  '',
  '**Your own analysis** — what the facts imply, what looks risky, how to approach a buyer,',
  'a draft of an email, a judgement about whether something is a good idea — is welcome and',
  'is what makes you useful. Give it. Just make clear it is your read rather than something',
  'you retrieved, and ground it in the facts you actually looked up.',
  '',
  'The line is the source, not the subject. "The cap rate is 6.75%" needs a tool. "6.75% on',
  'a corporate-guaranteed Dollar General with eight years left is a defensible number, and',
  'the short remaining term is the thing a buyer will push on" is yours to say, provided the',
  'cap rate, the guaranty and the term came from a lookup.',
  '',
  '## Working the question',
  '',
  'Look things up rather than recalling them — you do not know this pipeline, the tools do.',
  'Chain them when a question needs it: find the deal, read its fields, match the book,',
  'check the document for the clause that decides it. Several small lookups beat one guess.',
  '',
  'get_deal_fields before ask_deal_document whenever the extraction already covers it. Those',
  'values have been graded and often reviewed by a person, and reading the PDF again to',
  'rediscover them is slower and less trustworthy than the answer already on file.',
  '',
  'For "who do I call about this deal", use match_buyers_to_deal. Report the near misses too,',
  'and which single test they failed — a buyer a quarter point outside the band is a phone',
  'call, not a rejection.',
  '',
  'A confidence grade is part of the fact. "Low" or "not found" on a value you are relying on',
  'is worth saying out loud, and a match made without knowing the guarantor is a weaker claim',
  'than one made knowing it.',
  '',
  '## What you cannot do',
  '',
  'You cannot change anything — no status, no field, no approval. Every write in Artificer is',
  'a person clicking a button. Say so plainly if asked, and offer to look up whatever would',
  'help them do it.',
  '',
  'The one thing you can see outside this workspace is the NNN Pro marketplace, through',
  'search_market_listings. Reach for it whenever the question is about property that is not',
  'already theirs: what is for sale, what exists in a market, what a tenant type is being',
  'offered at, where a deal sits in that range. "What Dollar Generals are in Texas" is a',
  'question about the market, not about their pipeline — check the marketplace, and check',
  'the pipeline too only if it is genuinely ambiguous which they meant.',
  '',
  'When their own pipeline has nothing, that is rarely the whole answer. Look at the market',
  'before concluding there is nothing to say.',
  '',
  'Those listings are asking prices on property currently for sale. They are not closed',
  'sales, and the difference matters: a seller asking 6.75% is evidence about the market,',
  'not proof of it. Say "currently listed at" rather than "trading at", and never present a',
  'listing range as what something is worth. You still have no closed comps, no rent surveys',
  'and nothing else outside this system — be straight about that rather than filling the gap.',
  '',
  '## Length and format',
  '',
  'Be short. A broker is deciding who to phone, not reading a report, and every extra',
  'sentence is time they spend waiting for the screen. Most answers are two or three',
  'sentences. A long one is a short paragraph and a list.',
  '',
  'Lead with the answer in the first line — the name, the number, the recommendation. Then',
  'only what is needed to act on it.',
  '',
  'Write for a broker, not an engineer. No internal identifiers — say "the Dollar General"',
  'rather than a deal id, "page 3" rather than a paragraph tag, and give a confidence grade',
  'in words ("the document does not state it") rather than as a code. Mention an id only if',
  'you are asked for one.',
  '',
  'Write prose and short lists. No section headings, no horizontal rules, no bold on every',
  'other phrase. Use a table only when genuinely comparing several things across the same',
  'columns, and keep it to the columns that decide something. Do not restate a lookup that',
  'is already shown above your answer — the broker can open it.',
  '',
  'Say the figure that matters and stop. "Ironwood fits — 6.75% is inside their 6.25–7.25%',
  'band, they buy Ohio retail, and they have the equity" beats the same content under three',
  'headings.',
].join('\n');

export class CopilotError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = 'CopilotError';
  }
}

export async function runCopilot(
  history: CopilotTurn[],
  question: string,
  options: { client?: Anthropic; model?: string } = {},
): Promise<CopilotReply> {
  const client = options.client ?? getAnthropicClient();
  const model = options.model ?? DEFAULT_MODEL;
  const startedAt = Date.now();

  // Prior turns are replayed as plain text. The tool traffic that produced them
  // is deliberately not replayed: it is large, it is already summarised in the
  // assistant's own words, and resending it would push a long conversation into
  // the context window for no gain in what the model can answer.
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
  messages.push({ role: 'user', content: question });

  const toolRuns: ToolRun[] = [];
  /** Where the wall clock actually goes, per turn — model time versus lookups. */
  const timings: string[] = [];
  let modelMs = 0;
  let toolMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let answer = '';
  let truncated = true;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let response: Anthropic.Message;
    const turnStarted = Date.now();
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // The tool list and the instructions are identical on every turn and on
        // every request, so they are the natural cached prefix.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        output_config: { effort: 'medium' },
        messages,
      });
    } catch (error) {
      const described = describeApiError(error);
      throw new CopilotError(described ?? 'Could not reach the Anthropic API. Try again shortly.');
    }

    const thisTurnMs = Date.now() - turnStarted;
    modelMs += thisTurnMs;
    timings.push(`t${iteration + 1}=${thisTurnMs}ms/${response.usage.output_tokens}tok`);

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    const usage = response.usage as Anthropic.Usage & {
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (calls.length === 0) {
      answer = text;
      truncated = false;
      break;
    }

    // Keep the model's own turn intact — the tool_use blocks have to come back
    // exactly as sent, or the tool results have nothing to attach to.
    messages.push({ role: 'assistant', content: response.content });

    // Calls in one turn are independent, so they run together. All their results
    // go back in a single user message: splitting them across several messages
    // teaches the model to stop asking for more than one thing at a time.
    const toolsStarted = Date.now();
    const settled = await Promise.all(
      calls.map(async (call) => ({
        call,
        run: await runTool(call.name, (call.input ?? {}) as Record<string, unknown>),
      })),
    );
    const thisToolMs = Date.now() - toolsStarted;
    toolMs += thisToolMs;
    timings.push(`tools(${calls.length})=${thisToolMs}ms`);

    const results: Anthropic.ToolResultBlockParam[] = settled.map(({ call, run }) => {
      toolRuns.push(run);
      return {
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(run.result),
        ...(run.ok ? {} : { is_error: true }),
      };
    });

    messages.push({ role: 'user', content: results });

    // Keep whatever the model said alongside its calls, so a run that hits the
    // ceiling still has something to show rather than nothing.
    if (text) answer = text;
  }

  const reply: CopilotReply = {
    answer:
      answer ||
      'I could not finish that one. Try asking it in smaller pieces — a single deal, or a single question about the pipeline.',
    toolRuns,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    durationMs: Date.now() - startedAt,
    truncated,
  };

  console.log(
    `[artificer] copilot model=${model} tools=${toolRuns.map((t) => t.name).join(',') || 'none'} ` +
      `in=${inputTokens} out=${outputTokens} cacheRead=${cacheReadTokens} ` +
      `ms=${reply.durationMs} model=${modelMs}ms tools=${toolMs}ms truncated=${truncated} ` +
      `[${timings.join(' ')}]`,
  );

  return reply;
}
