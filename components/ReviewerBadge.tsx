'use client';

import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { getReviewerName, setReviewerName, REVIEWER_EVENT } from '@/lib/reviewer';

/**
 * "Who" for the audit log. There are no user accounts — the access gate is the
 * only auth — so the reviewer types their name once and it rides along with
 * every action they take.
 */
export function ReviewerBadge() {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(getReviewerName());
    const sync = () => setName(getReviewerName());
    window.addEventListener(REVIEWER_EVENT, sync);
    return () => window.removeEventListener(REVIEWER_EVENT, sync);
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit(next: string) {
    const cleaned = next.trim().slice(0, 60);
    setReviewerName(cleaned);
    setName(cleaned);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={name}
        autoFocus
        placeholder="Your name"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') setEditing(false);
        }}
        className="focus-ring w-44 rounded-full border border-rule-strong bg-white px-3.5 py-1.5 text-sm text-ink"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Set the name recorded in the audit log"
      className="focus-ring inline-flex items-center gap-2 rounded-full border border-chrome-line bg-chrome-soft py-1 pl-1 pr-3 text-sm text-chrome-text transition-colors hover:border-chrome-text/40 hover:text-white"
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold ${
          name ? 'bg-emerald-500 text-white' : 'bg-chrome text-chrome-text/60'
        }`}
      >
        {name ? initials(name) : <UserRound size={12} />}
      </span>
      <span className="max-w-[9rem] truncate">{name || 'Set reviewer'}</span>
    </button>
  );
}

/** Up to two initials, so the badge stays a fixed size regardless of name length. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
