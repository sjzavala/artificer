import { list, put, del, get } from '@vercel/blob';
import { assertValidKey, type Store } from './types';

/**
 * Production store: the same JSON documents, held as Vercel Blob objects in a
 * **private** store.
 *
 * Private access matters here — deal data must not be reachable by anyone who
 * guesses a URL, and the app's own gate would be beside the point if the
 * underlying blobs were public. Reads go through the SDK's authenticated `get`,
 * so nothing is served without the store token.
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

  async read<T>(key: string): Promise<T | null> {
    const result = await get(this.pathFor(key), {
      access: 'private',
      // Blob reads are CDN-cached by default; without this a deal read straight
      // after approval can come back stale, which looks like a lost write.
      useCache: false,
      token: this.token,
    }).catch((err: unknown) => {
      if (isNotFound(err)) return null;
      throw err;
    });

    if (!result || result.statusCode !== 200) return null;
    return JSON.parse(await streamToString(result.stream)) as T;
  }

  async write<T>(key: string, value: T): Promise<void> {
    await put(this.pathFor(key), JSON.stringify(value, null, 2), {
      access: 'private',
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
    await del(this.pathFor(key), { token: this.token }).catch((err: unknown) => {
      // Removing something already gone is not an error, per the Store contract.
      if (!isNotFound(err)) throw err;
    });
  }
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return name === 'BlobNotFoundError' || /not found|404/i.test(message);
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}
