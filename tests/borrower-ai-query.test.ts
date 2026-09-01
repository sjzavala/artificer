import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AiQueryError, translateQuery } from '@/lib/borrower-search/ai';
import { InMemoryBorrowerRepo } from '@/lib/borrower-search/memory';

/**
 * The translator is tested against a stubbed Anthropic client, so these assert
 * our handling of a tool call rather than the model's judgement — what happens
 * when it returns a status that does not exist, a score outside the range, or
 * no tool call at all. Model output is untrusted input, and the thing worth
 * proving is that it goes through the same validation as a URL.
 */

function stubClient(content: Anthropic.ContentBlock[]) {
  const calls: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParams) => {
        calls.push(params);
        return {
          content,
          model: 'stub-model',
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  } as unknown as Anthropic;

  return { client, calls };
}

function toolCall(input: Record<string, unknown>): Anthropic.ContentBlock[] {
  return [{ type: 'tool_use', id: 'toolu_1', name: 'search_borrowers', input } as Anthropic.ToolUseBlock];
}

describe('translateQuery', () => {
  it('forces a single call to the search tool', async () => {
    const { client, calls } = stubClient(toolCall({ interpretation: 'All borrowers.' }));
    await translateQuery('show me everyone', { client });

    expect(calls).toHaveLength(1);
    expect(calls[0].tool_choice).toEqual({ type: 'tool', name: 'search_borrowers' });
    expect(calls[0].tools?.map((t) => ('name' in t ? t.name : null))).toEqual(['search_borrowers']);
  });

  it('turns a tool call into a validated query', async () => {
    const { client } = stubClient(
      toolCall({
        q: 'Smith',
        status: 'Pending',
        state: 'ca',
        minScore: 700,
        sortBy: 'creditScore',
        interpretation: 'Pending applications named Smith in California scoring at least 700.',
      }),
    );

    const { query, interpretation } = await translateQuery('…', { client });

    expect(query).toEqual({
      q: 'Smith',
      status: 'Pending',
      state: 'CA', // upper-cased by the same normaliser the URL uses
      minScore: 700,
      sortBy: 'creditScore',
      page: 1,
      limit: 10,
    });
    expect(interpretation).toMatch(/Pending applications/);
  });

  it('drops parameters the model invented', async () => {
    const { client } = stubClient(
      toolCall({
        status: 'Under Review', // not a status this system has
        sortBy: 'ssn', // not a sortable column
        state: 'California', // not a state code
        minScore: 'seven hundred', // not a number
        interpretation: '…',
      }),
    );

    const { query } = await translateQuery('…', { client });

    expect(query.status).toBeNull();
    expect(query.sortBy).toBe('id');
    expect(query.state).toBeNull();
    expect(query.minScore).toBeNull();
  });

  it('never lets an invented filter reach the results', async () => {
    const { client } = stubClient(toolCall({ status: 'Under Review', interpretation: '…' }));
    const { query } = await translateQuery('…', { client });

    // A dropped status widens the search rather than matching nothing.
    expect((await new InMemoryBorrowerRepo().search(query)).total).toBe(60);
  });

  it('omits filters the question did not constrain', async () => {
    const { client } = stubClient(toolCall({ q: 'Smith', interpretation: 'Borrowers named Smith.' }));
    const { query } = await translateQuery('borrowers named smith', { client });

    expect(query.q).toBe('Smith');
    expect(query.status).toBeNull();
    expect(query.state).toBeNull();
    expect(query.minScore).toBeNull();
  });

  it('falls back to a usable line when the interpretation is missing or blank', async () => {
    for (const input of [{}, { interpretation: '   ' }, { interpretation: 42 }]) {
      const { client } = stubClient(toolCall(input));
      const { interpretation } = await translateQuery('…', { client });
      expect(interpretation).toBe('Applied the filters below.');
    }
  });

  it('raises a usable error when the model answers in prose instead', async () => {
    const { client } = stubClient([
      { type: 'text', text: 'I am not sure what you mean.', citations: null } as Anthropic.TextBlock,
    ]);

    await expect(translateQuery('…', { client })).rejects.toThrow(AiQueryError);
    await expect(translateQuery('…', { client })).rejects.toThrow(/did not return a search/);
  });

  it('translates an API failure into something an operator can act on', async () => {
    const client = {
      messages: {
        create: async () => {
          throw Object.assign(new Error('bad key'), { status: 401 });
        },
      },
    } as unknown as Anthropic;

    await expect(translateQuery('…', { client })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
