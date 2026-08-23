/**
 * The storage seam. Everything above this line — deals, audit log, mock
 * Salesforce records — is plain JSON addressed by key. Nothing in the app
 * knows or cares which implementation is live.
 *
 * Keys are POSIX-style paths, e.g. "deals/abc123.json".
 */
export interface Store {
  readonly kind: StoreKind;
  /** Returns null when the key does not exist. Never throws on absence. */
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T): Promise<void>;
  /** Keys beginning with `prefix`, sorted lexicographically. */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

export type StoreKind = 'local' | 'blob';

/** Rejects keys that could escape the store's namespace. */
export function assertValidKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error(`Invalid store key: ${JSON.stringify(key)}`);
  }
}
