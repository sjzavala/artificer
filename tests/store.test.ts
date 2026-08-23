import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalFileStore } from '@/lib/store/local';
import { assertValidKey, type Store } from '@/lib/store/types';

/**
 * The storage seam is tested through its interface, not its implementation.
 * `contractTests` is the behaviour every Store must exhibit; LocalFileStore runs
 * it here, and an in-memory double runs it too — so the suite proves the
 * interface is actually substitutable rather than just declared to be.
 */

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

function contractTests(name: string, create: () => Promise<Store>) {
  describe(`${name} — Store contract`, () => {
    let store: Store;
    beforeEach(async () => {
      store = await create();
    });

    it('returns null for a key that was never written', async () => {
      expect(await store.read('deals/missing.json')).toBeNull();
    });

    it('round-trips a nested JSON document', async () => {
      const value = { id: 'd_1', nested: { list: [1, 2, 3], flag: true }, nothing: null };
      await store.write('deals/d_1.json', value);
      expect(await store.read('deals/d_1.json')).toEqual(value);
    });

    it('overwrites rather than appending on a second write', async () => {
      await store.write('deals/d_1.json', { v: 1 });
      await store.write('deals/d_1.json', { v: 2 });
      expect(await store.read<{ v: number }>('deals/d_1.json')).toEqual({ v: 2 });
    });

    it('lists keys under a prefix, sorted, excluding other prefixes', async () => {
      await store.write('deals/b.json', {});
      await store.write('deals/a.json', {});
      await store.write('audit/log.json', []);

      expect(await store.list('deals/')).toEqual(['deals/a.json', 'deals/b.json']);
      expect(await store.list('audit/')).toEqual(['audit/log.json']);
    });

    it('returns an empty list for a prefix with nothing under it', async () => {
      expect(await store.list('salesforce/records/')).toEqual([]);
    });

    it('removes a key, and removing again is not an error', async () => {
      await store.write('deals/d_1.json', { v: 1 });
      await store.remove('deals/d_1.json');
      expect(await store.read('deals/d_1.json')).toBeNull();
      await expect(store.remove('deals/d_1.json')).resolves.toBeUndefined();
    });

    it('refuses keys that would escape the namespace', async () => {
      await expect(store.write('../escape.json', {})).rejects.toThrow();
      await expect(store.read('/etc/passwd')).rejects.toThrow();
    });
  });
}

contractTests('MemoryStore', async () => new MemoryStore());

contractTests('LocalFileStore', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artificer-store-'));
  tempRoots.push(root);
  return new LocalFileStore(root);
});

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('assertValidKey', () => {
  it('accepts ordinary nested keys', () => {
    expect(() => assertValidKey('deals/d_1.json')).not.toThrow();
    expect(() => assertValidKey('salesforce/by-hash/abc.json')).not.toThrow();
  });

  it('rejects traversal, absolute paths, backslashes and empties', () => {
    for (const bad of ['', '/abs.json', '../up.json', 'a/../../b.json', 'win\\path.json']) {
      expect(() => assertValidKey(bad), bad).toThrow();
    }
  });
});

describe('LocalFileStore specifics', () => {
  it('does not leak temp files from an interrupted write into listings', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artificer-store-'));
    tempRoots.push(root);
    const store = new LocalFileStore(root);

    await store.write('deals/d_1.json', { v: 1 });
    await fs.writeFile(path.join(root, 'deals', 'd_2.json.9999.tmp'), '{}');

    expect(await store.list('deals/')).toEqual(['deals/d_1.json']);
  });

  it('creates intermediate directories on first write', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artificer-store-'));
    tempRoots.push(root);
    const store = new LocalFileStore(root);

    await store.write('salesforce/by-hash/deep/key.json', { ok: true });
    expect(await store.read('salesforce/by-hash/deep/key.json')).toEqual({ ok: true });
  });
});
