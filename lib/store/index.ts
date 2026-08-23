import crypto from 'node:crypto';
import path from 'node:path';
import { LocalFileStore } from './local';
import { BlobStore } from './blob';
import type { Store, StoreKind } from './types';

export type { Store, StoreKind } from './types';
export { LocalFileStore } from './local';
export { BlobStore } from './blob';

let cached: Store | null = null;

/**
 * Picks the store from the environment: Vercel Blob when a blob token is
 * present (i.e. in production), local JSON files otherwise. ARTIFICER_STORE
 * forces one either way, which is what the eval harness and tests use.
 */
export function getStore(): Store {
  if (cached) return cached;
  cached = createStore();
  return cached;
}

/** Test seam — drops the memoised instance. */
export function resetStore(): void {
  cached = null;
}

export function selectedStoreKind(): StoreKind {
  const forced = process.env.ARTIFICER_STORE;
  if (forced === 'local' || forced === 'blob') return forced;
  return process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local';
}

function createStore(): Store {
  if (selectedStoreKind() === 'blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error('ARTIFICER_STORE=blob but BLOB_READ_WRITE_TOKEN is not set.');
    }
    return new BlobStore(blobNamespace(), token);
  }
  return new LocalFileStore(process.env.ARTIFICER_DATA_DIR ?? path.join(process.cwd(), 'data'));
}

/**
 * A stable, non-guessable prefix for blob keys. Derived from the session
 * secret so it survives redeploys but changes if the secret is rotated.
 */
function blobNamespace(): string {
  const seed = process.env.ARTIFICER_SESSION_SECRET ?? 'artificer-default-namespace';
  return `artificer/${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}
