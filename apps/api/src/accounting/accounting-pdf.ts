import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const DEFAULT_CJK_REGULAR_FONT =
  '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc';
const DEFAULT_CJK_BOLD_FONT = '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc';

export const ACCOUNTING_PDF_FONT_ENV = {
  regular: 'SANQ_PDF_FONT_REGULAR',
  bold: 'SANQ_PDF_FONT_BOLD',
} as const;

export type AccountingPdfFonts = {
  regular: string;
  bold: string;
  unicode: boolean;
};

type AccountingPdfTextOptions = {
  width?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  lineBreak?: boolean;
  ellipsis?: boolean | string;
};

export interface AccountingPdfDocument {
  y: number;
  page: {
    width: number;
    height: number;
  };
  addPage(): this;
  font(name: string): this;
  fontSize(size: number): this;
  text(
    text: string,
    x?: number,
    y?: number,
    options?: AccountingPdfTextOptions,
  ): this;
  moveDown(lines?: number): this;
  fillColor(color: string): this;
  rect(x: number, y: number, width: number, height: number): this;
  fill(color?: string): this;
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  lineWidth(width: number): this;
  strokeColor(color: string): this;
  stroke(): this;
  registerFont(name: string, src: string, family?: string): this;
  on(
    event: 'data',
    listener: (chunk: Buffer | Uint8Array) => void,
  ): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'end', listener: () => void): this;
  removeAllListeners(event?: string): this;
  end(): void;
  destroy(error?: Error): void;
}

type AccountingPdfDocumentOptions = {
  size: 'LETTER';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  compress: boolean;
  info: {
    Title: string;
    Subject: string;
    Author: string;
    Creator: string;
    Producer: string;
    CreationDate: Date;
    ModDate: Date;
  };
};

type PdfKitConstructor = new (
  options?: AccountingPdfDocumentOptions,
) => AccountingPdfDocument;

const loadPdfKitConstructor = (): PdfKitConstructor => {
  const moduleValue: unknown = createRequire(__filename)('pdfkit');

  if (typeof moduleValue === 'function') {
    return moduleValue as PdfKitConstructor;
  }

  if (moduleValue && typeof moduleValue === 'object') {
    const namedExport = (moduleValue as { PDFDocument?: unknown }).PDFDocument;
    if (typeof namedExport === 'function') {
      return namedExport as PdfKitConstructor;
    }
  }

  throw new Error('pdfkit did not expose a PDFDocument constructor');
};

const PDFDocument = loadPdfKitConstructor();

export type AccountingPdfRenderContext = {
  doc: AccountingPdfDocument;
  fonts: AccountingPdfFonts;
};

type AccountingPdfOptions = {
  title: string;
  subject?: string;
  creationDate?: Date;
  requiresUnicode?: boolean;
};

const resolveFontPath = (envKey: string, fallback: string): string | null => {
  const explicit = process.env[envKey]?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  return existsSync(fallback) ? fallback : null;
};

const registerFonts = (
  doc: AccountingPdfDocument,
  requiresUnicode: boolean,
): AccountingPdfFonts => {
  const regular = resolveFontPath(
    ACCOUNTING_PDF_FONT_ENV.regular,
    DEFAULT_CJK_REGULAR_FONT,
  );
  const bold = resolveFontPath(
    ACCOUNTING_PDF_FONT_ENV.bold,
    DEFAULT_CJK_BOLD_FONT,
  );

  if (regular && bold) {
    doc.registerFont(
      'SanQPdfRegular',
      regular,
      'NotoSansCJKsc-Regular',
    );
    doc.registerFont('SanQPdfBold', bold, 'NotoSansCJKsc-Bold');
    return {
      regular: 'SanQPdfRegular',
      bold: 'SanQPdfBold',
      unicode: true,
    };
  }

  if (requiresUnicode) {
    throw new Error(
      'Unicode PDF rendering requires Noto Sans CJK fonts; install font-noto-cjk or set SANQ_PDF_FONT_REGULAR/SANQ_PDF_FONT_BOLD',
    );
  }

  return {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    unicode: false,
  };
};

export const containsNonAscii = (value: string): boolean =>
  Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 0x7f);

export const renderAccountingPdf = (
  options: AccountingPdfOptions,
  render: (context: AccountingPdfRenderContext) => void,
): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const creationDate =
      options.creationDate && !Number.isNaN(options.creationDate.getTime())
        ? options.creationDate
        : new Date('2000-01-01T00:00:00.000Z');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, right: 54, bottom: 54, left: 54 },
      compress: true,
      info: {
        Title: options.title,
        Subject: options.subject ?? '',
        Author: 'SanQ',
        Creator: 'SanQ Accounting',
        Producer: 'SanQ Accounting',
        CreationDate: creationDate,
        ModDate: creationDate,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('error', (error: Error) => reject(error));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      const fonts = registerFonts(doc, options.requiresUnicode === true);
      render({ doc, fonts });
      doc.end();
    } catch (error) {
      doc.removeAllListeners('data');
      doc.removeAllListeners('end');
      doc.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
