import Anthropic from '@anthropic-ai/sdk';
import { getDeal, listDealSummaries } from '@/lib/deals';
import { readAudit } from '@/lib/audit';
import { allFields } from '@/shared/schema';
import { getBuyerRepo } from '@/lib/buyers/db';
import { normalizeQuery } from '@/lib/buyers/queries';
import { askDocument } from '@/lib/ask/client';
import { searchListings, MarketDataError } from '@/lib/market/surmount';
import { BUYER_STATUSES, CAPITAL_SOURCES } from '@/shared/buyer';
import { GUARANTOR_TYPES, PROPERTY_TYPES } from '@/shared/schema';
import { dealProfile, matchBuyers } from './match';
import type { ToolRun } from './types';

/**
 * The factotum's tools.
 *
 * All seven are reads. That is a structural guarantee rather than an instruction
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
    name: 'get_deal_fields',
    description:
      'Every field Artificer extracted from a deal — lease type, commencement and expiration, remaining term, renewal options, rent escalations, landlord responsibilities, building and lot size, NOI, rent, price per square foot, guarantor and credit rating, and the full address. Each carries a confidence grade, whether a person edited or confirmed it, and the passage it came from. Prefer this over ask_deal_document for anything the extraction already covers: it is faster, it is already reviewed, and it tells you how well supported each value is.',
    input_schema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'The deal to read.' },
        section: {
          type: 'string',
          enum: ['property', 'tenant', 'lease', 'economics'],
          description: 'Only this group of fields. Omit for all of them.',
        },
      },
      required: ['dealId'],
    },
  },
  {
    name: 'read_audit',
    description:
      'The append-only record of what has been done: uploads, extractions, field edits and confirmations, approvals, rejections, OM drafts and buyer status changes — each with who did it and when. Use it for questions about history, provenance or who decided something.',
    input_schema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'Only entries for this deal. Omit for everything.' },
        limit: { type: 'integer', description: 'Most recent first. Defaults to 25.' },
      },
    },
  },
  {
    name: 'search_market_listings',
    description:
      'Search live net-lease listings on the NNN Pro marketplace — the only view Artificer has of the world outside this workspace. Returns the tenant, location, asking price, net operating income, a cap rate derived from those two, building size, year built and lease terms. IMPORTANT: these are properties currently for sale at an asking price. They are not closed sales, so they show what sellers are asking today, not what anything traded for. Say so whenever you use them to reason about pricing.',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'The tenant or brand ONLY — "Dollar General", "Walgreens", "7-Eleven". Do not put a state, city or region in here: the marketplace matches this as one phrase, so "Walgreens Florida" finds fewer listings than "Walgreens" narrowed with the state filter, and quietly misses some. Use `state` for geography.',
        },
        state: {
          type: 'string',
          description:
            'Two-letter USPS code — the only way to narrow by geography. Use this rather than putting the place name in `search`.',
        },
        minCapRate: { type: 'number', description: 'Percent, e.g. 6.5.' },
        maxCapRate: { type: 'number', description: 'Percent.' },
        limit: { type: 'integer', description: 'How many to return, up to 50. Defaults to 12.' },
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
      case 'get_deal_fields':
        return await runDealFields(input);
      case 'read_audit':
        return await runReadAudit(input);
      case 'search_market_listings':
        return await runMarketListings(input);
      case 'search_buyers':
        return await runSearchBuyers(input);
      case 'match_buyers_to_deal':
        return await runMatchBuyers(input);
      default:
        return fail(name, input, `No tool named ${name}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[artificer] factotum tool ${name} failed: ${message}`);
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
    // it has been through the factotum rather than only inside the ask panel.
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

async function runDealFields(input: Record<string, unknown>): Promise<ToolRun> {
  const dealId = String(input.dealId ?? '');
  const deal = await getDeal(dealId);
  if (!deal) return fail('get_deal_fields', input, `No deal with id ${dealId}.`);

  const section = typeof input.section === 'string' ? input.section : null;
  const fields = allFields(deal.extraction)
    .filter(({ spec }) => !section || spec.section === section)
    .map(({ spec, field }) => ({
      label: spec.label,
      path: spec.path,
      value: field.value,
      unit: spec.unit ?? null,
      // The grade travels with the value on purpose: "6.75%, high confidence,
      // stated directly" and "6.75%, low, one reading of a contradiction" are
      // different claims, and an assistant that flattens them is lying by
      // omission.
      confidence: field.confidence,
      editedByAPerson: Boolean(field.edited),
      confirmedByAPerson: Boolean(field.confirmed),
      sourceQuote: field.sourceQuote,
      sourceLocation: field.sourceLocation,
    }));

  const flagged = fields.filter((f) => f.confidence === 'low' || f.confidence === 'not_found');

  return {
    name: 'get_deal_fields',
    input,
    ok: true,
    summary: `${fields.length} field${fields.length === 1 ? '' : 's'}${flagged.length ? `, ${flagged.length} needing attention` : ''}`,
    result: {
      dealId,
      status: deal.status,
      fileName: deal.document.fileName,
      fields,
      needingAttention: flagged.map((f) => f.label),
    },
  };
}

async function runReadAudit(input: Record<string, unknown>): Promise<ToolRun> {
  const dealId = typeof input.dealId === 'string' && input.dealId ? input.dealId : undefined;
  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);

  const entries = (await readAudit(dealId)).slice(0, limit);

  return {
    name: 'read_audit',
    input,
    ok: true,
    // The deal id is plumbing; the summary line is read by a broker.
    summary: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${dealId ? ' for this deal' : ' across everything'}`,
    result: {
      count: entries.length,
      entries: entries.map((e) => ({
        at: e.at,
        actor: e.actor,
        action: e.action,
        summary: e.summary,
        dealId: e.dealId,
      })),
    },
  };
}

async function runMarketListings(input: Record<string, unknown>): Promise<ToolRun> {
  try {
    const found = await searchListings({
      search: typeof input.search === 'string' ? input.search : undefined,
      state: typeof input.state === 'string' ? input.state : undefined,
      minCapRate: Number.isFinite(Number(input.minCapRate)) ? Number(input.minCapRate) : undefined,
      maxCapRate: Number.isFinite(Number(input.maxCapRate)) ? Number(input.maxCapRate) : undefined,
      limit: Number.isFinite(Number(input.limit)) ? Number(input.limit) : undefined,
    });

    const caps = found.listings.map((l) => l.capRate).filter((c): c is number => c !== null);

    return {
      name: 'search_market_listings',
      input,
      ok: true,
      summary: `${found.listings.length} listing${found.listings.length === 1 ? '' : 's'}${
        caps.length ? `, ${Math.min(...caps).toFixed(2)}–${Math.max(...caps).toFixed(2)}% asking` : ''
      }`,
      result: {
        // Repeated in the payload as well as the tool description, because this
        // is the one thing that must not be lost between the lookup and the
        // sentence the broker reads.
        note: 'Current asking prices on live listings — not closed sales.',
        totalMatchedOnMarketplace: found.totalMatched,
        examined: found.examined,
        listings: found.listings,
        capRateRange: caps.length
          ? { low: Math.min(...caps), high: Math.max(...caps), median: median(caps) }
          : null,
      },
    };
  } catch (error) {
    // The marketplace is the one dependency outside this system, so it is the
    // one that degrades to "no market data" rather than taking the answer down.
    const message = error instanceof MarketDataError ? error.message : 'Could not reach the marketplace.';
    return fail('search_market_listings', input, `${message} Answer from what is in Artificer instead.`);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
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
