import { deflateSync, inflateSync } from 'zlib';

type PdfText = {
  type: 'text';
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
  color?: string;
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
    this.y -= 15;
    if (this.y < 48) this.addPage();
    this.currentLines.push({
      type: 'text',
      text: text.toUpperCase(),
      x: 42,
      y: this.y,
      size: 15,
      bold: true,
      color: '#1f4f7a',
    });
    this.y -= 12;
    this.addHorizontalRule();
  }

  addSection(text: string) {
    this.y -= 14;
    if (this.y < 48) this.addPage();
    
    // Draw left vertical accent line
    this.addRect(42, this.y - 1, 4, 11, { fill: '#1f4f7a' });

    this.currentLines.push({
      type: 'text',
      text: text.toUpperCase(),
      x: 52,
      y: this.y,
      size: 10,
      bold: true,
      color: '#1f4f7a',
    });
    this.y -= 15;
  }

  addLine(text: string, options: { size?: number; bold?: boolean; gapBefore?: number; gapAfter?: number; x?: number; color?: string } = {}) {
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
      color: options.color,
    });
    this.y -= options.gapAfter ?? 13;
  }

  addHorizontalRule() {
    this.addShapeLine(42, this.y, 553, this.y, '#e2e8f0');
    this.y -= 12;
  }

  addHeaderBlock(empresa: any, cliente: any) {
    const top = this.y;
    
    // Empresa box
    this.addRect(42, top - 70, 245, 70, { stroke: '#e2e8f0', fill: '#f8fafc' });
    this.currentLines.push({ type: 'text', text: 'EMPRESA', x: 50, y: top - 18, size: 7, bold: true, color: '#64748b' });
    this.currentLines.push({ type: 'text', text: String(empresa?.nomeFantasia || empresa?.razaoSocial || '-'), x: 50, y: top - 32, size: 9, bold: true, color: '#0f172a' });
    this.currentLines.push({ type: 'text', text: `CNPJ: ${empresa?.cnpj || '-'}`, x: 50, y: top - 44, size: 8, color: '#475569' });
    this.currentLines.push({ type: 'text', text: `Contato: ${empresa?.telefone || '-'}`, x: 50, y: top - 56, size: 8, color: '#475569' });

    // Cliente box
    this.addRect(307, top - 70, 246, 70, { stroke: '#e2e8f0', fill: '#f8fafc' });
    this.currentLines.push({ type: 'text', text: 'CLIENTE', x: 315, y: top - 18, size: 7, bold: true, color: '#64748b' });
    this.currentLines.push({ type: 'text', text: String(cliente?.nome || '-'), x: 315, y: top - 32, size: 9, bold: true, color: '#0f172a' });
    this.currentLines.push({ type: 'text', text: `CPF/CNPJ: ${cliente?.cpfCnpj || '-'}`, x: 315, y: top - 44, size: 8, color: '#475569' });
    this.currentLines.push({ type: 'text', text: `Contato: ${cliente?.telefone || '-'}`, x: 315, y: top - 56, size: 8, color: '#475569' });

    this.y = top - 82;
  }

  addHighlight(label: string, value: unknown) {
    this.y -= 44;
    if (this.y < 48) this.addPage();

    // Draw card background
    this.addRect(42, this.y, 511, 36, { fill: '#f8fafc' });
    // Draw card border
    this.addRect(42, this.y, 511, 36, { stroke: '#e2e8f0' });
    // Draw left green vertical bar accent
    this.addRect(42, this.y, 4, 36, { fill: '#10b981' });

    this.currentLines.push({
      type: 'text',
      text: label,
      x: 54,
      y: this.y + 14,
      size: 10,
      bold: true,
      color: '#475569',
    });

    this.currentLines.push({
      type: 'text',
      text: String(value ?? '-'),
      x: 430,
      y: this.y + 12,
      size: 14,
      bold: true,
      color: '#10b981',
    });

    this.y -= 10;
  }

  addSignatureBox(label: string, imageBase64?: string) {
    this.y -= 84;
    if (this.y < 48) this.addPage();

    const boxY = this.y;
    this.addRect(42, boxY, 250, 76, { stroke: '#cbd5e1', fill: '#f8fafc' });
    this.currentLines.push({
      type: 'text',
      text: label,
      x: 52,
      y: boxY + 8,
      size: 7,
      bold: true,
      color: '#64748b',
    });

    if (imageBase64) {
      const image = parsePngDataUrl(imageBase64);
      if (image) {
        const imageId = `Im${this.images.length + 1}`;
        this.images.push({ id: imageId, width: image.width, height: image.height, data: image.data });
        this.currentLines.push({
          type: 'image',
          imageId,
          x: 52,
          y: boxY + 22,
          width: 230,
          height: 44,
        });
      } else {
        this.currentLines.push({
          type: 'text',
          text: 'Assinatura gráfica coletada',
          x: 52,
          y: boxY + 36,
          size: 8,
          color: '#475569',
        });
      }
    } else {
      this.addShapeLine(60, boxY + 36, 274, boxY + 36, '#94a3b8');
    }

    this.y -= 10;
  }

  addWrapped(text: string, options: { maxChars?: number; x?: number; size?: number; color?: string } = {}) {
    for (const line of wrapText(text, options.maxChars ?? 92)) {
      this.addLine(line, { x: options.x, size: options.size, color: options.color });
    }
  }

  addKeyValue(label: string, value: unknown) {
    this.y -= 2;
    if (this.y < 48) this.addPage();

    this.currentLines.push({
      type: 'text',
      text: `${label}:`,
      x: 42,
      y: this.y,
      size: 9,
      bold: true,
      color: '#475569',
    });

    this.currentLines.push({
      type: 'text',
      text: String(value ?? '-'),
      x: 160,
      y: this.y,
      size: 9,
      color: '#1e293b',
    });
    this.y -= 13;
  }
  addTable(headers: string[], colWidthsOrRows: number[] | string[][], rows?: string[][]) {
    let colWidths: number[];
    let tableRows: string[][];

    if (Array.isArray(colWidthsOrRows) && typeof colWidthsOrRows[0] === 'number') {
      colWidths = colWidthsOrRows as number[];
      tableRows = rows || [];
    } else {
      tableRows = colWidthsOrRows as string[][];
      const count = headers.length || 1;
      const equalWidth = Math.floor(511 / count);
      colWidths = Array(count).fill(equalWidth);
      colWidths[colWidths.length - 1] += 511 - (equalWidth * count);
    }

    const headerHeight = 20;
    this.y -= headerHeight;
    if (this.y < 48) this.addPage();

    // Draw header rect
    this.addRect(42, this.y, 511, headerHeight, { fill: '#1f4f7a' });

    // Write header labels
    let currentX = 42;
    for (let i = 0; i < headers.length; i++) {
      const headerText = headers[i];
      const width = colWidths[i];

      this.currentLines.push({
        type: 'text',
        text: headerText,
        x: currentX + 6,
        y: this.y + 6,
        size: 9,
        bold: true,
        color: '#ffffff',
      });
      currentX += width;
    }

    this.y -= 4;

    // Draw rows
    let zebra = false;
    for (const row of tableRows) {
      this.y -= 18;
      if (this.y < 48) {
        this.addPage();
        // Redraw headers on new page
        this.y -= headerHeight;
        this.addRect(42, this.y, 511, headerHeight, { fill: '#1f4f7a' });
        let tempX = 42;
        for (let i = 0; i < headers.length; i++) {
          this.currentLines.push({
            type: 'text',
            text: headers[i],
            x: tempX + 6,
            y: this.y + 6,
            size: 9,
            bold: true,
            color: '#ffffff',
          });
          tempX += colWidths[i];
        }
        this.y -= 22;
      }

      if (zebra) {
        this.addRect(42, this.y - 2, 511, 18, { fill: '#f8fafc' });
      }
      zebra = !zebra;

      this.addShapeLine(42, this.y - 2, 553, this.y - 2, '#e2e8f0');

      let rowX = 42;
      for (let i = 0; i < row.length; i++) {
        const cellText = row[i];
        const width = colWidths[i];

        this.currentLines.push({
          type: 'text',
          text: cellText.length > 38 && i === 0 ? cellText.slice(0, 36) + '...' : cellText,
          x: rowX + 6,
          y: this.y + 3,
          size: 8,
          color: '#334155',
        });
        rowX += width;
      }
    }
    this.y -= 8;
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
       const colorOperator = element.color ? `${rgb(element.color)} rg ` : '0.12 0.16 0.22 rg ';
       return [`q ${colorOperator}BT ${font} ${element.size ?? 9} Tf 1 0 0 1 ${element.x} ${element.y} Tm (${escapePdfText(element.text)}) Tj ET Q`];
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
