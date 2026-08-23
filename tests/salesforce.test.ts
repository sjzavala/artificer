import { beforeEach, describe, expect, it } from 'vitest';
import { MockSalesforceAdapter } from '@/lib/salesforce/mock';
import { buildPayloads, payloadFieldCounts, SOBJECT_ORDER } from '@/lib/salesforce/mapping';
import type { SalesforceAdapter, WriteRequest } from '@/lib/salesforce/types';
import type { Store } from '@/lib/store/types';
import { assertValidKey } from '@/lib/store/types';
import { computeDealHash } from '@/lib/deals';
import { emptyExtraction, withField, type NetLeaseExtraction } from '@/shared/schema';
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
      value, confidence: 'high', sourceQuote: 'quoted', sourceLocation: 'p-1', edited: false,
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
  it('maps every section onto its Salesforce object', () => {
    const payloads = buildPayloads(dealFrom(BASE));

    expect(payloads.Property__c.Street_Address__c).toBe('1487 Coshocton Avenue');
    expect(payloads.Property__c.Building_SF__c).toBe(9100);
    expect(payloads.Tenant__c.Legal_Entity_Name__c).toBe('Dolgencorp, LLC');
    expect(payloads.Lease__c.Lease_Type__c).toBe('absolute NNN');
    expect(payloads.Deal__c.Asking_Price__c).toBe(1842000);
    expect(payloads.Deal__c.Cap_Rate__c).toBe(6.75);
  });

  it('carries the deal hash so a write can be matched later', () => {
    const deal = dealFrom(BASE);
    expect(buildPayloads(deal).Deal__c.Deal_Hash__c).toBe(deal.dealHash);
  });

  it('leaves unextracted fields null rather than inventing a value', () => {
    const payloads = buildPayloads(dealFrom(BASE));
    expect(payloads.Property__c.Year_Built__c).toBeNull();
    expect(payloads.Tenant__c.Credit_Rating__c).toBeNull();
  });

  it('falls back to the file name when there is no address to name the property', () => {
    const payloads = buildPayloads(dealFrom(emptyExtraction()));
    expect(payloads.Property__c.Name).toBe('memo.pdf');
  });

  it('counts only populated fields for the confirmation modal', () => {
    const counts = payloadFieldCounts(buildPayloads(dealFrom(BASE)));
    for (const name of SOBJECT_ORDER) expect(counts[name]).toBeGreaterThan(0);
    expect(counts.Tenant__c).toBeLessThan(Object.keys(buildPayloads(dealFrom(BASE)).Tenant__c).length);
  });
});

describe('computeDealHash', () => {
  it('is stable across repeated calls', () => {
    expect(computeDealHash(BASE)).toBe(computeDealHash(BASE));
  });

  it('ignores confidence, citations and the edited flag', () => {
    const restated = withField(BASE, 'property.city', {
      value: 'Mount Vernon', confidence: 'low', sourceQuote: 'different quote', sourceLocation: 'p-9', edited: true,
    });
    expect(computeDealHash(restated)).toBe(computeDealHash(BASE));
  });

  it('changes when a business value changes', () => {
    const corrected = withField(BASE, 'economics.askingPrice', {
      value: 1900000, confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: true,
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

    it('returns an id for all four objects', async () => {
      const result = await adapter.write(requestFor(dealFrom(BASE)));
      for (const id of [result.propertyId, result.tenantId, result.leaseId, result.dealId]) {
        expect(id).toMatch(/^[a-zA-Z0-9]{18}$/);
      }
      expect(new Set([result.propertyId, result.tenantId, result.leaseId, result.dealId]).size).toBe(4);
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
      expect(second.dealId).toBe(first.dealId);
      expect(second.propertyId).toBe(first.propertyId);
    });

    it('creates a distinct record set when the values differ', async () => {
      const first = await adapter.write(requestFor(dealFrom(BASE)));

      const corrected = withField(BASE, 'economics.askingPrice', {
        value: 1900000, confidence: 'high', sourceQuote: 'q', sourceLocation: 'p-1', edited: true,
      });
      const second = await adapter.write(requestFor(dealFrom(corrected, 'd_test_2')));

      expect(second.updated).toBe(false);
      expect(second.dealId).not.toBe(first.dealId);
    });
  });
}

adapterContract('MockSalesforceAdapter', () => new MockSalesforceAdapter(new MemoryStore()));

describe('MockSalesforceAdapter', () => {
  it('persists a record set the record view can read back', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    const result = await adapter.write(requestFor(dealFrom(BASE)));

    const set = await adapter.getRecordSet(result.dealId);
    expect(set).not.toBeNull();
    expect(set!.approvedBy).toBe('Casey Rivera');
    expect(set!.records.Deal__c.Name).toContain('Dollar General');
  });

  it('materialises the relationship lookups between records', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    const result = await adapter.write(requestFor(dealFrom(BASE)));
    const set = (await adapter.getRecordSet(result.dealId))!;

    expect(set.records.Lease__c.Property__c).toBe(result.propertyId);
    expect(set.records.Lease__c.Tenant__c).toBe(result.tenantId);
    expect(set.records.Deal__c.Lease__c).toBe(result.leaseId);
  });

  it('preserves the original creation timestamp when updating', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    const first = await adapter.write(requestFor(dealFrom(BASE)));
    const before = (await adapter.getRecordSet(first.dealId))!;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await adapter.write(requestFor(dealFrom(BASE), 'Jordan Blake'));
    const after = (await adapter.getRecordSet(first.dealId))!;

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.approvedBy).toBe('Jordan Blake');
  });

  it('returns null for an unknown or malformed record id', async () => {
    const adapter = new MockSalesforceAdapter(new MemoryStore());
    expect(await adapter.getRecordSet('a04doesnotexist000')).toBeNull();
    expect(await adapter.getRecordSet('../../etc/passwd')).toBeNull();
  });
});
