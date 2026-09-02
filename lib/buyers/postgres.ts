/**
 * The Postgres repository — Neon over HTTP.
 *
 * The HTTP driver rather than a pooled TCP client, because these routes run as
 * serverless functions: there is no long-lived process to hold a pool, and a
 * connection established per invocation is the thing that makes Postgres slow
 * on Vercel. One request, one fetch.
 */

import { neon } from '@neondatabase/serverless';
import { today, type Buyer, type BuyerStatus } from '@/shared/buyer';
import { decorate } from './decorate';
import { buildSearchSql, SELECT_COLUMNS } from './queries';
import type { BuyerQuery, BuyerRepo, BuyerRow, BuyerSearchResult } from './types';

type Sql = ReturnType<typeof neon>;

export class PostgresBuyerRepo implements BuyerRepo {
  constructor(private readonly sql: Sql) {}

  async search(query: BuyerQuery, now: string = today()): Promise<BuyerSearchResult> {
    const { rowsSql, countSql, filterParams, rowsParams } = buildSearchSql(query, now);

    // Two round trips, issued together. The count is not derivable from the
    // page — assuming otherwise is what made a filtered search misreport its
    // own size.
    const [rows, totals] = await Promise.all([
      this.sql.query(rowsSql, rowsParams),
      this.sql.query(countSql, filterParams),
    ]);

    const total = Number((totals as { total: number }[])[0]?.total ?? 0);

    return {
      results: (rows as Buyer[]).map((row) => decorate(row, now)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async byId(id: number, now: string = today()): Promise<BuyerRow | null> {
    const rows = (await this.sql.query(
      `SELECT ${SELECT_COLUMNS} FROM buyers WHERE id = $1`,
      [id],
    )) as Buyer[];
    return rows[0] ? decorate(rows[0], now) : null;
  }

  async updateStatus(id: number, status: BuyerStatus, now: string = today()): Promise<BuyerRow | null> {
    const rows = (await this.sql.query(
      `UPDATE buyers SET status = $1 WHERE id = $2 RETURNING ${SELECT_COLUMNS}`,
      [status, id],
    )) as Buyer[];
    return rows[0] ? decorate(rows[0], now) : null;
  }
}
