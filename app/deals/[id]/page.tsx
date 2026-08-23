import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ReviewScreen } from '@/components/ReviewScreen';
import { getDeal } from '@/lib/deals';
import { salesforceMode } from '@/lib/salesforce';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) notFound();

  return (
    <AppShell active="deals" salesforceMode={salesforceMode()}>
      <ReviewScreen deal={deal} salesforceMode={salesforceMode()} />
    </AppShell>
  );
}
