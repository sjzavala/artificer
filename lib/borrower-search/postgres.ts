/**
 * The Postgres repository — Neon over HTTP.
 *
 * The HTTP driver rather than a pooled TCP client, because these routes run as
 * serverless functions: there is no long-lived process to hold a pool, and a
 * connection established per invocation is the thing that makes Postgres slow
 * on Vercel. One request, one fetch.
 */

import { neon } from '@neondatabase/serverless';
import { buildSearchSql, SELECT_COLUMNS } from './queries';
import {
  type Borrower,
  type BorrowerQuery,
  type BorrowerRepo,
  type BorrowerSearchResult,
  type BorrowerStatus,
} from './types';

type Sql = ReturnType<typeof neon>;

export class PostgresBorrowerRepo implements BorrowerRepo {
  constructor(private readonly sql: Sql) {}

  async search(query: BorrowerQuery): Promise<BorrowerSearchResult> {
    const { rowsSql, countSql, filterParams, rowsParams } = buildSearchSql(query);

    // Two round trips, issued together. The count is not derivable from the
    // page — that assumption is exactly what BUG-4 was.
    const [rows, totals] = await Promise.all([
      this.sql.query(rowsSql, rowsParams),
      this.sql.query(countSql, filterParams),
    ]);

    const total = Number((totals as { total: number }[])[0]?.total ?? 0);

    return {
      results: rows as Borrower[],
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async byId(id: number): Promise<Borrower | null> {
    const rows = (await this.sql.query(
      `SELECT ${SELECT_COLUMNS} FROM borrowers WHERE id = $1`,
      [id],
    )) as Borrower[];
    return rows[0] ?? null;
  }

  async updateStatus(id: number, status: BorrowerStatus): Promise<Borrower | null> {
    const rows = (await this.sql.query(
      `UPDATE borrowers SET status = $1 WHERE id = $2 RETURNING ${SELECT_COLUMNS}`,
      [status, id],
    )) as Borrower[];
    return rows[0] ?? null;
  }
}
