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
        className="focus-ring w-40 rounded-md border border-rule bg-white px-2.5 py-1 text-sm text-ink"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Set the name recorded in the audit log"
      className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1 text-sm text-ink-muted transition-colors hover:text-ink"
    >
      <UserRound size={14} />
      {name || 'Set reviewer'}
    </button>
  );
}
