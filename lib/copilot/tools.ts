import Anthropic from '@anthropic-ai/sdk';
import { getDeal, listDealSummaries } from '@/lib/deals';
import { getBuyerRepo } from '@/lib/buyers/db';
import { normalizeQuery } from '@/lib/buyers/queries';
import { askDocument } from '@/lib/ask/client';
import { BUYER_STATUSES, CAPITAL_SOURCES } from '@/shared/buyer';
import { GUARANTOR_TYPES, PROPERTY_TYPES } from '@/shared/schema';
import { dealProfile, matchBuyers } from './match';
import type { ToolRun } from './types';

/**
 * The copilot's tools.
 *
 * All four are reads. That is a structural guarantee rather than an instruction
 * the model is asked to respect: there is no write tool here, so no amount of
 * persuasion in a question can make the assistant change a status or approve a
 * deal. Artificer's claim is that nothing reaches the CRM without a person
 * clicking approve, and an assistant that could act would be the exception that
 * makes the claim false.
 */

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_deals',
    description:
      'List the deals in the pipeline with their status, tenant, price, cap rate and how many fields are flagged for review. Use this to find a deal, or to answer questions about the pipeline as a whole.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['extracted', 'approved', 'rejected'],
          description: 'Only deals in this state. Omit for all of them.',
        },
      },
    },
  },
  {
    name: 'ask_deal_document',
    description:
      'Ask a question about one deal’s source document and get an answer with passages quoted from it. Use this for anything the extracted fields do not cover — lease clauses, landlord obligations, termination rights, what the memo says about a market. Each returned passage has been verified to exist in the document.',
    input_schema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'The deal whose document to read.' },
        question: { type: 'string', description: 'A single, specific question about the document.' },
      },
      required: ['dealId', 'question'],
    },
  },
  {
    name: 'search_buyers',
    description:
      'Search the buyer pipeline. Use it for questions about who is looking, and for urgency questions — identifyWithinDays finds 1031 buyers whose 45-day identification deadline is close.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Part of an entity or contact name.' },
        status: { type: 'string', enum: [...BUYER_STATUSES] },
        capitalSource: { type: 'string', enum: [...CAPITAL_SOURCES] },
        market: { type: 'string', description: 'Two-letter USPS state code, upper case.' },
        propertyType: { type: 'string', enum: [...PROPERTY_TYPES] },
        minGuarantor: {
          type: 'string',
          enum: [...GUARANTOR_TYPES],
          description: 'The weakest lease guaranty the buyer accepts.',
        },
        minEquity: { type: 'integer', description: 'Inclusive minimum equity, whole dollars.' },
        identifyWithinDays: {
          type: 'integer',
          description:
            'Only 1031 buyers whose 45-day identification deadline falls between today and this many days out. Buyers whose window has closed are never returned.',
        },
        limit: { type: 'integer', description: 'How many to return, up to 100. Defaults to 10.' },
      },
    },
  },
  {
    name: 'match_buyers_to_deal',
    description:
      'Find the buyers who could take a specific deal. Compares the deal’s cap rate, state, asset class, guaranty and price against each buyer’s stated criteria, and returns both exact fits and near misses — buyers who failed exactly one test — with the reason for every decision. Prefer this over search_buyers whenever the question is about who to call regarding a particular deal.',
    input_schema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'The deal to match.' },
        includeUnderContract: {
          type: 'boolean',
          description:
            'Include buyers already in escrow on something else. Off by default — they are usually not callable.',
        },
      },
      required: ['dealId'],
    },
  },
];

/**
 * Runs one tool call and returns both the result the model sees and a record
 * the UI can show.
 *
 * A tool failure comes back as a result rather than an exception. The model
 * asked for something it could not have — usually a deal id that does not
 * exist — and telling it so lets it correct course, where throwing would end
 * the turn with nothing to show for it.
 */
export async function runTool(name: string, input: Record<string, unknown>): Promise<ToolRun> {
  try {
    switch (name) {
      case 'list_deals':
        return await runListDeals(input);
      case 'ask_deal_document':
        return await runAskDocument(input);
      case 'search_buyers':
        return await runSearchBuyers(input);
      case 'match_buyers_to_deal':
        return await runMatchBuyers(input);
      default:
        return fail(name, input, `No tool named ${name}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[artificer] copilot tool ${name} failed: ${message}`);
    return fail(name, input, `That lookup failed: ${message}`);
  }
}

function fail(name: string, input: Record<string, unknown>, error: string): ToolRun {
  return { name, input, ok: false, summary: error, result: { error } };
}

async function runListDeals(input: Record<string, unknown>): Promise<ToolRun> {
  const status = typeof input.status === 'string' ? input.status : null;
  const all = await listDealSummaries();
  const deals = status ? all.filter((d) => d.status === status) : all;

  return {
    name: 'list_deals',
    input,
    ok: true,
    summary: `${deals.length} deal${deals.length === 1 ? '' : 's'}${status ? ` with status ${status}` : ''}`,
    result: {
      count: deals.length,
      deals: deals.map((d) => ({
        dealId: d.id,
        status: d.status,
        tenant: d.tenantTradeName,
        address: d.addressLine,
        askingPrice: d.askingPrice,
        capRate: d.capRate,
        fieldsFlagged: d.needsAttention,
        fileName: d.fileName,
      })),
    },
  };
}

async function runAskDocument(input: Record<string, unknown>): Promise<ToolRun> {
  const dealId = String(input.dealId ?? '');
  const question = String(input.question ?? '');

  const deal = await getDeal(dealId);
  if (!deal) return fail('ask_deal_document', input, `No deal with id ${dealId}.`);
  if (deal.document.paragraphs.length === 0) {
    return fail('ask_deal_document', input, 'That document has no extractable text.');
  }

  const outcome = await askDocument(question, deal.document.paragraphs, {
    fileName: deal.document.fileName,
  });

  return {
    name: 'ask_deal_document',
    input,
    ok: true,
    summary: outcome.answered
      ? `${outcome.citations.length} passage${outcome.citations.length === 1 ? '' : 's'} from ${deal.document.fileName}`
      : `${deal.document.fileName} does not address it`,
    // The citations travel to the UI so a document claim stays checkable after
    // it has been through the copilot rather than only inside the ask panel.
    citations: outcome.citations.map((c) => ({ ...c, dealId })),
    result: {
      answered: outcome.answered,
      answer: outcome.answer,
      unsupported: outcome.unsupported,
      passages: outcome.citations.map((c) => ({
        marker: c.marker,
        quote: c.quote,
        location: c.sourceLocation,
      })),
    },
  };
}

async function runSearchBuyers(input: Record<string, unknown>): Promise<ToolRun> {
  const params = new URLSearchParams();
  for (const key of [
    'q',
    'status',
    'capitalSource',
    'market',
    'propertyType',
    'minGuarantor',
    'minEquity',
    'identifyWithinDays',
    'limit',
  ] as const) {
    const value = input[key];
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }

  // Through the same normaliser the URL and the buyers page use, so a filter the
  // model invented is dropped here rather than reaching SQL.
  const query = normalizeQuery(params);
  const found = await getBuyerRepo().search(query);

  return {
    name: 'search_buyers',
    input,
    ok: true,
    summary: `${found.total} buyer${found.total === 1 ? '' : 's'} match`,
    result: {
      total: found.total,
      showing: found.results.length,
      buyers: found.results.map(summariseBuyer),
    },
  };
}

async function runMatchBuyers(input: Record<string, unknown>): Promise<ToolRun> {
  const dealId = String(input.dealId ?? '');
  const deal = await getDeal(dealId);
  if (!deal) return fail('match_buyers_to_deal', input, `No deal with id ${dealId}.`);

  const profile = dealProfile(deal);

  // The whole book, because a match is a comparison against every buyer rather
  // than a filtered query — a near miss is only visible if the buyer was scored.
  const { results } = await getBuyerRepo().search({
    q: '',
    status: null,
    capitalSource: null,
    market: null,
    propertyType: null,
    minGuarantor: null,
    minEquity: null,
    identifyWithinDays: null,
    sortBy: 'id',
    page: 1,
    limit: 100,
  });

  const match = matchBuyers(profile, results, {
    includeUnderContract: input.includeUnderContract === true,
  });

  return {
    name: 'match_buyers_to_deal',
    input,
    ok: true,
    summary: `${match.fits.length} fit, ${match.nearMisses.length} near miss${match.nearMisses.length === 1 ? '' : 'es'}`,
    match,
    result: {
      deal: {
        dealId: profile.dealId,
        tenant: profile.tenant,
        capRate: profile.capRate,
        state: profile.state,
        propertyType: profile.propertyType,
        guarantorType: profile.guarantorType,
        askingPrice: profile.askingPrice,
        // Named so the answer can admit what it could not check rather than
        // implying the deal cleared a test nobody ran.
        notStatedInDocument: profile.unknown,
      },
      consideredCount: match.consideredCount,
      notLookingSkipped: match.inactiveSkipped,
      fits: match.fits.map(describeMatch),
      nearMisses: match.nearMisses.map(describeMatch),
    },
  };
}

function summariseBuyer(b: {
  id: number;
  entityName: string;
  contactName: string;
  capitalSource: string;
  equity: number;
  targetCapRateMin: number;
  targetCapRateMax: number;
  propertyTypes: string[];
  minGuarantor: string;
  markets: string[];
  status: string;
  identifyBy: string | null;
  daysToIdentify: number | null;
}) {
  return {
    buyerId: b.id,
    entity: b.entityName,
    contact: b.contactName,
    status: b.status,
    capitalSource: b.capitalSource,
    equity: b.equity,
    targetCapRate: `${b.targetCapRateMin}–${b.targetCapRateMax}%`,
    assetClasses: b.propertyTypes,
    minGuarantor: b.minGuarantor,
    markets: b.markets,
    identifyBy: b.identifyBy,
    daysToIdentify: b.daysToIdentify,
  };
}

function describeMatch(m: import('./match').BuyerMatch) {
  return {
    buyerId: m.buyer.id,
    entity: m.buyer.entityName,
    contact: m.buyer.contactName,
    equity: m.buyer.equity,
    capitalSource: m.buyer.capitalSource,
    daysToIdentify: null as number | null,
    failed: m.failed,
    reasons: m.criteria.map((c) => `${c.passed ? 'ok' : 'no'}: ${c.detail}`),
  };
}
