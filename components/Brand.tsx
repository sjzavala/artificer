/**
 * The wordmark: a serif name beside a small filled square.
 *
 * The square is the only mark in the product. It reads as a stamp — the thing a
 * reviewer puts on a document once they have signed off — which is exactly what
 * this tool is for, and it doubles as the favicon-scale identity.
 */
export function Brand({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const scale = {
    sm: { text: 'text-[0.9375rem]', mark: 'h-1.5 w-1.5', gap: 'gap-1.5' },
    md: { text: 'text-lg', mark: 'h-[0.4375rem] w-[0.4375rem]', gap: 'gap-2' },
    lg: { text: 'text-[2.125rem] leading-none', mark: 'h-2.5 w-2.5', gap: 'gap-2.5' },
  }[size];

  return (
    <span className={`inline-flex select-none items-baseline ${scale.gap}`}>
      <span className={`display font-semibold text-ink ${scale.text}`}>Artificer</span>
      <span aria-hidden className={`inline-block shrink-0 rounded-[1px] bg-accent ${scale.mark}`} />
    </span>
  );
}
