import { list, put, del } from '@vercel/blob';
import { assertValidKey, type Store } from './types';

/**
 * Production store: the same JSON documents, held as Vercel Blob objects.
 *
 * Vercel Blob only offers public-read URLs, so every key lives under a
 * namespace derived from ARTIFICER_SESSION_SECRET. That keeps demo data from
 * being trivially guessable at a stable path — it is obfuscation, not access
 * control, and the README says so.
 */
export class BlobStore implements Store {
  readonly kind = 'blob' as const;

  constructor(
    private readonly namespace: string,
    private readonly token: string | undefined,
  ) {}

  private pathFor(key: string): string {
    assertValidKey(key);
    return `${this.namespace}/${key}`;
  }

  private async urlFor(key: string): Promise<string | null> {
    const pathname = this.pathFor(key);
    const { blobs } = await list({ prefix: pathname, limit: 100, token: this.token });
    const hit = blobs.find((b) => b.pathname === pathname);
    return hit?.url ?? null;
  }

  async read<T>(key: string): Promise<T | null> {
    const url = await this.urlFor(key);
    if (!url) return null;
    // Blob URLs sit behind a CDN; without no-store a just-written deal can read
    // back stale, which in this app looks like a lost approval.
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Blob read failed for ${key}: ${res.status}`);
    return (await res.json()) as T;
  }

  async write<T>(key: string, value: T): Promise<void> {
    await put(this.pathFor(key), JSON.stringify(value, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      token: this.token,
    });
  }

  async list(prefix: string): Promise<string[]> {
    const full = `${this.namespace}/${prefix}`;
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: full, cursor, limit: 1000, token: this.token });
      for (const blob of page.blobs) keys.push(blob.pathname.slice(this.namespace.length + 1));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return keys.sort();
  }

  async remove(key: string): Promise<void> {
    const url = await this.urlFor(key);
    if (url) await del(url, { token: this.token });
  }
}
