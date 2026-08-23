'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';

export function GateForm({ next }: { next?: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !code.trim()) return;

    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        // A full navigation, not a client transition: the middleware has to see
        // the new cookie before it decides where this visitor is allowed.
        window.location.href = safeNext(next);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'That code was not accepted.');
      setCode('');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="access-code" className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
        Access code
      </label>

      <input
        id="access-code"
        name="code"
        type="password"
        autoComplete="off"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'access-error' : undefined}
        className="focus-ring mt-2 w-full rounded-md border border-rule bg-white px-3 py-2.5 font-mono text-[0.9375rem] tracking-[0.18em] text-ink placeholder:tracking-normal placeholder:font-sans placeholder:text-ink-faint"
        placeholder="Enter code"
      />

      {error ? (
        <p id="access-error" role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !code.trim()}
        className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : null}
        {pending ? 'Checking' : 'Enter'}
        {!pending ? <ArrowRight size={16} /> : null}
      </button>
    </form>
  );
}

/** Only same-origin, absolute-path redirects — never an attacker-supplied host. */
function safeNext(next?: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
