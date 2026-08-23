'use client';

import { useEffect } from 'react';
import { completeStep, type StepId } from '@/lib/walkthrough';

/**
 * Marks a walkthrough step done on mount. Server-rendered pages have no other
 * way to report "the reviewer actually got here", and arriving at the page *is*
 * the completion of the step.
 */
export function StepMarker({ step }: { step: StepId }) {
  useEffect(() => {
    completeStep(step);
  }, [step]);

  return null;
}
