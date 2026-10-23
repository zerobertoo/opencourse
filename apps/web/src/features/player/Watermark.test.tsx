import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Watermark } from './Watermark';
import { nextWatermarkSlot, WATERMARK_HIDDEN_MS, WATERMARK_VISIBLE_MS } from './watermarkSlots';

describe('Watermark', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the text, hides after a few seconds and returns in another place', () => {
    vi.useFakeTimers();
    render(<Watermark text="Ana · ana@example.com" />);
    const mark = () => screen.getByTestId('video-watermark');
    expect(mark()).toHaveTextContent('Ana · ana@example.com');
    expect(mark()).toHaveAttribute('data-visible', 'true');
    const firstPlace = mark().getAttribute('style');

    act(() => {
      vi.advanceTimersByTime(WATERMARK_VISIBLE_MS);
    });
    expect(mark()).toHaveAttribute('data-visible', 'false');
    // it does not move while it is still on screen, only once hidden
    expect(mark().getAttribute('style')).toBe(firstPlace);

    act(() => {
      vi.advanceTimersByTime(WATERMARK_HIDDEN_MS);
    });
    expect(mark()).toHaveAttribute('data-visible', 'true');
    expect(mark().getAttribute('style')).not.toBe(firstPlace);
  });

  it('never picks the slot it is already in', () => {
    for (let current = 0; current < 5; current += 1) {
      for (const random of [0, 0.3, 0.99]) {
        expect(nextWatermarkSlot(current, () => random)).not.toBe(current);
      }
    }
  });
});
