import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AiQueryError, translateQuery } from '@/lib/buyers/ai';
import { InMemoryBuyerRepo } from '@/lib/buyers/memory';
import { seedBuyers } from '@/lib/buyers/seed';

/**
 * The translator is tested against a stubbed Anthropic client, so these assert
 * our handling of a tool call rather than the model's judgement — what happens
 * when it returns a status that does not exist, a market that is not a state,
 * or no tool call at all. Model output is untrusted input, and the thing worth
 * proving is that it goes through the same validation as a URL.
 */

const NOW = '2026-09-01';

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
  return [{ type: 'tool_use', id: 'toolu_1', name: 'search_buyers', input } as Anthropic.ToolUseBlock];
}

describe('translateQuery', () => {
  it('forces a single call to the search tool', async () => {
    const { client, calls } = stubClient(toolCall({ interpretation: 'Everyone.' }));
    await translateQuery('show me everyone', { client });

    expect(calls).toHaveLength(1);
    expect(calls[0].tool_choice).toEqual({ type: 'tool', name: 'search_buyers' });
    expect(calls[0].tools?.map((t) => ('name' in t ? t.name : null))).toEqual(['search_buyers']);
  });

  it('offers the model the domain’s own vocabulary, not a private copy', () => {
    const { client, calls } = stubClient(toolCall({ interpretation: '…' }));
    return translateQuery('…', { client }).then(() => {
      const tool = calls[0].tools?.[0];
      const schema = (tool && 'input_schema' in tool ? tool.input_schema : null) as {
        properties: Record<string, { enum?: string[] }>;
      };
      // These come from shared/schema.ts and shared/buyer.ts by import.
      expect(schema.properties.propertyType.enum).toEqual(['retail', 'industrial', 'office', 'other']);
      expect(schema.properties.minGuarantor.enum).toEqual(['corporate', 'franchisee', 'personal', 'none']);
      expect(schema.properties.status.enum).toEqual(['active', 'under contract', 'closed', 'inactive']);
    });
  });

  it('turns a tool call into a validated query', async () => {
    const { client } = stubClient(
      toolCall({
        q: 'Ridgeline',
        status: 'active',
        capitalSource: '1031 exchange',
        market: 'tx',
        propertyType: 'retail',
        minEquity: 2000000,
        identifyWithinDays: 14,
        sortBy: 'identifyBy',
        interpretation: 'Active exchange buyers named Ridgeline in Texas.',
      }),
    );

    const { query, interpretation } = await translateQuery('…', { client });

    expect(query).toEqual({
      q: 'Ridgeline',
      status: 'active',
      capitalSource: '1031 exchange',
      market: 'TX', // upper-cased by the same normaliser the URL uses
      propertyType: 'retail',
      minGuarantor: null,
      minEquity: 2000000,
      identifyWithinDays: 14,
      sortBy: 'identifyBy',
      page: 1,
      limit: 10,
    });
    expect(interpretation).toMatch(/Active exchange buyers/);
  });

  it('drops parameters the model invented', async () => {
    const { client } = stubClient(
      toolCall({
        status: 'warm lead', // not a pipeline status
        capitalSource: 'crypto', // not a capital source
        propertyType: 'castle', // not an asset class
        minGuarantor: 'a handshake', // not a guaranty type
        market: 'the Southeast', // not a state code
        minEquity: 'a couple million', // not a number
        sortBy: 'vibes', // not a sortable column
        interpretation: '…',
      }),
    );

    const { query } = await translateQuery('…', { client });

    expect(query.status).toBeNull();
    expect(query.capitalSource).toBeNull();
    expect(query.propertyType).toBeNull();
    expect(query.minGuarantor).toBeNull();
    expect(query.market).toBeNull();
    expect(query.minEquity).toBeNull();
    expect(query.sortBy).toBe('id');
  });

  it('never lets an invented filter reach the results', async () => {
    const { client } = stubClient(toolCall({ status: 'warm lead', interpretation: '…' }));
    const { query } = await translateQuery('…', { client });

    // A dropped status widens the search rather than matching nothing.
    const repo = new InMemoryBuyerRepo(seedBuyers({ baseDate: NOW }));
    expect((await repo.search(query, NOW)).total).toBe(60);
  });

  it('rejects a negative deadline window rather than passing it to SQL', async () => {
    const { client } = stubClient(toolCall({ identifyWithinDays: -30, interpretation: '…' }));
    const { query } = await translateQuery('…', { client });
    expect(query.identifyWithinDays).toBeNull();
  });

  it('omits filters the question did not constrain', async () => {
    const { client } = stubClient(toolCall({ q: 'Ridgeline', interpretation: 'Buyers named Ridgeline.' }));
    const { query } = await translateQuery('buyers named ridgeline', { client });

    expect(query.q).toBe('Ridgeline');
    expect(query.status).toBeNull();
    expect(query.market).toBeNull();
    expect(query.minEquity).toBeNull();
    expect(query.identifyWithinDays).toBeNull();
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
