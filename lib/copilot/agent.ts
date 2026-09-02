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

const MAX_ITERATIONS = 6;
const MAX_OUTPUT_TOKENS = 4_096;

const SYSTEM_PROMPT = [
  'You are a net-lease brokerage assistant. You work for the broker reading your answer,',
  'over their own deals and their own buyer pipeline.',
  '',
  '## What you can see',
  '',
  'Four tools, all of them reads. You cannot change anything — no status, no field, no',
  'approval — and you should say so plainly if asked to. Every write in this system is a',
  'person clicking a button, deliberately.',
  '',
  '## How to answer',
  '',
  'Look things up rather than recalling them. You do not know this pipeline; the tools do.',
  'If a question needs a deal id you do not have, call list_deals first rather than',
  'guessing at one.',
  '',
  'For "who should I call about this deal", use match_buyers_to_deal. It scores the whole',
  'book on cap rate, market, asset class, guaranty and capital, and returns the reasoning',
  'for each. Report near misses too, and say which single test they failed — a buyer who',
  'missed the cap rate band by a quarter point is a phone call, not a rejection.',
  '',
  'For questions about a lease or memo — clauses, obligations, termination rights — use',
  'ask_deal_document. Its passages have been checked against the document. Quote them when',
  'they carry the answer.',
  '',
  '## What not to do',
  '',
  'Do not invent a buyer, a deal, a figure or a lease term. Everything you state comes from',
  'a tool result or you do not state it.',
  '',
  'When a tool reports that a deal fact was not stated in the document, say so rather than',
  'letting the reader assume it was checked. A match made without knowing the guarantor is',
  'a weaker claim than one made knowing it, and the broker needs to know which they have.',
  '',
  'Be brief and concrete. Lead with the answer. Name entities and contacts, and give the',
  'figure that decides it. A broker is deciding who to phone, not reading a report.',
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
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let answer = '';
  let truncated = true;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let response: Anthropic.Message;
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
    const settled = await Promise.all(
      calls.map(async (call) => ({
        call,
        run: await runTool(call.name, (call.input ?? {}) as Record<string, unknown>),
      })),
    );

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
      `ms=${reply.durationMs} truncated=${truncated}`,
  );

  return reply;
}
