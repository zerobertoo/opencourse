/** Largest file the mock accepts: uploads are kept in the browser session, not on a server. */
export const MOCK_UPLOAD_LIMIT_BYTES = 500_000;

export class FileTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`File exceeds ${limitBytes} bytes`);
    this.name = 'FileTooLargeError';
  }
}

/**
 * Reads a file as a `data:` URL so the mock can store it in the session.
 * @throws FileTooLargeError when the file is over the limit
 */
export function readFileAsDataUrl(
  file: File,
  limitBytes = MOCK_UPLOAD_LIMIT_BYTES,
): Promise<string> {
  if (file.size > limitBytes) return Promise.reject(new FileTooLargeError(limitBytes));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}
