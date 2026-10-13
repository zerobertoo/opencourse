import { describe, expect, it } from 'vitest';
import { toWebVtt } from './files';

describe('toWebVtt', () => {
  it('keeps WebVTT as it is, ending with a newline', () => {
    expect(toWebVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n',
    );
  });

  it('accepts a WebVTT header with a title and a byte order mark', () => {
    expect(toWebVtt('﻿WEBVTT - Lesson\r\n\r\n00:01.000 --> 00:02.000\r\nHi\r\n')).toContain(
      '00:01.000 --> 00:02.000\nHi',
    );
  });

  it('converts SRT: header, dotted timestamps, no cue numbers, CRLF tolerated', () => {
    const srt =
      '1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nthere\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nBye\r\n';
    expect(toWebVtt(srt)).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nthere\n\n00:00:03.000 --> 00:00:04.000\nBye\n',
    );
  });

  it('converts SRT without cue numbers', () => {
    expect(toWebVtt('00:00:01,000 --> 00:00:02,000\nHi')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n',
    );
  });

  it('rejects text that is not subtitles', () => {
    expect(toWebVtt('just some text')).toBeNull();
    expect(toWebVtt('')).toBeNull();
    expect(toWebVtt('<html></html>')).toBeNull();
  });

  it('rejects a cue with a broken timing line', () => {
    expect(toWebVtt('1\n00:00:01 --> soon\nHi')).toBeNull();
  });

  it('does not take a header that only starts with the letters WEBVTT', () => {
    expect(toWebVtt('WEBVTTX\n\n00:00:01.000 --> 00:00:02.000\nHi')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n',
    );
  });
});
