import type { Config } from 'tailwindcss';

/**
 * Artificer's palette is narrow on purpose: warm paper, near-black ink, and a
 * single deep-green accent reserved for approval-forward actions. Confidence
 * chips are the only saturated colour on screen, so the eye goes straight to
 * the fields that need a decision.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf9f7',
        panel: '#ffffff',
        sunken: '#f4f3f0',
        ink: {
          DEFAULT: '#16191f',
          soft: '#3d4550',
          muted: '#5f6a78',
          faint: '#95a0ae',
        },
        rule: {
          DEFAULT: '#e6e4df',
          strong: '#d5d2cb',
        },
        accent: {
          DEFAULT: '#14532d',
          hover: '#1a6b3a',
          soft: '#eef4ef',
          ring: '#b9d2c3',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 25, 31, 0.04), 0 1px 3px rgba(22, 25, 31, 0.05)',
        raised: '0 2px 4px rgba(22, 25, 31, 0.05), 0 6px 16px rgba(22, 25, 31, 0.07)',
        lifted: '0 12px 40px rgba(22, 25, 31, 0.14)',
        inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      backgroundImage: {
        // A barely-there warm wash so a full page of white cards has something
        // to sit on. It should read as paper, never as a gradient.
        'paper-wash':
          'radial-gradient(1200px 500px at 12% -8%, rgba(20, 83, 45, 0.045), transparent 60%), radial-gradient(900px 420px at 100% 0%, rgba(120, 113, 96, 0.05), transparent 55%)',
      },
    },
  },
  plugins: [],
};

export default config;
