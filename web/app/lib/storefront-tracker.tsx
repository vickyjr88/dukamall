"use client";

import { useEffect } from 'react';
import { useTracker } from './tracking';

/** Records the start of a visit, with where it came from, as soon as any storefront page opens. Renders nothing. */
export function StorefrontTracker() {
  const { track } = useTracker();
  useEffect(() => {
    track('SESSION_START');
  }, [track]);
  return null;
}
