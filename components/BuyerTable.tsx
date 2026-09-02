'use client';

import { BuyerStatusPill, CapitalSourceTag, IdentificationClock } from './BuyerBadges';
import { formatMoney } from '@/lib/format';
import { BUYER_STATUSES, type BuyerStatus } from '@/shared/buyer';
import type { BuyerRow } from '@/lib/buyers/types';

export function BuyerTable({
  buyers,
  onStatusChange,
  pendingId,
}: {
  buyers: BuyerRow[];
  onStatusChange: (id: number, status: BuyerStatus) => void;
  /** The row whose status write is in flight, so its control can lock. */
  pendingId: number | null;
}) {
  return (
    // The table scrolls inside its own box rather than pushing the page sideways.
    <div className="scroll-pane overflow-x-auto rounded-lg border border-rule bg-panel shadow-card">
      <table className="w-full min-w-[64rem] border-collapse text-sm">
        <caption className="sr-only">Buyers in the acquisition pipeline</caption>
        <thead>
          <tr className="border-b border-rule bg-sunken/60">
            <Th>Buyer</Th>
            <Th align="right">Equity</Th>
            <Th align="right">Target cap</Th>
            <Th>Asset class</Th>
            <Th>Guaranty</Th>
            <Th>Markets</Th>
            <Th>Identify by</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {buyers.map((buyer) => (
            <tr key={buyer.id} className="border-b border-rule/70 last:border-0 align-top hover:bg-sunken/40">
              <Td>
                <div className="font-medium text-ink">{buyer.entityName}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{buyer.contactName}</div>
                <div className="mt-1">
                  <CapitalSourceTag source={buyer.capitalSource} />
                </div>
              </Td>

              <Td align="right" className="whitespace-nowrap tabular-nums text-ink">
                {formatMoney(buyer.equity)}
              </Td>

              <Td align="right" className="whitespace-nowrap tabular-nums text-ink-muted">
                {buyer.targetCapRateMin.toFixed(2)}–{buyer.targetCapRateMax.toFixed(2)}%
              </Td>

              <Td className="capitalize text-ink-muted">{buyer.propertyTypes.join(', ')}</Td>

              <Td className="text-ink-muted">{buyer.minGuarantor}</Td>

              <Td className="text-ink-muted">{buyer.markets.join(' · ')}</Td>

              <Td>
                <IdentificationClock
                  urgency={buyer.urgency}
                  deadline={buyer.identifyBy}
                  daysLeft={buyer.daysToIdentify}
                />
              </Td>

              <Td>
                <div className="flex flex-col gap-1.5">
                  <BuyerStatusPill status={buyer.status} />
                  <select
                    aria-label={`Status for ${buyer.entityName}`}
                    value={buyer.status}
                    disabled={pendingId === buyer.id}
                    onChange={(e) => onStatusChange(buyer.id, e.target.value as BuyerStatus)}
                    className="focus-ring rounded-md border border-rule bg-white px-1.5 py-1 text-2xs capitalize text-ink-muted disabled:opacity-50"
                  >
                    {BUYER_STATUSES.map((status) => (
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

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th scope="col" className={`eyebrow px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>
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
    <td className={`px-3 py-3 ${align === 'right' ? 'text-right' : ''} ${className}`}>{children}</td>
  );
}
