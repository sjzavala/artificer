import fs from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey, type Store } from './types';

/**
 * Development store: one JSON file per key under `/data`, which is gitignored.
 * Writes go through a temp file + rename so a crashed process can never leave
 * a half-written deal behind.
 */
export class LocalFileStore implements Store {
  readonly kind = 'local' as const;

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertValidKey(key);
    return path.join(this.root, key);
  }

  async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.resolve(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, target);
  }

  /**
   * Walks subdirectories and returns file keys only.
   *
   * A flat readdir returns directory entries too, so a nested prefix like
   * "salesforce/" yielded "salesforce/records" as if it were a key — and
   * deleting it tried to unlink a directory. The blob store has a flat
   * namespace and never had this problem, which is exactly the kind of
   * divergence the shared contract tests exist to catch.
   */
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];

    const walk = async (relative: string): Promise<void> => {
      const absolute = relative ? path.join(this.root, relative) : this.root;
      let entries;
      try {
        entries = await fs.readdir(absolute, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }

      for (const entry of entries) {
        const key = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          // Descend only where a match could still live under this prefix.
          if (key.startsWith(prefix) || prefix.startsWith(key)) await walk(key);
        } else if (key.startsWith(prefix) && !key.endsWith('.tmp')) {
          keys.push(key);
        }
      }
    };

    await walk('');
    return keys.sort();
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
