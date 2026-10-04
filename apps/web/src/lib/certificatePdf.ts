/** Text already translated for the active language; the PDF builder never owns UI strings. */
export interface CertificatePdfContent {
  heading: string;
  intro: string;
  holderName: string;
  completion: string;
  courseTitle: string;
  issuedLine: string;
  codeLine: string;
}

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;

/** Escapes a string for a PDF literal; characters outside Latin-1 become "?". */
function toPdfText(value: string): string {
  return [...value]
    .map((char) => (char.charCodeAt(0) > 255 ? '?' : char))
    .join('')
    .replace(/[\\()]/g, (match) => `\\${match}`);
}

/** Centered text line. Width is estimated from the font size, good enough for base-14 fonts. */
function centeredLine(font: string, size: number, y: number, text: string): string {
  const estimatedWidth = text.length * size * 0.5;
  const x = Math.max(40, (PAGE_WIDTH - estimatedWidth) / 2);
  return `BT /${font} ${size} Tf ${x.toFixed(1)} ${y} Td (${toPdfText(text)}) Tj ET`;
}

/**
 * Builds a one-page landscape PDF for a certificate, with no external dependency.
 * This is the mocked "download": a real backend would render the stored template instead.
 */
export function buildCertificatePdf(content: CertificatePdfContent): Blob {
  const stream = [
    '1.5 w 0.18 0.44 0.37 RG 30 30 782 535 re S',
    '0.5 w 40 40 762 515 re S',
    centeredLine('F1', 34, 440, content.heading),
    centeredLine('F2', 14, 380, content.intro),
    centeredLine('F1', 28, 335, content.holderName),
    centeredLine('F2', 14, 290, content.completion),
    centeredLine('F1', 24, 250, content.courseTitle),
    centeredLine('F2', 12, 150, content.issuedLine),
    centeredLine('F3', 12, 125, content.codeLine),
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // every character is Latin-1, so one char is one byte
  const bytes = Uint8Array.from(body, (char) => char.charCodeAt(0) & 0xff);
  return new Blob([bytes], { type: 'application/pdf' });
}
