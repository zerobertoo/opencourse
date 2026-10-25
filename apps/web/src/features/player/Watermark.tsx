import { useEffect, useState } from 'react';
import {
  nextWatermarkSlot,
  WATERMARK_HIDDEN_MS,
  WATERMARK_SLOTS,
  WATERMARK_VISIBLE_MS,
} from './watermarkSlots';

/**
 * The viewer's identity over the video: it fades in for a few seconds, fades out, and returns
 * somewhere else, so it identifies a recording without sitting in front of the lesson all the
 * time. It lives inside the player so it stays in fullscreen, and never takes pointer events.
 * It is DOM, so it deters casual sharing and identifies a leak; it is not tamper-proof.
 */
export function Watermark({ text }: { text: string }) {
  const [slot, setSlot] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        // move while it is hidden, so it never visibly jumps
        if (visible) setVisible(false);
        else {
          setSlot(nextWatermarkSlot);
          setVisible(true);
        }
      },
      visible ? WATERMARK_VISIBLE_MS : WATERMARK_HIDDEN_MS,
    );
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        data-testid="video-watermark"
        data-visible={visible}
        className="absolute select-none rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-medium text-white/45 transition-opacity duration-700 motion-reduce:transition-none data-[visible=false]:opacity-0"
        style={WATERMARK_SLOTS[slot]}
      >
        {text}
      </span>
    </div>
  );
}
