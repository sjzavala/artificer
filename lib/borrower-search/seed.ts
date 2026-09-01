/**
 * The fixture: sixty borrowers, generated deterministically.
 *
 * Byte-identical to the borrower-search sandbox's dataset, and deliberately so
 * — "search Smith, expect 3 results" is an assertion in that repo's test cases
 * and in claude-agent-swarm's ground truth. Changing a name here silently
 * invalidates work that lives in two other repositories.
 *
 * No randomness anywhere: the same sixty rows every time, so boundary cases
 * stay exact.
 */

import type { BorrowerRecord, BorrowerStatus } from './types';

const FIRST = [
  'James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Jennifer',
  'William', 'Elizabeth', 'Richard', 'Barbara', 'Joseph', 'Susan', 'Thomas',
  'Jessica', 'Charles', 'Sarah', 'Daniel', 'Karen',
];

const LAST = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', "O'Brien", 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Nguyen', 'Taylor', 'Moore', 'Jackson', 'Martin',
];

const STATES = ['CA', 'TX', 'NY', 'FL', 'WA', 'CO', 'IL', 'GA', 'AZ', 'NC'];
const STATUSES: BorrowerStatus[] = ['Approved', 'Pending', 'Denied', 'Withdrawn'];

export const BORROWER_COUNT = 60;

function build(): BorrowerRecord[] {
  const rows: BorrowerRecord[] = [];

  for (let i = 0; i < BORROWER_COUNT; i += 1) {
    // The two name lists are the same length, so a plain `i % len` on both would
    // lock them in step and every Smith would also be a James. Offsetting the
    // first name by the cycle count keeps the pairings varied.
    const first = FIRST[(i + Math.floor(i / LAST.length)) % FIRST.length];
    const last = LAST[i % LAST.length];

    rows.push({
      id: i + 1,
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${i + 1}@example.com`,
      ssn: `${100 + i}-${10 + (i % 89)}-${String(1000 + i * 7).slice(-4)}`,
      creditScore: 580 + ((i * 37) % 241),
      loanAmount: 50000 + ((i * 17) % 40) * 25000,
      state: STATES[i % STATES.length],
      status: STATUSES[i % STATUSES.length],
      submittedAt: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
    });
  }

  // Fixed anchors, so the interesting boundaries are exact rather than
  // whatever the generator happened to produce.
  rows[5].creditScore = 700; // Patricia Garcia — sits exactly on a common filter threshold
  rows[12].creditScore = 700; // Joseph Gonzalez — the second borrower on that threshold
  rows[3].loanAmount = 90000; // Linda Brown — sorts above 100000 if compared as text
  rows[7].loanAmount = 100000; // Jennifer Davis
  rows[9].loanAmount = 950000; // Elizabeth Martinez

  return rows;
}

/**
 * A fresh copy each call. The in-memory repository mutates status, and handing
 * out a shared array would let one test's write change the next test's fixture.
 */
export function seedBorrowers(): BorrowerRecord[] {
  return build().map((row) => ({ ...row }));
}
