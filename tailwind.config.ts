import type { Config } from 'tailwindcss';

/**
 * Artificer's palette is deliberately narrow: near-white paper, slate ink, and
 * a single deep-green accent reserved for approval-forward actions. The only
 * saturated colors on screen belong to confidence chips.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#fbfbfa',
        panel: '#ffffff',
        ink: {
          DEFAULT: '#1e293b',
          muted: '#64748b',
          faint: '#94a3b8',
        },
        rule: '#e6e7e4',
        accent: {
          DEFAULT: '#14532d',
          hover: '#166534',
          soft: '#f0f6f2',
          ring: '#bbd6c4',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        lifted: '0 10px 30px rgba(15, 23, 42, 0.10)',
      },
    },
  },
  plugins: [],
};

export default config;
