import {
  ACCOUNTING_DOCUMENT_EXTRACTION_POLICY,
  type AccountingDocumentExtraction,
} from './accounting-document-extraction';
import {
  ACCOUNTING_SCANNED_PDF_RASTER_POLICY,
  inspectAccountingPdfPageCount,
  rasterizeAccountingPdfPage,
} from './accounting-pdf-rasterizer';
import {
  extractAccountingText,
  reconcileAccountingExpenseExtractionWithLayout,
} from './accounting-pdf-extractor';
import {
  ACCOUNTING_TEXTRACT_EXPENSE_POLICY,
  recognizeAccountingDocumentPageImageWithTextract,
  type AccountingTextractDocumentPageRecognition,
} from './accounting-textract-expense-recognition';

export const ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY = {
  maxPages: ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxPages,
  rasterDpi: ACCOUNTING_SCANNED_PDF_RASTER_POLICY.rasterDpi,
  maxMergedLines: ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLines,
  maxAggregatePreparedImageBytes:
    ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxPages *
    ACCOUNTING_TEXTRACT_EXPENSE_POLICY.maxImageBytes,
} as const;

export type AccountingScannedPdfOcrEvidence = {
  provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE_PAGE_OCR';
  pageCount: number;
  rasterDpi: number;
  totalPreparedImageBytes: number;
  pages: Array<{
    page: number;
    requestId: string | null;
    modelVersion: string | null;
    width: number;
    height: number;
    preparedImageBytes: number;
    lineCount: number;
  }>;
};

export type AccountingScannedPdfRecognition = {
  text: string;
  extraction: ReturnType<typeof extractAccountingText>;
  documentExtraction: AccountingDocumentExtraction;
  evidence: AccountingScannedPdfOcrEvidence;
};

type AccountingScannedPdfRecognitionDependencies = {
  inspectPageCount?: typeof inspectAccountingPdfPageCount;
  rasterizePage?: typeof rasterizeAccountingPdfPage;
  recognizePage?: (
    buffer: Buffer,
  ) => Promise<AccountingTextractDocumentPageRecognition>;
};

export async function recognizeAccountingScannedPdfWithTextract(
  buffer: Buffer,
  dependencies: AccountingScannedPdfRecognitionDependencies = {},
): Promise<AccountingScannedPdfRecognition> {
  const inspectPageCount =
    dependencies.inspectPageCount ?? inspectAccountingPdfPageCount;
  const rasterizePage =
    dependencies.rasterizePage ?? rasterizeAccountingPdfPage;
  const recognizePage =
    dependencies.recognizePage ??
    recognizeAccountingDocumentPageImageWithTextract;

  const pageCount = await inspectPageCount(buffer);
  if (pageCount > ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxPages) {
    throw new Error(
      `Accounting scanned PDF page count exceeded limit (${pageCount} > ${ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxPages})`,
    );
  }

  const mergedLines: AccountingDocumentExtraction['lines'] = [];
  const pages: AccountingScannedPdfOcrEvidence['pages'] = [];
  let totalPreparedImageBytes = 0;

  for (let page = 1; page <= pageCount; page += 1) {
    const raster = await rasterizePage(buffer, page);
    const recognition = await recognizePage(raster);
    const pageExtraction = recognition.documentExtraction;

    if (
      pageExtraction.inputKind !== 'IMAGE' ||
      pageExtraction.engine !== 'AWS_TEXTRACT'
    ) {
      throw new Error(
        `Accounting scanned PDF page ${page} OCR extraction contract is invalid`,
      );
    }
    if (pageExtraction.truncated) {
      throw new Error(
        `Accounting scanned PDF page ${page} OCR extraction was truncated`,
      );
    }
    if (!pageExtraction.lines.length) {
      throw new Error(
        `Accounting scanned PDF page ${page} returned no OCR lines`,
      );
    }
    if (!pageExtraction.lines.some((line) => line.geometry !== null)) {
      throw new Error(
        `Accounting scanned PDF page ${page} returned no OCR geometry`,
      );
    }

    totalPreparedImageBytes += recognition.submittedImage.byteSize;
    if (
      totalPreparedImageBytes >
      ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxAggregatePreparedImageBytes
    ) {
      throw new Error(
        'Accounting scanned PDF aggregate OCR image budget exceeded limit',
      );
    }

    if (
      mergedLines.length + pageExtraction.lines.length >
      ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.maxMergedLines
    ) {
      throw new Error('Accounting scanned PDF merged OCR line limit exceeded');
    }

    const orderedPageLines = [...pageExtraction.lines].sort(
      (left, right) =>
        (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0) ||
        (left.geometry?.left ?? 0) - (right.geometry?.left ?? 0) ||
        left.lineId.localeCompare(right.lineId),
    );
    for (const [index, line] of orderedPageLines.entries()) {
      mergedLines.push({
        ...line,
        lineId: `p${page}-l${index + 1}`,
        page,
      });
    }

    pages.push({
      page,
      requestId: recognition.requestId,
      modelVersion: recognition.modelVersion,
      width: recognition.submittedImage.width,
      height: recognition.submittedImage.height,
      preparedImageBytes: recognition.submittedImage.byteSize,
      lineCount: pageExtraction.lines.length,
    });
  }

  const documentExtraction: AccountingDocumentExtraction = {
    version: 1,
    inputKind: 'PDF',
    engine: 'AWS_TEXTRACT',
    layoutMode: 'GEOMETRY',
    truncated: false,
    lines: mergedLines,
  };
  const text = mergedLines.map((line) => line.text).join('\n');

  return {
    text,
    extraction: reconcileAccountingExpenseExtractionWithLayout(
      extractAccountingText(text),
      documentExtraction,
    ),
    documentExtraction,
    evidence: {
      provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE_PAGE_OCR',
      pageCount,
      rasterDpi: ACCOUNTING_SCANNED_PDF_RECOGNITION_POLICY.rasterDpi,
      totalPreparedImageBytes,
      pages,
    },
  };
}
