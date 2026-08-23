import { MockSalesforceAdapter } from './mock';
import { RealSalesforceAdapter } from './real';
import type { SalesforceAdapter } from './types';

export type { SalesforceAdapter, SalesforceRecordSet, DealPayloads, WriteRequest } from './types';
export { MockSalesforceAdapter } from './mock';
export { RealSalesforceAdapter } from './real';
export { buildPayloads, payloadFieldCounts, SOBJECT_ORDER, SOBJECT_LABELS } from './mapping';

/**
 * Mock unless a full set of SF_* credentials is present. Deliberately
 * fail-safe: a partially configured org falls back to mock rather than
 * throwing on approval, which is the worst moment to discover a config gap.
 */
export function getSalesforceAdapter(): SalesforceAdapter {
  const loginUrl = process.env.SF_LOGIN_URL;
  const username = process.env.SF_USERNAME;
  const password = process.env.SF_PASSWORD;

  if (loginUrl && username && password) {
    return new RealSalesforceAdapter({
      loginUrl,
      username,
      password,
      instanceUrl: process.env.SF_INSTANCE_URL,
    });
  }
  return new MockSalesforceAdapter();
}

export function salesforceMode(): 'mock' | 'real' {
  return process.env.SF_LOGIN_URL && process.env.SF_USERNAME && process.env.SF_PASSWORD ? 'real' : 'mock';
}
