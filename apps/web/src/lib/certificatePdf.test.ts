import { describe, expect, it } from 'vitest';
import { buildCertificatePdf } from './certificatePdf';

const content = {
  heading: 'Certificado',
  intro: 'Certificamos que',
  holderName: 'Hipátia (Sales) \\ Ltda',
  completion: 'concluiu o curso',
  courseTitle: 'Título 日本',
  issuedLine: 'Emitido em 1 de junho',
  codeLine: 'OC-7K2M-9QXA',
};

async function readBytes(blob: Blob): Promise<string> {
  // jsdom's Blob has no arrayBuffer()/stream(), so read it with FileReader
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return Array.from(new Uint8Array(buffer), (byte) => String.fromCharCode(byte)).join('');
}

describe('buildCertificatePdf', () => {
  it('produces a PDF with a valid header, trailer and xref table', async () => {
    const blob = buildCertificatePdf(content);
    const text = await readBytes(blob);

    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    const xrefOffset = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
  });

  it('escapes PDF delimiters and replaces characters outside Latin-1', async () => {
    const text = await readBytes(buildCertificatePdf(content));

    expect(text).toContain('Hipátia \\(Sales\\) \\\\ Ltda');
    expect(text).toContain('Título ??');
  });

  it('keeps typographic characters that WinAnsi has, and flattens control characters', async () => {
    const text = await readBytes(
      buildCertificatePdf({
        ...content,
        holderName: 'Ana “Lu” – 5€\nSilva\u0085',
      }),
    );

    // WinAnsi: “ 0x93, ” 0x94, – 0x96, € 0x80
    expect(text).toContain(`Ana ${'\x93'}Lu${'\x94'} ${'\x96'} 5${'\x80'} Silva?`);
  });
});
