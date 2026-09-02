import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { askDocument, AskError, stripOrphanMarkers } from '@/lib/ask/client';
import type { DocumentParagraph } from '@/shared/deal';

/**
 * The value of this feature is that a citation is checked, not merely produced.
 * These tests are mostly about what happens when the model cites something that
 * is not there — the case a chat-with-your-PDF box gets wrong silently.
 */

const PARAGRAPHS: DocumentParagraph[] = [
  { id: 'p-1', page: 1, text: 'The Property is a 9,100 square foot freestanding retail building.' },
  {
    id: 'p-2',
    page: 1,
    text: 'Base Rent shall increase by ten percent (10%) at the commencement of each option period.',
  },
  {
    id: 'p-3',
    page: 2,
    text: 'Landlord shall be responsible for the roof, foundation and structural components of the Premises.',
  },
];

function stub(input: Record<string, unknown>, usage: Record<string, number> = {}) {
  const calls: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParams) => {
        calls.push(params);
        return {
          content: [{ type: 'tool_use', id: 't1', name: 'answer_from_document', input }],
          model: 'stub-model',
          usage: { input_tokens: 100, output_tokens: 20, ...usage },
        } as unknown as Anthropic.Message;
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const ask = (input: Record<string, unknown>, usage?: Record<string, number>) =>
  askDocument('question?', PARAGRAPHS, { client: stub(input, usage).client });

describe('citation verification', () => {
  it('keeps a citation whose quote is really in the document', async () => {
    const result = await ask({
      answered: true,
      answer: 'Rent escalates ten percent each option period [1].',
      citations: [
        { marker: 1, quote: 'increase by ten percent (10%) at the commencement', sourceLocation: 'p-2' },
      ],
    });

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].sourceLocation).toBe('p-2');
    expect(result.citations[0].modelAnchorCorrect).toBe(true);
    expect(result.droppedCitations).toBe(0);
    expect(result.unsupported).toBe(false);
  });

  it('corrects an anchor when the quote is real but filed under the wrong paragraph', async () => {
    const result = await ask({
      answered: true,
      answer: 'The landlord carries roof and structure [1].',
      citations: [
        // Real text, wrong id — the quote wins and the anchor is repaired.
        { marker: 1, quote: 'responsible for the roof, foundation and structural', sourceLocation: 'p-1' },
      ],
    });

    expect(result.citations[0].sourceLocation).toBe('p-3');
    expect(result.citations[0].modelAnchorCorrect).toBe(false);
    expect(result.droppedCitations).toBe(0);
  });

  it('drops a fabricated quote rather than displaying it', async () => {
    const result = await ask({
      answered: true,
      answer: 'The tenant has a right of first refusal [1].',
      citations: [
        { marker: 1, quote: 'Tenant shall have a Right of First Refusal to purchase', sourceLocation: 'p-2' },
      ],
    });

    expect(result.citations).toHaveLength(0);
    expect(result.droppedCitations).toBe(1);
    // Every offered passage was invented, so the answer is not presented as fact.
    expect(result.unsupported).toBe(true);
  });

  it('keeps the real citation and drops the invented one from the same answer', async () => {
    const result = await ask({
      answered: true,
      answer: 'Rent escalates ten percent [1] and there is a purchase option [2].',
      citations: [
        { marker: 1, quote: 'increase by ten percent (10%)', sourceLocation: 'p-2' },
        { marker: 2, quote: 'Tenant may purchase the Premises at fair market value', sourceLocation: 'p-3' },
      ],
    });

    expect(result.citations.map((c) => c.marker)).toEqual([1]);
    expect(result.droppedCitations).toBe(1);
    // Partly supported is not unsupported.
    expect(result.unsupported).toBe(false);
    // The dangling marker is stripped so it cannot point at nothing.
    expect(result.answer).toContain('[1]');
    expect(result.answer).not.toContain('[2]');
  });

  it('is not fooled by a quote that only appears in the question', async () => {
    const result = await askDocument(
      'Does the lease grant a termination right for casualty?',
      PARAGRAPHS,
      {
        client: stub({
          answered: true,
          answer: 'Yes, on casualty [1].',
          citations: [{ marker: 1, quote: 'termination right for casualty', sourceLocation: 'p-1' }],
        }).client,
      },
    );

    expect(result.citations).toHaveLength(0);
    expect(result.unsupported).toBe(true);
  });

  it('discards a malformed citation entry without throwing', async () => {
    const result = await ask({
      answered: true,
      answer: 'Something [1][2][3].',
      citations: [
        { marker: 1, quote: '', sourceLocation: 'p-1' },
        { marker: 'two', quote: 'freestanding retail building', sourceLocation: 'p-1' },
        { quote: 'freestanding retail building', sourceLocation: 'p-1' },
      ],
    });

    expect(result.citations).toHaveLength(0);
    expect(result.droppedCitations).toBe(3);
  });

  it('tolerates citations being absent entirely', async () => {
    const result = await ask({ answered: false, answer: 'The document does not state this.' });
    expect(result.citations).toEqual([]);
    expect(result.droppedCitations).toBe(0);
    expect(result.unsupported).toBe(false);
    expect(result.answered).toBe(false);
  });

  it('collapses a marker cited twice to one passage', async () => {
    const result = await ask({
      answered: true,
      answer: 'Rent escalates [1].',
      citations: [
        { marker: 1, quote: 'increase by ten percent (10%)', sourceLocation: 'p-2' },
        { marker: 1, quote: 'ten percent (10%) at the commencement', sourceLocation: 'p-2' },
      ],
    });
    expect(result.citations).toHaveLength(1);
  });
});

describe('an unanswerable question', () => {
  it('is reported rather than guessed at', async () => {
    const result = await ask({
      answered: false,
      answer: 'The document does not state the guarantor. It does describe the building and the rent.',
      citations: [],
    });

    expect(result.answered).toBe(false);
    expect(result.unsupported).toBe(false);
    expect(result.answer).toMatch(/does not state/);
  });
});

describe('the request', () => {
  it('forces the answer tool', async () => {
    const { client, calls } = stub({ answered: true, answer: 'x' });
    await askDocument('q?', PARAGRAPHS, { client });

    expect(calls[0].tool_choice).toEqual({ type: 'tool', name: 'answer_from_document' });
  });

  it('caches the document and leaves the question outside the cached block', async () => {
    const { client, calls } = stub({ answered: true, answer: 'x' });
    await askDocument('who pays for the roof?', PARAGRAPHS, { client });

    const content = calls[0].messages[0].content as Anthropic.TextBlockParam[];
    expect(content).toHaveLength(2);

    // The document is the stable prefix, so the breakpoint goes on it.
    expect(content[0].text).toContain('<document>');
    expect(content[0].cache_control).toEqual({ type: 'ephemeral' });

    // The question varies per request and must sit after the breakpoint, or
    // every question would write a new cache entry instead of reading one.
    expect(content[1].text).toContain('who pays for the roof?');
    expect(content[1].cache_control).toBeUndefined();
  });

  it('reports cache accounting so the saving is visible rather than assumed', async () => {
    const result = await ask(
      { answered: true, answer: 'x' },
      { cache_read_input_tokens: 4200, cache_creation_input_tokens: 0 },
    );
    expect(result.cacheReadTokens).toBe(4200);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it('raises a usable error when the model answers in prose instead of calling the tool', async () => {
    const client = {
      messages: {
        create: async () =>
          ({
            content: [{ type: 'text', text: 'I think so?', citations: null }],
            model: 'stub-model',
            usage: { input_tokens: 1, output_tokens: 1 },
          }) as unknown as Anthropic.Message,
      },
    } as unknown as Anthropic;

    await expect(askDocument('q?', PARAGRAPHS, { client })).rejects.toThrow(AskError);
  });

  it('translates an API failure into something an operator can act on', async () => {
    const client = {
      messages: {
        create: async () => {
          throw Object.assign(new Error('bad key'), { status: 401 });
        },
      },
    } as unknown as Anthropic;

    await expect(askDocument('q?', PARAGRAPHS, { client })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('stripOrphanMarkers', () => {
  it('removes only the markers with no surviving citation', () => {
    expect(stripOrphanMarkers('A [1] and B [2].', new Set([1]))).toBe('A [1] and B.');
  });

  it('tidies the space the removed marker leaves before punctuation', () => {
    expect(stripOrphanMarkers('The rent escalates [3].', new Set())).toBe('The rent escalates.');
    expect(stripOrphanMarkers('One [1]  two [2]  three', new Set([1]))).toBe('One [1] two three');
  });

  it('leaves an answer with no markers untouched', () => {
    expect(stripOrphanMarkers('No citations here.', new Set())).toBe('No citations here.');
  });
});
