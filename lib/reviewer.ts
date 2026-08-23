'use client';

const STORAGE_KEY = 'artificer.reviewer';
export const REVIEWER_EVENT = 'artificer:reviewer-changed';

/** The name recorded as "who" in the audit log. Browser-local, never sent anywhere else. */
export function getReviewerName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setReviewerName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private browsing — the reviewer name simply will not persist.
  }
  window.dispatchEvent(new Event(REVIEWER_EVENT));
}

/** Falls back to a clearly non-attributed label rather than silently blank. */
export function requireReviewerName(): string {
  return getReviewerName().trim() || 'Unnamed reviewer';
}
