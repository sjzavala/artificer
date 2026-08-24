import { beforeEach, describe, expect, it } from 'vitest';
import { MockSalesforceAdapter } from '@/lib/salesforce/mock';
import {
  buildPayloads,
  payloadFieldCounts,
  FIELD_MAPPINGS,
  UNWRITTEN_FIELDS,
  SOBJECT_ORDER,
} from '@/lib/salesforce/mapping';
import type { SalesforceAdapter, WriteRequest } from '@/lib/salesforce/types';
import type { Store } from '@/lib/store/types';
import { assertValidKey } from '@/lib/store/types';
import { computeDealHash } from '@/lib/deals';
import { emptyExtraction, withField, FIELD_SPECS, FIELD_SPECS_BY_PATH, type NetLeaseExtraction } from '@/shared/schema';
import type { Deal } from '@/shared/deal';

class MemoryStore implements Store {
  readonly kind = 'local' as const;
  private data = new Map<string, string>();
  async read<T>(key: string): Promise<T | null> {
    assertValidKey(key);
    const raw = this.data.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async write<T>(key: string, value: T): Promise<void> {
    assertValidKey(key);
    this.data.set(key, JSON.stringify(value));
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

function extractionWith(values: Record<string, string | number>): NetLeaseExtraction {
  let extraction = emptyExtraction();
  for (const [path, value] of Object.entries(values)) {
    extraction = withField(extraction, path, {
      value, confidence: 'high', sourceQuote: 'quoted', sourceLocation: 'p-1', edited: false, confirmed: false, alternatives: [],
    });
  }
  return extraction;
}

function dealFrom(extraction: NetLeaseExtraction, id = 'd_test'): Deal {
  return {
    id,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    status: 'extracted',
    dealHash: computeDealHash(extraction),
    document: { fileName: 'memo.pdf', byteSize: 1000, pageCount: 3, charCount: 900, paragraphs: [] },
    extraction,
    originalExtraction: extraction,
    extractionMeta: { model: 'test', inputTokens: 1, outputTokens: 1, durationMs: 1, attempts: 1, chunks: 1 },
  };
}

const BASE = extractionWith({
  'property.streetAddress': '1487 Coshocton Avenue',
  'property.city': 'Mount Vernon',
  'property.state': 'OH',
  'property.propertyType': 'retail',
  'property.buildingSf': 9100,
  'tenant.tradeName': 'Dollar General',
  'tenant.legalEntityName': 'Dolgencorp, LLC',
  'lease.leaseType': 'absolute NNN',
  'economics.askingPrice': 1842000,
  'economics.capRate': 6.75,
});

function requestFor(deal: Deal, approvedBy = 'Casey Rivera'): WriteRequest {
  return { dealId: deal.id, dealHash: deal.dealHash!, approvedBy, payloads: buildPayloads(deal) };
}

describe('buildPayloads', () => {
  it('maps the extraction onto the observed Opportunity + Property schema', () => {
    const payloads = buildPayloads(dealFrom(BASE));

    expect(payloads.Property__c.Property_Address_Street__c).toBe('1487 Coshocton Avenue');
    expect(payloads.Property__c.Building_Size_SF__c).toBe(9100);
    expect(payloads.Opportunity.Lease_Type__c).toBe('absolute NNN');
    expect(payloads.Opportunity.List_Price__c).toBe(1842000);
  });

  it('writes the tenant trade name to Concept, which drives the public filter', () => {
    expect(buildPayloads(dealFrom(BASE)).Property__c.Concept__c).toBe('Dollar General');
  });

  it('does not write a cap rate, which is derived downstream from price and NOI', () => {
    const payloads = buildPayloads(dealFrom(BASE));
    const everyApiName = [...Object.keys(payloads.Property__c), ...Object.keys(payloads.Opportunity)];

    // Writing an independently extracted rate would create a second source of
    // truth that can disagree with the arithmetic on the listing page.
    expect(everyApiName.some((name) => /cap_?rate/i.test(name))).toBe(false);
    expect(UNWRITTEN_FIELDS.map((f) => f.path)).toContain('economics.capRate');
  });

  it('carries the deal hash so a write can be matched later', () => {
    const deal = dealFrom(BASE);
    expect(buildPayloads(deal).Opportunity.Deal_Hash__c).toBe(deal.dealHash);
  });

  it('leaves unextracted fields null rather than inventing a value', () => {
    const payloads = buildPayloads(dealFrom(BASE));
    expect(payloads.Property__c.Year_Built__c).toBeNull();
    expect(payloads.Property__c.Credit_Rating__c).toBeNull();
  });

  it('falls back to the file name when there is no address to name the property', () => {
    expect(buildPayloads(dealFrom(emptyExtraction())).Property__c.Name).toBe('memo.pdf');
  });

  it('counts only populated fields for the confirmation modal', () => {
    const payloads = buildPayloads(dealFrom(BASE));
    const counts = payloadFieldCounts(payloads);
    for (const name of SOBJECT_ORDER) expect(counts[name]).toBeGreaterThan(0);
    expect(counts.Property__c).toBeLessThan(Object.keys(payloads.Property__c).length);
  });
});

describe('the mapping table', () => {
  it('declares where every API name came from', () => {
    for (const mapping of FIELD_MAPPINGS) {
      expect(['observed', 'standard', 'proposed']).toContain(mapping.origin);
      // An "observed" name must name the replica column it was derived from,
      // or the claim is unfalsifiable.
      if (mapping.origin === 'observed') expect(mapping.replica).toBeTruthy();
    }
  });

  it('maps only paths that exist in the extraction schema', () => {
    for (const mapping of FIELD_MAPPINGS) {
      if (mapping.path) expect(FIELD_SPECS_BY_PATH[mapping.path], mapping.path).toBeDefined();
    }
  });

  it('never assigns two mappings to the same object and API name', () => {
    const keys = FIELD_MAPPINGS.map((m) => `${m.object}.${m.api}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('accounts for every extracted field — written, or explicitly not', () => {
    const written = new Set(FIELD_MAPPINGS.map((m) => m.path).filter(Boolean));
    const deliberatelyUnwritten = new Set(UNWRITTEN_FIELDS.map((f) => f.path));

    // A field that is neither written nor listed as deliberately unwritten has
    // been silently dropped, which is how reviewed data quietly goes missing.
    for (const spec of FIELD_SPECS) {
      expect(
        written.has(spec.path) || deliberatelyUnwritten.has(spec.path),
        `${spec.path} is neither mapped nor listed as unwritten`,
      ).toBe(true);
    }
  });
});

describe('computeDealHash', () => {
  it('is stable across repeated calls', () => {
    expect(computeDealHash(BASE)).toBe(computeDealHash(BASE));
  });

  it('ignores confidence, citations and the edited flag', () => {
    const restated = withField(BASE, 'property.city', {
      value: 'Mount Vernon', confidence: 'low', sourceQuote: 'different quote', sourceLocation: 'p-9', edited: true, confirmed: false, alternatives: [],
    });
    expect(computeDealHash(restated)).toBe(computeDealHash(BASE));
  });

  it('changes when a business value changes', () => {
    const corrected = withField(BASE, 'economics.askingPrice', {
      value: 1900000, confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: true, confirmed: false, alternatives: [],
    });
    expect(computeDealHash(corrected)).not.toBe(computeDealHash(BASE));
  });
});

/** Behaviour every SalesforceAdapter must exhibit, run against the mock. */
function adapterContract(name: string, create: () => SalesforceAdapter) {
  describe(`${name} — SalesforceAdapter contract`, () => {
    let adapter: SalesforceAdapter;
    beforeEach(() => {
      adapter = create();
    });

    it('returns a distinct id for every object it writes', async () => {
      const result = await adapter.write(requestFor(dealFrom(BASE)));
      const ids = SOBJECT_ORDER.map((name) => result.ids[name]);

      for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9]{18}$/);
      expect(new Set(ids).size).toBe(SOBJECT_ORDER.length);
      expect(result.primaryId).toBe(result.ids.Opportunity);
    });

    it('reports its own mode on the result', async () => {
      const result = await adapter.write(requestFor(dealFrom(BASE)));
      expect(result.mode).toBe(adapter.mode);
    });

    it('creates on first write and updates on a repeat of the same values', async () => {
      const first = await adapter.write(requestFor(dealFrom(BASE)));
      expect(first.updated).toBe(false);

      const second = await adapter.write(requestFor(dealFrom(BASE)));
      expect(second.updated).toBe(true);
      expect(second.primaryId).toBe(first.primaryId);
      expect(second.ids.Property__c).toBe(first.ids.Property__c);
    });

    it('creates a distinct record set when the values differ', async () => {
      const first = await adapter.write(requestFor(dealFrom(BASE)));

      const corrected = withField(BASE, 'economics.askingPrice', {
        value: 1900000, confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: true, confirmed: false, alternatives: [],
      });
      const second = await adapter.write(requestFor(dealFrom(corrected, 'd_test_2')));

      expect(second.updated).toBe(false);
      expect(second.primaryId).not.toBe(first.primaryId);
    });
  });
}

adapterContract('MockSalesforceAdapter', () => new MockSalesforceAdapter(new MemoryStore()));

describe('MockSalesforceAdapter', () => {
  it('persists a record set the record view can read back', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    const result = await adapter.write(requestFor(dealFrom(BASE)));

    const set = await adapter.getRecordSet(result.primaryId);
    expect(set).not.toBeNull();
    expect(set!.approvedBy).toBe('Casey Rivera');
    expect(set!.records.Opportunity.Name).toContain('Dollar General');
  });

  it('materialises the Opportunity to Property lookup', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    const result = await adapter.write(requestFor(dealFrom(BASE)));
    const set = (await adapter.getRecordSet(result.primaryId))!;

    expect(set.records.Opportunity.Property__c).toBe(result.ids.Property__c);
  });

  it('preserves the original creation timestamp when updating', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    const first = await adapter.write(requestFor(dealFrom(BASE)));
    const before = (await adapter.getRecordSet(first.primaryId))!;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await adapter.write(requestFor(dealFrom(BASE), 'Jordan Blake'));
    const after = (await adapter.getRecordSet(first.primaryId))!;

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.approvedBy).toBe('Jordan Blake');
  });

  it('returns null for an unknown or malformed record id', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    expect(await adapter.getRecordSet('006doesnotexist000')).toBeNull();
    expect(await adapter.getRecordSet('../../etc/passwd')).toBeNull();
  });
});
