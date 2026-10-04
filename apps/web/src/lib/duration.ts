/** Media clock: `5:12` or `1:05:09`. Invalid values become `0:00`. */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}

/** Splits a duration into hours and minutes (rounded, at least 1 minute when > 0). */
export function splitHoursMinutes(totalSeconds: number): { hours: number; minutes: number } {
  const totalMinutes = totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : 0;
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
