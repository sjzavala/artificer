import { Brand } from '@/components/Brand';
import { GateForm } from '@/components/GateForm';

export const metadata = { title: 'Artificer — Access' };

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-[27rem]">
        <div className="mb-10">
          <Brand size="lg" />
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">
            Deal intake for net-lease commercial real estate. Documents in, reviewed data out — nothing
            reaches the CRM without a person approving it.
          </p>
        </div>

        <div className="rounded-lg border border-rule bg-panel p-6 shadow-card">
          <GateForm next={next} />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-ink-faint">
          Access is controlled by a single shared code. This is a demonstration lock, not
          authentication — it exists so a public URL cannot spend API tokens or expose deal data.
        </p>
      </div>
    </main>
  );
}
