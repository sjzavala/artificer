'use client';

import { BorrowerStatusPill } from './BorrowerStatusPill';
import { formatMoney } from '@/lib/format';
import { BORROWER_STATUSES, type Borrower, type BorrowerStatus } from '@/lib/borrower-search/types';

/**
 * The results table.
 *
 * The SSN column shows `••• •• 1234` and that is genuinely all the client has —
 * the API sends four digits, not nine (BUG-8). The masking here is presentation,
 * not protection, which is the distinction the sandbox got wrong.
 */
export function BorrowerTable({
  borrowers,
  onStatusChange,
  pendingId,
}: {
  borrowers: Borrower[];
  onStatusChange: (id: number, status: BorrowerStatus) => void;
  /** The row whose status write is in flight, so its control can lock. */
  pendingId: number | null;
}) {
  return (
    // The table scrolls inside its own box rather than pushing the page sideways.
    <div className="scroll-pane overflow-x-auto rounded-lg border border-rule bg-panel shadow-card">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <caption className="sr-only">Borrower loan applications</caption>
        <thead>
          <tr className="border-b border-rule bg-sunken/60">
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>SSN</Th>
            <Th align="right">Credit score</Th>
            <Th align="right">Loan amount</Th>
            <Th>State</Th>
            <Th>Submitted</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {borrowers.map((borrower) => (
            <tr key={borrower.id} className="border-b border-rule/70 last:border-0 hover:bg-sunken/40">
              <Td className="whitespace-nowrap font-medium text-ink">
                {borrower.firstName} {borrower.lastName}
              </Td>
              <Td className="text-ink-muted">{borrower.email}</Td>
              <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">
                <span aria-hidden>••• •• {borrower.ssnLast4}</span>
                <span className="sr-only">Ending {borrower.ssnLast4}</span>
              </Td>
              <Td align="right" className="tabular-nums text-ink">
                {borrower.creditScore}
              </Td>
              <Td align="right" className="tabular-nums text-ink">
                {formatMoney(borrower.loanAmount)}
              </Td>
              <Td className="text-ink-muted">{borrower.state}</Td>
              <Td className="whitespace-nowrap text-ink-muted">{borrower.submittedAt}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <BorrowerStatusPill status={borrower.status} />
                  <select
                    aria-label={`Status for ${borrower.firstName} ${borrower.lastName}`}
                    value={borrower.status}
                    disabled={pendingId === borrower.id}
                    onChange={(e) => onStatusChange(borrower.id, e.target.value as BorrowerStatus)}
                    className="focus-ring rounded-md border border-rule bg-white px-1.5 py-1 text-2xs text-ink-muted disabled:opacity-50"
                  >
                    {BORROWER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`eyebrow px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  );
}
