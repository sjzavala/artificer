'use client';

/**
 * A guided end-to-end walkthrough for someone opening Artificer for the first
 * time.
 *
 * Steps complete from the actions themselves — clicking a citation, correcting
 * a field, approving — rather than from a "Next" button. A tour you can click
 * through without doing anything teaches nothing, and the point here is that
 * the reviewer feels the human-in-the-loop step rather than reads about it.
 *
 * Progress is per-browser and disposable; it is a demo aid, not app state.
 */

export const WALKTHROUGH_EVENT = 'artificer:walkthrough-changed';
const STORAGE_KEY = 'artificer.walkthrough.v1';

export type StepId =
  | 'open-deal'
  | 'check-citation'
  | 'resolve-flag'
  | 'approve'
  | 'view-record'
  | 'draft-om';

export interface WalkthroughStep {
  id: StepId;
  title: string;
  body: string;
  /** Where the step happens, when it can be linked to directly. */
  where: 'deals' | 'review' | 'record';
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'open-deal',
    title: 'Open the sample deal',
    body: 'A Dollar General offering memo, already extracted. Twenty-four net-lease fields, each graded by how directly the document states it.',
    where: 'deals',
  },
  {
    id: 'check-citation',
    title: 'Check where a value came from',
    body: 'Click any field on the right. The document scrolls to the exact passage it was read from and highlights it. No value on this screen is unsourced.',
    where: 'review',
  },
  {
    id: 'resolve-flag',
    title: 'Resolve a flagged field',
    body: 'Two fields are flagged. Building SF is one of them — the summary page says 9,100 SF and the property description says 9,026. Click the value and decide.',
    where: 'review',
  },
  {
    id: 'approve',
    title: 'Approve the deal',
    body: 'Approve & Write to Salesforce. You will see exactly which objects and how many fields are about to be written before anything happens.',
    where: 'review',
  },
  {
    id: 'view-record',
    title: 'See the CRM records',
    body: 'Four linked records — Property, Tenant, Lease and Deal. Approving the same values again updates them rather than creating duplicates.',
    where: 'record',
  },
  {
    id: 'draft-om',
    title: 'Draft the offering memo summary',
    body: 'Generated from the approved record, not the original document — so the draft can only contain values a person signed off on.',
    where: 'review',
  },
];

export interface WalkthroughState {
  done: StepId[];
  dismissed: boolean;
  collapsed: boolean;
}

const EMPTY: WalkthroughState = { done: [], dismissed: false, collapsed: false };

export function readWalkthrough(): WalkthroughState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<WalkthroughState>;
    return {
      done: Array.isArray(parsed.done) ? (parsed.done as StepId[]) : [],
      dismissed: Boolean(parsed.dismissed),
      collapsed: Boolean(parsed.collapsed),
    };
  } catch {
    return EMPTY;
  }
}

function write(state: WalkthroughState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing: the walkthrough simply will not remember progress.
  }
  window.dispatchEvent(new Event(WALKTHROUGH_EVENT));
}

/** Idempotent, so a component may call it on every occurrence of the action. */
export function completeStep(id: StepId): void {
  const state = readWalkthrough();
  if (state.done.includes(id)) return;
  write({ ...state, done: [...state.done, id] });
}

export function setCollapsed(collapsed: boolean): void {
  write({ ...readWalkthrough(), collapsed });
}

export function dismissWalkthrough(): void {
  write({ ...readWalkthrough(), dismissed: true });
}

export function restartWalkthrough(): void {
  write({ done: [], dismissed: false, collapsed: false });
}

/** The first incomplete step — what the panel should be pointing at. */
export function nextStep(state: WalkthroughState): WalkthroughStep | null {
  return WALKTHROUGH_STEPS.find((step) => !state.done.includes(step.id)) ?? null;
}
