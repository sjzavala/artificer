import { Mark } from './Mark';

/**
 * The wordmark: the dividers mark beside a serif name.
 *
 * The mark used to be a small filled square sitting after the word — legible at
 * any size and saying nothing. Dividers say what the tool is for: an instrument
 * you set once so that every measurement after it agrees.
 *
 * It leads rather than trails now, because a mark after the name is decoration
 * and a mark before it is identity — and it is the half that has to work alone,
 * in a browser tab.
 */
export function Brand({ size = 'md', onDark = false }: { size?: 'sm' | 'md' | 'lg'; onDark?: boolean }) {
  const scale = {
    sm: { text: 'text-[0.9375rem]', mark: 'h-4 w-4', gap: 'gap-1.5' },
    md: { text: 'text-lg', mark: 'h-[1.125rem] w-[1.125rem]', gap: 'gap-2' },
    lg: { text: 'text-[2.125rem] leading-none', mark: 'h-8 w-8', gap: 'gap-2.5' },
  }[size];

  return (
    <span className={`inline-flex select-none items-center ${scale.gap}`}>
      <Mark
        className={`${scale.mark} shrink-0 ${onDark ? 'text-white' : 'text-ink'}`}
        // The pivot is the one coloured thing, matching the accent the rest of
        // the product reserves for decisions.
        accent={onDark ? '#34d399' : '#14532d'}
      />
      <span className={`display font-semibold ${onDark ? 'text-white' : 'text-ink'} ${scale.text}`}>
        Artificer
      </span>
    </span>
  );
}
