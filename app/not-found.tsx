import Link from 'next/link';
import { Brand } from '@/components/Brand';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <Brand size="lg" />
        <p className="mt-5 text-sm text-ink-muted">That page does not exist.</p>
        <Link
          href="/deals"
          className="focus-ring mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Back to deals
        </Link>
      </div>
    </main>
  );
}
