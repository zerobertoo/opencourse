import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Watermark } from './Watermark';
import { nextWatermarkSlot, WATERMARK_MOVE_INTERVAL_MS } from './watermarkSlots';

describe('Watermark', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the text and jumps to another place on a timer', () => {
    vi.useFakeTimers();
    render(<Watermark text="Ana · ana@example.com" />);
    const mark = screen.getByTestId('video-watermark');
    expect(mark).toHaveTextContent('Ana · ana@example.com');

    const before = mark.getAttribute('style');
    act(() => {
      vi.advanceTimersByTime(WATERMARK_MOVE_INTERVAL_MS);
    });
    expect(screen.getByTestId('video-watermark').getAttribute('style')).not.toBe(before);
  });

  it('never picks the slot it is already in', () => {
    for (let current = 0; current < 5; current += 1) {
      for (const random of [0, 0.3, 0.99]) {
        expect(nextWatermarkSlot(current, () => random)).not.toBe(current);
      }
    }
  });
});
