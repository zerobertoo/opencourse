import type { BrandLayout } from '@opencourse/shared';
import { useSyncExternalStore } from 'react';

/** Read by the inline script in index.html, so the first paint already uses the last known look. */
const STORAGE_KEY = 'opencourse.layout';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function readLayout(): BrandLayout {
  return document.documentElement.dataset.layout === 'cinema' ? 'cinema' : 'classic';
}

/** Sets the look from the platform settings and remembers it for the next first paint. */
export function applyBrandLayout(layout: BrandLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // storage unavailable: the next load starts from the default look
  }
  if (readLayout() === layout) return;
  document.documentElement.dataset.layout = layout;
  listeners.forEach((listener) => listener());
}

/** The platform look; one shared source, so a card does not need its own settings query. */
export function useBrandLayout(): BrandLayout {
  return useSyncExternalStore(subscribe, readLayout, () => 'classic');
}
