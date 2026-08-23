import { Brand } from '@/components/Brand';
import { GateForm } from '@/components/GateForm';

export const metadata = { title: 'Artificer — Access' };

const STEPS = [
  { n: '01', label: 'Document in', text: 'An offering memo, lease or LOI.' },
  { n: '02', label: 'Claude extracts', text: 'Every field cited to a passage.' },
  { n: '03', label: 'A person decides', text: 'Nothing is written until you approve.' },
];

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-14">
      <div className="rise w-full max-w-[52rem]">
        <div className="overflow-hidden rounded-xl border border-rule bg-panel shadow-raised md:grid md:grid-cols-[1.05fr_1fr]">
          {/* Left: what this is. The gate is the first impression, so it should
              explain the product rather than just demand a password. */}
          <div className="border-b border-rule bg-sunken px-8 py-9 md:border-b-0 md:border-r md:px-9 md:py-10">
            <Brand size="lg" />

            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-ink-soft">
              Deal intake for net-lease commercial real estate. Documents in, reviewed data out —
              nothing reaches the CRM without a person approving it.
            </p>

            <div className="mt-8 hairline" />

            <ol className="mt-6 space-y-4">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-3.5">
                  <span className="tnum mt-px shrink-0 font-mono text-2xs text-accent">{step.n}</span>
                  <span>
                    <span className="block text-xs font-medium text-ink">{step.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{step.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Right: the actual gate. */}
          <div className="flex flex-col justify-center px-8 py-9 md:px-9 md:py-10">
            <GateForm next={next} />
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-md text-center text-2xs leading-relaxed text-ink-faint">
          Access is controlled by a single shared code. This is a demonstration lock, not
          authentication — it exists so a public URL cannot spend API tokens or expose demo deal data.
        </p>
      </div>
    </main>
  );
}
