import { getStore } from './store';
import { newId } from './ids';
import type { AuditAction, AuditEntry } from '@/shared/deal';

const LOG_KEY = 'audit/log.json';

/**
 * Appends are serialised through this promise chain. The store has no
 * compare-and-swap, so two concurrent read-modify-writes would silently drop an
 * entry; within a single server instance this queue prevents that. It is the
 * documented limit of the demo's durability story.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export interface AuditInput {
  dealId: string | null;
  actor: string;
  action: AuditAction;
  summary: string;
  details?: Record<string, unknown>;
}

/** Append-only: there is deliberately no update or delete counterpart. */
export async function recordAudit(input: AuditInput): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: newId('a_'),
    at: new Date().toISOString(),
    dealId: input.dealId,
    actor: input.actor?.trim() || 'unknown',
    action: input.action,
    summary: input.summary,
    ...(input.details ? { details: input.details } : {}),
  };

  await serialise(async () => {
    const store = getStore();
    const log = (await store.read<AuditEntry[]>(LOG_KEY)) ?? [];
    log.push(entry);
    await store.write(LOG_KEY, log);
  });

  return entry;
}

/** Newest first. Optionally narrowed to a single deal. */
export async function readAudit(dealId?: string): Promise<AuditEntry[]> {
  const log = (await getStore().read<AuditEntry[]>(LOG_KEY)) ?? [];
  const filtered = dealId ? log.filter((e) => e.dealId === dealId) : log;
  return [...filtered].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
