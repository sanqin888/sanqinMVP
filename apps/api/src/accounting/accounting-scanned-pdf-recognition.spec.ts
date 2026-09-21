import {
  ACCOUNTING_DOCUMENT_EXTRACTION_POLICY,
  type AccountingDocumentExtraction,
} from './accounting-document-extraction';
import {
  ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY,
  recognizeAccountingScannedPdfWithTextract,
} from './accounting-scanned-pdf-recognition';
import type {
  AccountingTextractDocumentPageRecognition,
} from './accounting-textract-expense-recognition';

const pdf = Buffer.from('%PDF-1.7\n%%EOF', 'ascii');

function pageRecognition(
  lines: AccountingDocumentExtraction['lines'],
  preparedImageBytes = 1_000,
): AccountingTextractDocumentPageRecognition {
  return {
    documentExtraction: {
      version: 1,
      inputKind: 'IMAGE',
      engine: 'AWS_TEXTRACT',
      layoutMode: lines.some((line) => line.geometry)
        ? 'GEOMETRY'
        : 'TEXT_ONLY',
      truncated: false,
      lines,
    },
    requestId: 'request',
    modelVersion: '1.0',
    submittedImage: {
      width: 1700,
      height: 2200,
      byteSize: preparedImageBytes,
    },
  };
}

const geometry = (top: number, left = 0.1) => ({
  left,
  top,
  width: 0.2,
  height: 0.03,
});

describe('Accounting scanned PDF recognition', () => {
  it('rasterizes and OCRs pages sequentially and merges source page geometry', async () => {
    const calls: string[] = [];
    const rasterizePage = jest.fn((_buffer: Buffer, page: number) => {
      calls.push(`raster:${page}`);
      return Promise.resolve(Buffer.from(`page-${page}`));
    });
    const recognizePage = jest.fn((buffer: Buffer) => {
      const page = Number(buffer.toString('utf8').split('-')[1]);
      calls.push(`ocr:${page}`);
      return Promise.resolve(
        pageRecognition([
          {
            lineId: 'provider-l2',
            page: 1,
            text: page === 1 ? '$100.00' : '$13.00',
            confidence: 98,
            geometry: geometry(0.2, 0.7),
          },
          {
            lineId: 'provider-l1',
            page: 1,
            text: page === 1 ? 'Sales' : 'Tax',
            confidence: 99,
            geometry: geometry(0.2, 0.1),
          },
        ]),
      );
    });

    const result = await recognizeAccountingScannedPdfWithTextract(pdf, {
      inspectPageCount: () => Promise.resolve(2),
      rasterizePage,
      recognizePage,
    });

    expect(calls).toEqual(['raster:1', 'ocr:1', 'raster:2', 'ocr:2']);
    expect(result.documentExtraction).toEqual(
      expect.objectContaining({
        inputKind: 'PDF',
        engine: 'AWS_TEXTRACT',
        layoutMode: 'GEOMETRY',
        truncated: false,
      }),
    );
    expect(result.documentExtraction.lines.map((line) => line.lineId)).toEqual([
      'p1-l1',
      'p1-l2',
      'p2-l1',
      'p2-l2',
    ]);
    expect(result.documentExtraction.lines.map((line) => line.page)).toEqual([
      1, 1, 2, 2,
    ]);
    expect(result.text).toBe('Sales\n$100.00\nTax\n$13.00');
    expect(result.evidence).toEqual(
      expect.objectContaining({
        pageCount: 2,
        rasterDpi: 200,
        totalPreparedImageBytes: 2_000,
      }),
    );
    expect(result.evidence.pages).toHaveLength(2);
  });

  it('rejects over-limit PDFs before rasterization or Textract', async () => {
    const rasterizePage = jest.fn();
    const recognizePage = jest.fn();

    await expect(
      recognizeAccountingScannedPdfWithTextract(pdf, {
        inspectPageCount: () =>
          Promise.resolve(
            ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxPages + 1,
          ),
        rasterizePage,
        recognizePage,
      }),
    ).rejects.toThrow('page count exceeded limit');

    expect(rasterizePage).not.toHaveBeenCalled();
    expect(recognizePage).not.toHaveBeenCalled();
  });

  it('fails the whole document when any page OCR fails and does not continue', async () => {
    const rasterizePage = jest.fn((_buffer: Buffer, page: number) =>
      Promise.resolve(Buffer.from(`page-${page}`)),
    );
    const recognizePage = jest.fn((buffer: Buffer) => {
      if (buffer.toString('utf8') === 'page-2') {
        return Promise.reject(new Error('simulated Textract failure'));
      }
      return Promise.resolve(
        pageRecognition([
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'Page text',
            confidence: 99,
            geometry: geometry(0.1),
          },
        ]),
      );
    });

    await expect(
      recognizeAccountingScannedPdfWithTextract(pdf, {
        inspectPageCount: () => Promise.resolve(3),
        rasterizePage,
        recognizePage,
      }),
    ).rejects.toThrow('simulated Textract failure');

    expect(rasterizePage).toHaveBeenCalledTimes(2);
    expect(recognizePage).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'truncated',
      extraction: {
        version: 1 as const,
        inputKind: 'IMAGE' as const,
        engine: 'AWS_TEXTRACT' as const,
        layoutMode: 'GEOMETRY' as const,
        truncated: true,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'text',
            confidence: 99,
            geometry: geometry(0.1),
          },
        ],
      },
      expected: 'was truncated',
    },
    {
      name: 'empty',
      extraction: {
        version: 1 as const,
        inputKind: 'IMAGE' as const,
        engine: 'AWS_TEXTRACT' as const,
        layoutMode: 'TEXT_ONLY' as const,
        truncated: false,
        lines: [],
      },
      expected: 'returned no OCR lines',
    },
    {
      name: 'geometry-free',
      extraction: {
        version: 1 as const,
        inputKind: 'IMAGE' as const,
        engine: 'AWS_TEXTRACT' as const,
        layoutMode: 'TEXT_ONLY' as const,
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'text',
            confidence: 99,
            geometry: null,
          },
        ],
      },
      expected: 'returned no OCR geometry',
    },
  ])('fails closed for $name page extraction', async ({ extraction, expected }) => {
    await expect(
      recognizeAccountingScannedPdfWithTextract(pdf, {
        inspectPageCount: () => Promise.resolve(1),
        rasterizePage: () => Promise.resolve(Buffer.from('page')),
        recognizePage: () =>
          Promise.resolve({
            ...pageRecognition([]),
            documentExtraction: extraction,
          }),
      }),
    ).rejects.toThrow(expected);
  });

  it('fails closed instead of truncating merged lines', async () => {
    const firstPageCount = 1_200;
    const secondPageCount =
      ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLines - firstPageCount + 1;
    let call = 0;

    await expect(
      recognizeAccountingScannedPdfWithTextract(pdf, {
        inspectPageCount: () => Promise.resolve(2),
        rasterizePage: () => Promise.resolve(Buffer.from('page')),
        recognizePage: () => {
          call += 1;
          const count = call === 1 ? firstPageCount : secondPageCount;
          return Promise.resolve(
            pageRecognition(
              Array.from({ length: count }, (_, index) => ({
                lineId: `p1-l${index + 1}`,
                page: 1,
                text: `line ${index + 1}`,
                confidence: 99,
                geometry: geometry((index % 100) / 100),
              })),
            ),
          );
        },
      }),
    ).rejects.toThrow('merged OCR line limit exceeded');
  });

  it('fails closed when aggregate prepared-image bytes exceed the document budget', async () => {
    await expect(
      recognizeAccountingScannedPdfWithTextract(pdf, {
        inspectPageCount: () =>
          Promise.resolve(
            ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxPages,
          ),
        rasterizePage: () => Promise.resolve(Buffer.from('page')),
        recognizePage: () =>
          Promise.resolve(
            pageRecognition(
              [
                {
                  lineId: 'p1-l1',
                  page: 1,
                  text: 'text',
                  confidence: 99,
                  geometry: geometry(0.1),
                },
              ],
              ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY
                .maxAggregatePreparedImageBytes /
                ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxPages +
                1,
            ),
          ),
      }),
    ).rejects.toThrow('aggregate OCR image budget exceeded limit');
  });
});
