import { describe, expect, it } from 'vitest';
import { FileTooLargeError, readFileAsDataUrl } from './files';

describe('readFileAsDataUrl', () => {
  it('reads a small file as a data URL', async () => {
    const file = new File(['WEBVTT'], 'captions.vtt', { type: 'text/vtt' });
    const url = await readFileAsDataUrl(file);
    expect(url.startsWith('data:text/vtt;base64,')).toBe(true);
    expect(atob(url.split(',')[1]!)).toBe('WEBVTT');
  });

  it('refuses files over the limit', async () => {
    const file = new File([new Uint8Array(20)], 'big.bin');
    await expect(readFileAsDataUrl(file, 10)).rejects.toBeInstanceOf(FileTooLargeError);
  });
});
