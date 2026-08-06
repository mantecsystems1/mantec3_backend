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

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 42;
const CONTENT_WIDTH = 511;
const TOP_Y = 790;
const BOTTOM_Y = 54;

function toWinAnsi(str: string): string {
  const map: Record<string, string> = {
    '\u00e1': '\\341',
    '\u00e0': '\\340',
    '\u00e2': '\\342',
    '\u00e3': '\\343',
    '\u00e9': '\\351',
    '\u00ea': '\\352',
    '\u00ed': '\\355',
    '\u00f3': '\\363',
    '\u00f4': '\\364',
    '\u00f5': '\\365',
    '\u00fa': '\\372',
    '\u00e7': '\\347',
    '\u00c1': '\\301',
    '\u00c0': '\\300',
    '\u00c2': '\\302',
    '\u00c3': '\\303',
    '\u00c9': '\\311',
    '\u00ca': '\\312',
    '\u00cd': '\\315',
    '\u00d3': '\\323',
    '\u00d4': '\\324',
    '\u00d5': '\\325',
    '\u00da': '\\332',
    '\u00c7': '\\307',
    '\u00ba': '\\272',
    '\u00aa': '\\252',
    '\u00a0': ' ',
  };
  return str.replace(/[^\x00-\x7f]/g, (char) => map[char] || '');
}

const escapePdfText = (value: string) => {
  const escaped = String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
  return toWinAnsi(escaped);
};

export function wrapText(text: string, maxChars = 92) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
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
  private y = TOP_Y;
  private title = 'Documento';

  private get currentLines() {
    return this.pages[this.pages.length - 1];
  }

  addTitle(text: string) {
    this.title = text;
    this.ensureSpace(72);
    this.addRect(MARGIN_X, this.y - 58, CONTENT_WIDTH, 58, { fill: '#0f3d5e' });
    this.addRect(MARGIN_X, this.y - 58, 6, 58, { fill: '#18a999' });
    this.currentLines.push({
      type: 'text',
      text: text.toUpperCase(),
      x: MARGIN_X + 18,
      y: this.y - 25,
      size: 18,
      bold: true,
      color: '#ffffff',
    });
    this.currentLines.push({
      type: 'text',
      text: `Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
      x: MARGIN_X + 18,
      y: this.y - 43,
      size: 8,
      color: '#dbeafe',
    });
    this.y -= 76;
  }

  addSection(text: string) {
    this.ensureSpace(34);
    this.y -= 10;
    this.addRect(MARGIN_X, this.y - 4, 4, 18, { fill: '#18a999' });
    this.currentLines.push({
      type: 'text',
      text: text.toUpperCase(),
      x: MARGIN_X + 12,
      y: this.y,
      size: 10,
      bold: true,
      color: '#0f3d5e',
    });
    this.addShapeLine(MARGIN_X, this.y - 9, MARGIN_X + CONTENT_WIDTH, this.y - 9, '#d9e2ec');
    this.y -= 22;
  }

  addLine(text: string, options: { size?: number; bold?: boolean; gapBefore?: number; gapAfter?: number; x?: number; color?: string } = {}) {
    this.y -= options.gapBefore ?? 0;
    this.ensureSpace((options.gapAfter ?? 13) + 4);

    this.currentLines.push({
      type: 'text',
      text,
      x: options.x ?? MARGIN_X,
      y: this.y,
      size: options.size ?? 9,
      bold: options.bold,
      color: options.color ?? '#334155',
    });
    this.y -= options.gapAfter ?? 13;
  }

  addHorizontalRule() {
    this.ensureSpace(18);
    this.addShapeLine(MARGIN_X, this.y, MARGIN_X + CONTENT_WIDTH, this.y, '#d9e2ec');
    this.y -= 16;
  }

  addHeaderBlock(empresa: any, cliente: any) {
    const top = this.y;
    const cardWidth = 247;
    const cardHeight = 78;
    this.ensureSpace(cardHeight + 18);

    this.addInfoCard(MARGIN_X, top - cardHeight, cardWidth, cardHeight, 'Empresa', [
      String(empresa?.nomeFantasia || empresa?.razaoSocial || '-'),
      `CNPJ: ${empresa?.cnpj || '-'}`,
      `Contato: ${empresa?.telefone || empresa?.email || '-'}`,
    ]);
    this.addInfoCard(MARGIN_X + cardWidth + 17, top - cardHeight, cardWidth, cardHeight, 'Cliente', [
      String(cliente?.nome || '-'),
      `CPF/CNPJ: ${cliente?.cpfCnpj || '-'}`,
      `Contato: ${cliente?.telefone || cliente?.email || '-'}`,
    ]);

    this.y = top - cardHeight - 18;
  }

  addHighlight(label: string, value: unknown) {
    this.ensureSpace(52);
    this.y -= 6;
    this.addRect(MARGIN_X, this.y - 36, CONTENT_WIDTH, 42, { stroke: '#b7d8d3', fill: '#eefaf8' });
    this.addRect(MARGIN_X, this.y - 36, 6, 42, { fill: '#18a999' });
    this.currentLines.push({
      type: 'text',
      text: label,
      x: MARGIN_X + 16,
      y: this.y - 10,
      size: 10,
      bold: true,
      color: '#31515d',
    });
    this.currentLines.push({
      type: 'text',
      text: String(value ?? '-'),
      x: MARGIN_X + 362,
      y: this.y - 12,
      size: 15,
      bold: true,
      color: '#0f766e',
    });
    this.y -= 52;
  }

  addSignatureBox(label: string, imageBase64?: string) {
    this.ensureSpace(118);
    this.y -= 8;

    const boxY = this.y - 96;
    this.addRect(MARGIN_X, boxY, CONTENT_WIDTH, 100, { stroke: '#cbd5e1', fill: '#ffffff' });
    this.addRect(MARGIN_X, boxY + 78, CONTENT_WIDTH, 22, { fill: '#f1f5f9' });
    this.currentLines.push({
      type: 'text',
      text: label.toUpperCase(),
      x: MARGIN_X + 12,
      y: boxY + 86,
      size: 8,
      bold: true,
      color: '#334155',
    });

    if (imageBase64) {
      const image = parsePngDataUrl(imageBase64);
      if (image) {
        const imageId = `Im${this.images.length + 1}`;
        const fit = fitInside(image.width, image.height, CONTENT_WIDTH - 48, 58);
        this.images.push({ id: imageId, width: image.width, height: image.height, data: image.data });
        this.currentLines.push({
          type: 'image',
          imageId,
          x: MARGIN_X + 24 + ((CONTENT_WIDTH - 48) - fit.width) / 2,
          y: boxY + 16,
          width: fit.width,
          height: fit.height,
        });
      } else {
        this.currentLines.push({
          type: 'text',
          text: 'Assinatura grafica coletada e registrada no sistema.',
          x: MARGIN_X + 24,
          y: boxY + 42,
          size: 9,
          color: '#475569',
        });
      }
    } else {
      this.addShapeLine(MARGIN_X + 56, boxY + 38, MARGIN_X + CONTENT_WIDTH - 56, boxY + 38, '#94a3b8');
      this.currentLines.push({
        type: 'text',
        text: 'Assinatura nao informada',
        x: MARGIN_X + 190,
        y: boxY + 22,
        size: 8,
        color: '#64748b',
      });
    }

    this.y = boxY - 16;
  }

  addWrapped(text: string, options: { maxChars?: number; x?: number; size?: number; color?: string } = {}) {
    for (const line of wrapText(text, options.maxChars ?? 96)) {
      this.addLine(line, { x: options.x, size: options.size, color: options.color, gapAfter: 12 });
    }
  }

  addKeyValue(label: string, value: unknown) {
    const valueLines = wrapText(String(value ?? '-'), 76);
    const rowHeight = Math.max(18, valueLines.length * 11 + 7);
    this.ensureSpace(rowHeight + 2);

    this.addRect(MARGIN_X, this.y - rowHeight + 5, CONTENT_WIDTH, rowHeight, { fill: '#fbfdff' });
    this.addShapeLine(MARGIN_X, this.y - rowHeight + 5, MARGIN_X + CONTENT_WIDTH, this.y - rowHeight + 5, '#e2e8f0');
    this.currentLines.push({
      type: 'text',
      text: `${label}:`,
      x: MARGIN_X + 10,
      y: this.y - 7,
      size: 8,
      bold: true,
      color: '#64748b',
    });

    valueLines.forEach((line, index) => {
      this.currentLines.push({
        type: 'text',
        text: line,
        x: MARGIN_X + 142,
        y: this.y - 7 - index * 11,
        size: 9,
        color: '#1e293b',
      });
    });
    this.y -= rowHeight;
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
      const equalWidth = Math.floor(CONTENT_WIDTH / count);
      colWidths = Array(count).fill(equalWidth);
      colWidths[colWidths.length - 1] += CONTENT_WIDTH - equalWidth * count;
    }

    this.drawTableHeader(headers, colWidths);

    tableRows.forEach((row, rowIndex) => {
      const wrappedCells = row.map((cell, index) => wrapText(String(cell ?? '-'), this.getColumnChars(colWidths[index])));
      const maxLines = Math.max(...wrappedCells.map((cell) => cell.length), 1);
      const rowHeight = Math.max(22, maxLines * 10 + 12);
      if (this.y - rowHeight < BOTTOM_Y) {
        this.addPage();
        this.drawTableHeader(headers, colWidths);
      }

      this.addRect(MARGIN_X, this.y - rowHeight, CONTENT_WIDTH, rowHeight, {
        fill: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
      });
      this.addShapeLine(MARGIN_X, this.y - rowHeight, MARGIN_X + CONTENT_WIDTH, this.y - rowHeight, '#e2e8f0');

      let rowX = MARGIN_X;
      wrappedCells.forEach((cellLines, index) => {
        cellLines.slice(0, 4).forEach((line, lineIndex) => {
          this.currentLines.push({
            type: 'text',
            text: line,
            x: rowX + 6,
            y: this.y - 14 - lineIndex * 10,
            size: 8,
            color: '#334155',
          });
        });
        rowX += colWidths[index];
      });

      this.y -= rowHeight;
    });

    this.y -= 12;
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
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ];

    for (let index = 0; index < this.pages.length; index += 1) {
      const pageElements = [...this.pages[index], ...this.getFooterElements(index + 1, pageCount)];
      const pageImages = this.getPageImages(pageElements);
      const imageResources = pageImages
        .map((image) => `/${image.id} ${imageObjectStart + this.images.findIndex((candidate) => candidate.id === image.id)} 0 R`)
        .join(' ');
      const content = pageElements.flatMap((element) => this.renderElement(element)).join('\n');

      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${imageResources} >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
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
    this.y = TOP_Y;
  }

  private ensureSpace(height: number) {
    if (this.y - height < BOTTOM_Y) {
      this.addPage();
    }
  }

  private addInfoCard(x: number, y: number, width: number, height: number, label: string, lines: string[]) {
    this.addRect(x, y, width, height, { stroke: '#d9e2ec', fill: '#f8fafc' });
    this.currentLines.push({ type: 'text', text: label.toUpperCase(), x: x + 10, y: y + height - 16, size: 7, bold: true, color: '#64748b' });
    this.currentLines.push({ type: 'text', text: lines[0] || '-', x: x + 10, y: y + height - 32, size: 9, bold: true, color: '#0f172a' });
    lines.slice(1, 3).forEach((line, index) => {
      this.currentLines.push({ type: 'text', text: line, x: x + 10, y: y + height - 46 - index * 12, size: 8, color: '#475569' });
    });
  }

  private drawTableHeader(headers: string[], colWidths: number[]) {
    const headerHeight = 23;
    this.ensureSpace(headerHeight + 24);
    this.addRect(MARGIN_X, this.y - headerHeight, CONTENT_WIDTH, headerHeight, { fill: '#0f3d5e' });

    let currentX = MARGIN_X;
    headers.forEach((header, index) => {
      this.currentLines.push({
        type: 'text',
        text: header,
        x: currentX + 6,
        y: this.y - 15,
        size: 8,
        bold: true,
        color: '#ffffff',
      });
      currentX += colWidths[index];
    });

    this.y -= headerHeight;
  }

  private getColumnChars(width: number) {
    return Math.max(8, Math.floor(width / 5.2));
  }

  private addRect(x: number, y: number, width: number, height: number, options: { stroke?: string; fill?: string } = {}) {
    this.currentLines.push({ type: 'rect', x, y, width, height, stroke: options.stroke, fill: options.fill });
  }

  private addShapeLine(x1: number, y1: number, x2: number, y2: number, stroke?: string) {
    this.currentLines.push({ type: 'line', x1, y1, x2, y2, stroke });
  }

  private getFooterElements(pageNumber: number, pageCount: number): PdfElement[] {
    return [
      { type: 'line', x1: MARGIN_X, y1: 36, x2: MARGIN_X + CONTENT_WIDTH, y2: 36, stroke: '#d9e2ec' },
      { type: 'text', text: this.title, x: MARGIN_X, y: 22, size: 7, color: '#64748b' },
      { type: 'text', text: `Pagina ${pageNumber} de ${pageCount}`, x: 500, y: 22, size: 7, color: '#64748b' },
    ];
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
        element.fill && element.stroke ? 'B' : element.fill ? 'f' : 'S',
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

function fitInside(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  return {
    width: sourceWidth * ratio,
    height: sourceHeight * ratio,
  };
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
    let bitDepth = 0;
    const idatChunks: Buffer[] = [];

    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      offset += 12 + length;

      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data.readUInt8(8);
        colorType = data.readUInt8(9);
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      } else if (type === 'IEND') {
        break;
      }
    }

    if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) return null;

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
    for (let source = 0, target = 0; source < raw.length; source += bytesPerPixel, target += 3) {
      const alpha = colorType === 6 ? raw[source + 3] / 255 : 1;
      const red = Math.round(raw[source] * alpha + 255 * (1 - alpha));
      const green = Math.round(raw[source + 1] * alpha + 255 * (1 - alpha));
      const blue = Math.round(raw[source + 2] * alpha + 255 * (1 - alpha));
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const ink = alpha > 0.02 && luminance < 245;

      rgbData[target] = ink ? Math.max(0, Math.round(red * 0.35)) : 255;
      rgbData[target + 1] = ink ? Math.max(0, Math.round(green * 0.35)) : 255;
      rgbData[target + 2] = ink ? Math.max(0, Math.round(blue * 0.35)) : 255;
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
