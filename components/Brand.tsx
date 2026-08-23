/**
 * The wordmark. The gate page is the first impression a stakeholder gets, so it
 * and the app proper share one identity rather than two near-misses.
 */
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <span className="inline-flex items-baseline gap-2 select-none">
      <span
        className={`font-semibold tracking-tight text-ink ${large ? 'text-3xl' : 'text-[1.0625rem]'}`}
        style={{ letterSpacing: '-0.02em' }}
      >
        Artificer
      </span>
      <span
        aria-hidden
        className={`inline-block rounded-sm bg-accent ${large ? 'h-2 w-2' : 'h-1.5 w-1.5'}`}
      />
    </span>
  );
}
