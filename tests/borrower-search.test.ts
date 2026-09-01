import { describe, expect, it } from 'vitest';
import { InMemoryBorrowerRepo } from '@/lib/borrower-search/memory';
import { buildSearchSql, normalizeQuery, parseBorrowerId } from '@/lib/borrower-search/queries';
import { seedBorrowers, BORROWER_COUNT } from '@/lib/borrower-search/seed';
import { DEFAULT_LIMIT, MAX_LIMIT, type BorrowerQuery } from '@/lib/borrower-search/types';

/**
 * The borrower-search sandbox ships ten deliberate defects for QA practice.
 * Porting the feature into artificer means fixing them, and a fix nobody
 * asserts is a fix that comes back — so each one has a test named after it,
 * written to fail against the original behaviour.
 *
 * The fixture is what makes these exact rather than approximate: three Smiths,
 * two borrowers scoring exactly 700, and loan amounts chosen so a text sort and
 * a numeric sort disagree visibly.
 */

const repo = () => new InMemoryBorrowerRepo();

function query(overrides: Partial<BorrowerQuery> = {}): BorrowerQuery {
  return {
    q: '',
    status: null,
    state: null,
    minScore: null,
    sortBy: 'id',
    page: 1,
    limit: DEFAULT_LIMIT,
    ...overrides,
  };
}

const params = (search: string) => normalizeQuery(new URLSearchParams(search));

describe('the fixture', () => {
  const rows = seedBorrowers();

  it('is the same sixty borrowers the sandbox seeds', () => {
    expect(rows).toHaveLength(BORROWER_COUNT);
    expect(rows[0]).toMatchObject({ id: 1, firstName: 'James', lastName: 'Smith' });
    expect(rows.at(-1)).toMatchObject({ id: 60, lastName: 'Martin' });
  });

  it('keeps the anchors the downstream test cases assert on', () => {
    // "Search Smith, expect 3 results" is ground truth in two other repos.
    expect(rows.filter((r) => r.lastName === 'Smith').map((r) => r.id)).toEqual([1, 21, 41]);
    expect(rows.filter((r) => r.creditScore === 700).map((r) => r.id)).toEqual([6, 13]);
    expect(rows.find((r) => r.id === 4)?.loanAmount).toBe(90000);
    expect(rows.find((r) => r.id === 10)?.loanAmount).toBe(950000);
  });

  it('hands out a fresh copy each call, so a status edit cannot leak between tests', async () => {
    const first = repo();
    await first.updateStatus(1, 'Denied');
    expect((await repo().byId(1))?.status).toBe('Approved');
  });
});

describe('BUG-1 — search is case-insensitive', () => {
  it('finds the Smiths however the name is typed', async () => {
    for (const term of ['Smith', 'smith', 'SMITH', 'sMiTh']) {
      const { results, total } = await repo().search(query({ q: term }));
      expect(total, `searching "${term}"`).toBe(3);
      expect(results.map((r) => r.id)).toEqual([1, 21, 41]);
    }
  });

  it('emits ILIKE rather than LIKE', () => {
    const { rowsSql } = buildSearchSql(query({ q: 'smith' }));
    expect(rowsSql).toMatch(/ILIKE/);
    expect(rowsSql).not.toMatch(/[^I]LIKE/);
  });
});

describe('BUG-2 — the query is trimmed', () => {
  it('ignores surrounding whitespace', async () => {
    const { total } = await repo().search(query({ q: params('q=+++Smith+++').q }));
    expect(total).toBe(3);
  });

  it('treats an all-whitespace query as no filter at all', async () => {
    expect(params('q=+++').q).toBe('');
    const { total } = await repo().search(query({ q: params('q=+++').q }));
    expect(total).toBe(BORROWER_COUNT);
  });
});

describe('BUG-3 — a page returns a full page', () => {
  it('returns `limit` rows, not `limit - 1`', async () => {
    const { results } = await repo().search(query({ limit: 10 }));
    expect(results).toHaveLength(10);
  });

  it('leaves no borrower unreachable through pagination', async () => {
    const seen: number[] = [];
    for (let page = 1; page <= 6; page += 1) {
      const { results } = await repo().search(query({ page, limit: 10 }));
      seen.push(...results.map((r) => r.id));
    }
    // The sandbox skipped 10, 20, 30, 40, 50 and 60 entirely.
    expect(seen).toHaveLength(BORROWER_COUNT);
    expect(new Set(seen).size).toBe(BORROWER_COUNT);
    expect(seen).toContain(10);
    expect(seen).toContain(60);
  });

  it('passes the real limit to SQL', () => {
    const { rowsParams } = buildSearchSql(query({ page: 2, limit: 10 }));
    expect(rowsParams.slice(-2)).toEqual([10, 10]);
  });
});

describe('BUG-4 — the total respects the filters', () => {
  it('counts matches, not the whole table', async () => {
    const { total, totalPages } = await repo().search(query({ q: 'Smith' }));
    expect(total).toBe(3);
    // The sandbox claimed 60 borrowers across 6 pages, 5 of them empty.
    expect(totalPages).toBe(1);
  });

  it('gives the count query the same WHERE and parameters as the rows query', () => {
    const { countSql, filterParams, rowsParams } = buildSearchSql(query({ q: 'Smith', status: 'Approved' }));
    expect(countSql).toMatch(/WHERE/);
    expect(countSql).toMatch(/ILIKE/);
    expect(filterParams).toEqual(['%Smith%', 'Approved']);
    // The rows query adds only limit and offset on top of the same filters.
    expect(rowsParams.slice(0, filterParams.length)).toEqual(filterParams);
  });
});

describe('BUG-5 — the credit score floor is inclusive', () => {
  it('keeps the two borrowers scoring exactly 700', async () => {
    const { results, total } = await repo().search(query({ minScore: 700, limit: MAX_LIMIT }));
    expect(total).toBe(31); // 29 above the line, plus ids 6 and 13 on it
    expect(results.map((r) => r.id)).toContain(6);
    expect(results.map((r) => r.id)).toContain(13);
  });

  it('emits >= rather than >', () => {
    const { rowsSql } = buildSearchSql(query({ minScore: 700 }));
    expect(rowsSql).toMatch(/credit_score >= \$1/);
  });
});

describe('BUG-6 — loan amount sorts numerically', () => {
  it('puts the largest loan first', async () => {
    const { results } = await repo().search(query({ sortBy: 'loanAmount', limit: 5 }));
    expect(results.map((r) => r.loanAmount)).toEqual([1025000, 1000000, 1000000, 975000, 950000]);
    // Sorted as text, $975,000 led and $1,025,000 fell outside the first page.
    expect(results[0].id).toBe(48);
  });

  it('does not cast the column to text', () => {
    const { rowsSql } = buildSearchSql(query({ sortBy: 'loanAmount' }));
    expect(rowsSql).toMatch(/ORDER BY loan_amount DESC/);
    expect(rowsSql).not.toMatch(/::text/);
  });
});

describe('BUG-8 — the SSN never leaves the server', () => {
  it('returns only the last four digits', async () => {
    const { results } = await repo().search(query({ limit: MAX_LIMIT }));
    for (const row of results) {
      expect(row).not.toHaveProperty('ssn');
      expect(row.ssnLast4).toMatch(/^\d{4}$/);
    }
    expect(results[0].ssnLast4).toBe('1000');
  });

  it('truncates in SQL too, so the full value is never selected', () => {
    const { rowsSql } = buildSearchSql(query());
    expect(rowsSql).toMatch(/right\(ssn, 4\) AS "ssnLast4"/);
    expect(rowsSql).not.toMatch(/^\s*ssn,/m);
  });

  it('does not expose it through the single-borrower route either', async () => {
    const borrower = await repo().byId(1);
    expect(borrower).not.toHaveProperty('ssn');
    expect(borrower?.ssnLast4).toBe('1000');
  });
});

describe('pagination is stable across requests', () => {
  /**
   * Not one of the planted ten, but reachable from the same fixture: ids 6 and
   * 13 both score 700, so ordering by credit score alone leaves their relative
   * position to the database. A row could then appear on two consecutive pages
   * and another on neither.
   */
  it('breaks ties on id so a row cannot repeat or vanish between pages', async () => {
    const first = await repo().search(query({ sortBy: 'creditScore', page: 1, limit: 30 }));
    const second = await repo().search(query({ sortBy: 'creditScore', page: 2, limit: 30 }));
    const ids = [...first.results, ...second.results].map((r) => r.id);
    expect(new Set(ids).size).toBe(BORROWER_COUNT);
  });

  it('names id as the tiebreaker in every non-trivial ordering', () => {
    for (const sortBy of ['lastName', 'creditScore', 'loanAmount', 'submittedAt'] as const) {
      expect(buildSearchSql(query({ sortBy })).rowsSql).toMatch(/, id ASC/);
    }
  });
});

describe('the state filter', () => {
  /** Absent from the sandbox API, and required by the plan's own AI example. */
  it('narrows to one state', async () => {
    const { total } = await repo().search(query({ state: 'CA', limit: MAX_LIMIT }));
    expect(total).toBe(6);
  });

  it('combines with the other filters', async () => {
    const { total } = await repo().search(query({ state: 'CA', status: 'Approved', minScore: 750 }));
    // Worth knowing: the plan's headline demo query matches nothing in this fixture.
    expect(total).toBe(0);
  });
});

describe('normalizeQuery', () => {
  it('defaults everything that is absent', () => {
    expect(params('')).toEqual({
      q: '',
      status: null,
      state: null,
      minScore: null,
      sortBy: 'id',
      page: 1,
      limit: DEFAULT_LIMIT,
    });
  });

  it('drops values it cannot use rather than rejecting the request', () => {
    // A search box should widen on nonsense, not 400 into a table with nothing to render.
    expect(params('status=Bananas').status).toBeNull();
    expect(params('sortBy=DROP+TABLE').sortBy).toBe('id');
    expect(params('minScore=abc').minScore).toBeNull();
    expect(params('state=California').state).toBeNull();
  });

  it('upper-cases a two-letter state', () => {
    expect(params('state=ca').state).toBe('CA');
  });

  it('clamps the page and the limit into a sane range', () => {
    expect(params('page=0').page).toBe(1);
    expect(params('page=-5').page).toBe(1);
    expect(params('limit=0').limit).toBe(1);
    expect(params('limit=100000').limit).toBe(MAX_LIMIT);
  });
});

describe('LIKE metacharacters are escaped', () => {
  /**
   * Arrives with ILIKE rather than from the planted set: without escaping, a
   * search for "%" matches every borrower and "_" matches any character — a
   * pattern language the user never opted into.
   */
  it('treats % and _ as literal text', async () => {
    expect((await repo().search(query({ q: '%' }))).total).toBe(0);
    expect((await repo().search(query({ q: '_mith' }))).total).toBe(0);
  });

  it('escapes them in the parameter and declares the escape character', () => {
    const { filterParams, rowsSql } = buildSearchSql(query({ q: '100%' }));
    expect(filterParams[0]).toBe('%100\\%%');
    expect(rowsSql).toMatch(/ESCAPE '\\'/);
  });
});

describe('parseBorrowerId', () => {
  it('accepts a plain positive integer', () => {
    expect(parseBorrowerId('1')).toBe(1);
    expect(parseBorrowerId('60')).toBe(60);
  });

  it('rejects everything Number() would have quietly accepted', () => {
    // Each of these coerces to a number, and none of them is an id someone typed.
    for (const raw of ['', ' 7 ', '1e3', '0x2a', '1.5', '-1', '0', 'abc', '١٢٣']) {
      expect(parseBorrowerId(raw), `parseBorrowerId(${JSON.stringify(raw)})`).toBeNull();
    }
  });

  it('rejects an integer too large to be exact', () => {
    expect(parseBorrowerId('9007199254740993')).toBeNull();
  });
});

describe('updateStatus', () => {
  it('returns the updated borrower', async () => {
    const store = repo();
    const updated = await store.updateStatus(1, 'Denied');
    expect(updated?.status).toBe('Denied');
    expect((await store.byId(1))?.status).toBe('Denied');
  });

  it('returns null for an id that does not exist', async () => {
    expect(await repo().updateStatus(9999, 'Denied')).toBeNull();
    expect(await repo().byId(9999)).toBeNull();
  });
});
