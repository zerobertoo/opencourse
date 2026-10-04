import { describe, expect, it } from 'vitest';
import { formatClock, parseClock } from './duration';

describe('parseClock', () => {
  it('reads m:ss, h:mm:ss and plain minutes', () => {
    expect(parseClock('5:12')).toBe(312);
    expect(parseClock('0:30')).toBe(30);
    expect(parseClock('1:05:09')).toBe(3909);
    expect(parseClock('12')).toBe(720);
    expect(parseClock('  9:00 ')).toBe(540);
  });

  it('rejects malformed values', () => {
    for (const value of ['', 'abc', '5:7', '5:60', '1:2:3', '-3', '1.5', '5:']) {
      expect(parseClock(value), value).toBeNull();
    }
  });

  it('round-trips with formatClock', () => {
    for (const seconds of [0, 59, 312, 3600, 3909]) {
      expect(parseClock(formatClock(seconds))).toBe(seconds);
    }
  });
});
