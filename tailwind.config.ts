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
        // Dark chrome. A single deep band at the top stops the page reading as
        // an undifferentiated sheet of white.
        chrome: {
          DEFAULT: '#151b22',
          soft: '#1e2732',
          line: '#2c3743',
          text: '#c8d1dc',
        },
        // One hue per schema section. Functional, not decorative: in a
        // twenty-four row list, colour is how you find your place again.
        property: { DEFAULT: '#1d4ed8', soft: '#eff4ff', ring: '#bfd3fb' },
        tenantc: { DEFAULT: '#6d28d9', soft: '#f5f1fe', ring: '#d5c6f7' },
        leasec: { DEFAULT: '#b45309', soft: '#fdf5eb', ring: '#f2d7ae' },
        econ: { DEFAULT: '#0f766e', soft: '#eefaf7', ring: '#b3ded7' },
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
          'radial-gradient(1100px 520px at 8% -10%, rgba(29, 78, 216, 0.06), transparent 62%), radial-gradient(900px 460px at 96% -4%, rgba(15, 118, 110, 0.06), transparent 58%), radial-gradient(700px 420px at 60% 100%, rgba(180, 83, 9, 0.035), transparent 60%)',
        'chrome-sheen':
          'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%)',
      },
    },
  },
  plugins: [],
};

export default config;
