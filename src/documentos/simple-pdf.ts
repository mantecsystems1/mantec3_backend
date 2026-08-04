type PdfLine = {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
};

const escapePdfText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');

export function wrapText(text: string, maxChars = 92) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

export class SimplePdfBuilder {
  private pages: PdfLine[][] = [[]];
  private y = 790;

  private get currentLines() {
    return this.pages[this.pages.length - 1];
  }

  addTitle(text: string) {
    this.addLine(text, { size: 18, bold: true, gapAfter: 18 });
  }

  addSection(text: string) {
    this.addLine(text, { size: 12, bold: true, gapBefore: 10, gapAfter: 8 });
  }

  addLine(text: string, options: { size?: number; bold?: boolean; gapBefore?: number; gapAfter?: number; x?: number } = {}) {
    this.y -= options.gapBefore ?? 0;
    if (this.y < 48) {
      this.addPage();
    }

    this.currentLines.push({
      text,
      x: options.x ?? 42,
      y: this.y,
      size: options.size ?? 9,
      bold: options.bold,
    });
    this.y -= options.gapAfter ?? 13;
  }

  addWrapped(text: string, options: { maxChars?: number; x?: number; size?: number } = {}) {
    for (const line of wrapText(text, options.maxChars ?? 92)) {
      this.addLine(line, { x: options.x, size: options.size });
    }
  }

  addKeyValue(label: string, value: unknown) {
    this.addLine(`${label}: ${value ?? '-'}`);
  }

  addTable(headers: string[], rows: string[][]) {
    this.addLine(headers.join(' | '), { bold: true });
    this.addLine('-'.repeat(112));
    for (const row of rows) {
      this.addWrapped(row.join(' | '), { maxChars: 110 });
    }
  }

  build() {
    const pageCount = this.pages.length;
    const pageObjectStart = 5;
    const pageObjectIds = this.pages.map((_, index) => pageObjectStart + index * 2);
    const contentObjectIds = this.pages.map((_, index) => pageObjectStart + index * 2 + 1);

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];

    for (let index = 0; index < this.pages.length; index += 1) {
      const content = [
        'BT',
        ...this.pages[index].map((line) => {
          const font = line.bold ? '/F2' : '/F1';
          return `${font} ${line.size ?? 9} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escapePdfText(line.text)}) Tj`;
        }),
        'ET',
      ].join('\n');

      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
        `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
      );
    }

    const chunks = ['%PDF-1.4\n'];
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(Buffer.byteLength(chunks.join(''), 'utf8'));
      chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
    }

    const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8');
    chunks.push(`xref\n0 ${objects.length + 1}\n`);
    chunks.push('0000000000 65535 f \n');
    for (let index = 1; index < offsets.length; index += 1) {
      chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
    }
    chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return Buffer.from(chunks.join(''), 'utf8');
  }

  private addPage() {
    this.pages.push([]);
    this.y = 790;
  }
}
