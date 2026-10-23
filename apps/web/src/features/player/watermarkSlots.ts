import type { CSSProperties } from 'react';

/** How long the watermark stays on screen each time it appears. */
export const WATERMARK_VISIBLE_MS = 8_000;

/** How long it stays hidden between appearances, so it does not weigh on the lesson. */
export const WATERMARK_HIDDEN_MS = 22_000;

/** Places the watermark can take; a fixed crop never removes it from all of them. */
export const WATERMARK_SLOTS: CSSProperties[] = [
  { top: '6%', insetInlineStart: '4%' },
  { top: '6%', insetInlineEnd: '4%' },
  { top: '42%', insetInlineStart: '30%' },
  { bottom: '16%', insetInlineStart: '4%' },
  { bottom: '16%', insetInlineEnd: '4%' },
];

/** Index of a slot other than `current`. */
export function nextWatermarkSlot(current: number, random = Math.random): number {
  return (current + 1 + Math.floor(random() * (WATERMARK_SLOTS.length - 1))) % WATERMARK_SLOTS.length;
}
