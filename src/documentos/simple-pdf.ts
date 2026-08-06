import { deflateSync, inflateSync } from 'zlib';

type PdfText = {
  type: 'text';
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
};

type PdfRect = {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: string;
  fill?: string;
};

type PdfLineShape = {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
};

type PdfImage = {
  type: 'image';
  imageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfElement = PdfText | PdfRect | PdfLineShape | PdfImage;

type PdfImageResource = {
  id: string;
  width: number;
  height: number;
  data: Buffer;
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
  private pages: PdfElement[][] = [[]];
  private images: PdfImageResource[] = [];
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
      type: 'text',
      text,
      x: options.x ?? 42,
      y: this.y,
      size: options.size ?? 9,
      bold: options.bold,
    });
    this.y -= options.gapAfter ?? 13;
  }

  addHorizontalRule() {
    this.addShapeLine(42, this.y, 553, this.y, '#d1d5db');
    this.y -= 12;
  }

  addHighlight(label: string, value: unknown) {
    const top = this.y;
    this.addRect(42, top - 42, 511, 42, { stroke: '#bbf7d0', fill: '#ecfdf5' });
    this.currentLines.push({ type: 'text', text: label, x: 58, y: top - 16, size: 9, bold: true });
    this.currentLines.push({ type: 'text', text: String(value ?? '-'), x: 420, y: top - 25, size: 14, bold: true });
    this.y -= 56;
  }

  addSignatureBox(label: string, imageBase64?: string) {
    const top = this.y;
    this.addRect(42, top - 82, 236, 82, { stroke: '#cbd5e1', fill: '#f8fafc' });
    this.currentLines.push({ type: 'text', text: label, x: 58, y: top - 70, size: 8, bold: true });

    if (imageBase64) {
      const image = parsePngDataUrl(imageBase64);
      if (image) {
        const imageId = `Im${this.images.length + 1}`;
        this.images.push({ id: imageId, width: image.width, height: image.height, data: image.data });
        this.currentLines.push({
          type: 'image',
          imageId,
          x: 62,
          y: top - 58,
          width: 190,
          height: 42,
        });
      } else {
        this.currentLines.push({ type: 'text', text: 'Assinatura grafica armazenada no sistema.', x: 58, y: top - 36, size: 8 });
      }
    } else {
      this.addShapeLine(62, top - 42, 252, top - 42, '#94a3b8');
    }

    this.y -= 94;
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
    const imageObjectStart = pageObjectStart + this.pages.length * 2;

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];

    for (let index = 0; index < this.pages.length; index += 1) {
      const pageImages = this.getPageImages(this.pages[index]);
      const imageResources = pageImages
        .map((image) => `/${image.id} ${imageObjectStart + this.images.findIndex((candidate) => candidate.id === image.id)} 0 R`)
        .join(' ');
      const content = [
        ...this.pages[index].flatMap((element) => this.renderElement(element)),
      ].join('\n');

      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${imageResources} >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
        `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
      );
    }

    for (const image of this.images) {
      const hexData = `${image.data.toString('hex')}>`;
      objects.push(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode] /Length ${hexData.length} >>\nstream\n${hexData}\nendstream`,
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

  private addRect(x: number, y: number, width: number, height: number, options: { stroke?: string; fill?: string } = {}) {
    this.currentLines.push({ type: 'rect', x, y, width, height, stroke: options.stroke, fill: options.fill });
  }

  private addShapeLine(x1: number, y1: number, x2: number, y2: number, stroke?: string) {
    this.currentLines.push({ type: 'line', x1, y1, x2, y2, stroke });
  }

  private getPageImages(elements: PdfElement[]) {
    const ids = new Set(elements.filter((element): element is PdfImage => element.type === 'image').map((element) => element.imageId));
    return this.images.filter((image) => ids.has(image.id));
  }

  private renderElement(element: PdfElement) {
    if (element.type === 'text') {
      const font = element.bold ? '/F2' : '/F1';
      return [`BT ${font} ${element.size ?? 9} Tf 1 0 0 1 ${element.x} ${element.y} Tm (${escapePdfText(element.text)}) Tj ET`];
    }

    if (element.type === 'rect') {
      return [
        'q',
        element.fill ? `${rgb(element.fill)} rg` : '',
        element.stroke ? `${rgb(element.stroke)} RG` : '0.8 0.84 0.9 RG',
        `${element.x} ${element.y} ${element.width} ${element.height} re`,
        element.fill ? 'B' : 'S',
        'Q',
      ].filter(Boolean);
    }

    if (element.type === 'line') {
      return [
        'q',
        element.stroke ? `${rgb(element.stroke)} RG` : '0.8 0.84 0.9 RG',
        `${element.x1} ${element.y1} m ${element.x2} ${element.y2} l S`,
        'Q',
      ];
    }

    return [
      'q',
      `${element.width} 0 0 ${element.height} ${element.x} ${element.y} cm`,
      `/${element.imageId} Do`,
      'Q',
    ];
  }
}

function rgb(hex: string) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function parsePngDataUrl(dataUrl: string) {
  try {
    const rawBase64 = dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl;
    if (!rawBase64) return null;

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height || ![2, 6].includes(colorType)) return null;

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(height * stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const scanline = inflated.subarray(inputOffset, inputOffset + stride);
    inputOffset += stride;
    const previous = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const output = raw.subarray(y * stride, (y + 1) * stride);
    unfilterScanline(filter, scanline, previous, output, bytesPerPixel);
  }

  const rgbData = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < raw.length; i += bytesPerPixel, j += 3) {
    rgbData[j] = raw[i];
    rgbData[j + 1] = raw[i + 1];
    rgbData[j + 2] = raw[i + 2];
  }

    return { width, height, data: deflateSync(rgbData) };
  } catch {
    return null;
  }
}

function unfilterScanline(filter: number, scanline: Buffer, previous: Buffer, output: Buffer, bpp: number) {
  for (let i = 0; i < scanline.length; i += 1) {
    const left = i >= bpp ? output[i - bpp] : 0;
    const up = previous[i] || 0;
    const upLeft = i >= bpp ? previous[i - bpp] || 0 : 0;

    if (filter === 0) output[i] = scanline[i];
    else if (filter === 1) output[i] = (scanline[i] + left) & 0xff;
    else if (filter === 2) output[i] = (scanline[i] + up) & 0xff;
    else if (filter === 3) output[i] = (scanline[i] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) output[i] = (scanline[i] + paeth(left, up, upLeft)) & 0xff;
    else output[i] = scanline[i];
  }
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
