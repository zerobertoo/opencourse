import { useEffect, useState } from 'react';
import { nextWatermarkSlot, WATERMARK_MOVE_INTERVAL_MS, WATERMARK_SLOTS } from './watermarkSlots';

/**
 * The viewer's identity floating over the video. It lives inside the player so it stays in
 * fullscreen, and never takes pointer events. It is DOM, so it deters casual sharing and
 * identifies a leak; it is not tamper-proof.
 */
export function Watermark({ text }: { text: string }) {
  const [slot, setSlot] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSlot(nextWatermarkSlot), WATERMARK_MOVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        data-testid="video-watermark"
        className="absolute select-none rounded bg-black/20 px-2 py-1 text-xs font-medium text-white/50"
        style={WATERMARK_SLOTS[slot]}
      >
        {text}
      </span>
    </div>
  );
}
