import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

// jsdom does not implement matchMedia
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

// jsdom exposes `audioTracks` and `videoTracks` as plain lists, but the player listens to them
// like event targets (as browsers that support them do), so tests give it empty ones
class EmptyTrackList extends EventTarget {
  readonly length = 0;
  [Symbol.iterator]() {
    return [][Symbol.iterator]();
  }
}
for (const name of ['audioTracks', 'videoTracks']) {
  Object.defineProperty(HTMLMediaElement.prototype, name, {
    configurable: true,
    get: () => new EmptyTrackList(),
  });
}
