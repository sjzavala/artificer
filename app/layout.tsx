import type { Metadata, Viewport } from 'next';
import { sans, serif } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Artificer — Net-Lease Deal Intake',
  description:
    'AI-assisted extraction of net-lease deal data from offering memos, leases and LOIs, with human approval before anything reaches Salesforce.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
