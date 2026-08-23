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

  async list(prefix: string): Promise<string[]> {
    const dir = path.join(this.root, path.dirname(`${prefix}x`));
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const dirKey = path.dirname(`${prefix}x`);
    return entries
      .map((name) => (dirKey === '.' ? name : `${dirKey}/${name}`))
      .filter((key) => key.startsWith(prefix) && !key.endsWith('.tmp'))
      .sort();
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
