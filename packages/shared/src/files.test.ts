import { describe, expect, it } from 'vitest';
import { decodeSubtitleBytes, toWebVtt } from './files';

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

  it('keeps the text of a cue that has a blank line in the middle', () => {
    const srt =
      '1\n00:00:01,000 --> 00:00:03,000\nFirst part\n\nSecond part\n\n2\n00:00:04,000 --> 00:00:05,000\nNext\n';
    expect(toWebVtt(srt)).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nFirst part\nSecond part\n\n00:00:04.000 --> 00:00:05.000\nNext\n',
    );
  });
});

describe('decodeSubtitleBytes', () => {
  const text = 'Ação e emoção';

  it('reads UTF-8, with or without a byte order mark', () => {
    expect(decodeSubtitleBytes(new TextEncoder().encode(text))).toBe(text);
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    expect(decodeSubtitleBytes(withBom)).toBe(text);
  });

  it('reads UTF-16 in both byte orders', () => {
    const units = [...text].map((char) => char.charCodeAt(0));
    const little = new Uint8Array([
      0xff,
      0xfe,
      ...units.flatMap((unit) => [unit & 0xff, unit >> 8]),
    ]);
    expect(decodeSubtitleBytes(little)).toBe(text);
    const big = new Uint8Array([0xfe, 0xff, ...units.flatMap((unit) => [unit >> 8, unit & 0xff])]);
    expect(decodeSubtitleBytes(big)).toBe(text);
  });

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    // every character of the sample is below U+0100, so its code point is its Latin-1 byte
    const latin1 = new Uint8Array([...text].map((char) => char.charCodeAt(0)));
    expect(decodeSubtitleBytes(latin1)).toBe(text);
  });
});
