import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './userAgent';

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
      'Edge',
      'Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Chrome',
      'Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari',
      'iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      'Chrome',
      'Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox', 'Linux'],
  ])('reads %#', (agent, browser, system) => {
    expect(describeUserAgent(agent)).toEqual({ browser, system });
  });

  it('returns nulls for an unknown or missing agent', () => {
    expect(describeUserAgent('curl/8.0')).toEqual({ browser: null, system: null });
    expect(describeUserAgent(null)).toEqual({ browser: null, system: null });
  });
});
