import type { SalesforceWriteResult } from '@/shared/deal';
import type { SalesforceAdapter, SalesforceRecordSet, WriteRequest } from './types';

export interface RealSalesforceConfig {
  loginUrl: string;
  username: string;
  password: string;
  instanceUrl?: string;
}

/**
 * Live-org adapter. Activated only when SF_* credentials are present; see
 * docs/salesforce-schema.md for the objects and fields it expects.
 *
 * Idempotency uses Deal_Hash__c as an external id: Deal__c is upserted on it,
 * and the related records are updated in place when the deal already exists.
 */
export class RealSalesforceAdapter implements SalesforceAdapter {
  readonly mode = 'real' as const;

  constructor(private readonly config: RealSalesforceConfig) {}

  private async connect() {
    // Imported lazily so the mock path never pays for jsforce, and so a broken
    // Salesforce dependency cannot take down the default demo experience.
    const jsforce = await import('jsforce');
    const conn = new jsforce.Connection({
      loginUrl: this.config.loginUrl,
      ...(this.config.instanceUrl ? { instanceUrl: this.config.instanceUrl } : {}),
    });
    await conn.login(this.config.username, this.config.password);
    return conn;
  }

  async write(request: WriteRequest): Promise<SalesforceWriteResult> {
    const conn = await this.connect();
    const { payloads, dealHash } = request;

    const existing = await conn.query<{ Id: string; Property__c: string; Tenant__c: string; Lease__c: string }>(
      `SELECT Id, Property__c, Tenant__c, Lease__c FROM Deal__c WHERE Deal_Hash__c = '${escapeSoql(dealHash)}' LIMIT 1`,
    );
    const prior = existing.records[0];

    // jsforce's generated types describe an untyped org as a bare Schema, so
    // the DML surface is narrowed here rather than fought with generics.
    const api = (name: string) => conn.sobject(name) as unknown as SObjectApi;

    const propertyId = await upsert(api('Property__c'), 'Property__c', payloads.Property__c, prior?.Property__c);
    const tenantId = await upsert(api('Tenant__c'), 'Tenant__c', payloads.Tenant__c, prior?.Tenant__c);
    const leaseId = await upsert(
      api('Lease__c'),
      'Lease__c',
      { ...payloads.Lease__c, Property__c: propertyId, Tenant__c: tenantId },
      prior?.Lease__c,
    );
    const dealId = await upsert(
      api('Deal__c'),
      'Deal__c',
      { ...payloads.Deal__c, Property__c: propertyId, Tenant__c: tenantId, Lease__c: leaseId },
      prior?.Id,
    );

    return {
      mode: 'real',
      writtenAt: new Date().toISOString(),
      updated: Boolean(prior),
      propertyId,
      tenantId,
      leaseId,
      dealId,
      instanceUrl: conn.instanceUrl,
    };
  }

  /** Real mode links out to the org rather than rendering a record locally. */
  async getRecordSet(): Promise<SalesforceRecordSet | null> {
    return null;
  }
}

interface SaveLike {
  id?: string;
  success: boolean;
  errors?: unknown;
}

interface SObjectApi {
  create(record: Record<string, unknown>): Promise<SaveLike>;
  update(record: Record<string, unknown>): Promise<SaveLike>;
}

async function upsert(
  sobject: SObjectApi,
  object: string,
  payload: Record<string, unknown>,
  existingId?: string,
): Promise<string> {
  const clean = stripNulls(payload);
  const result = existingId
    ? await sobject.update({ ...clean, Id: existingId })
    : await sobject.create(clean);
  if (!result.success) {
    throw new Error(`Salesforce ${object} write failed: ${JSON.stringify(result.errors)}`);
  }
  return result.id ?? existingId ?? '';
}

/** Salesforce rejects nulls on some field types; omitting is the safe form. */
function stripNulls(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
