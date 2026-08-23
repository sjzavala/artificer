import { Inter, Source_Serif_4 } from 'next/font/google';

/**
 * Two faces, each with a job.
 *
 * Inter carries the interface — dense, neutral, excellent tabular figures for
 * money columns. Source Serif carries the wordmark and page titles, because a
 * deal-intake tool should feel adjacent to the documents it reads rather than
 * to a dashboard. Restricting the serif to display sizes keeps that flavour
 * without costing legibility anywhere it matters.
 */
export const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const serif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});
