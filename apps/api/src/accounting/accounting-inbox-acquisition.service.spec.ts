jest.mock('./accounting-pdf-extractor', () => {
  const actual = jest.requireActual<
    typeof import('./accounting-pdf-extractor')
  >('./accounting-pdf-extractor');
  return {
    ...actual,
    extractAccountingPdf: jest.fn(() =>
      Promise.resolve({
        text: '',
        extraction: actual.extractAccountingText(''),
        documentExtraction: {
          version: 1 as const,
          inputKind: 'PDF' as const,
          engine: 'POPPLER' as const,
          layoutMode: 'TEXT_ONLY' as const,
          truncated: false,
          lines: [],
        },
      }),
    ),
  };
});

jest.mock('./accounting-image-ocr', () => ({
  extractAccountingImageText: jest.fn(() =>
    Promise.resolve({
      text: 'Invoice subtotal $75.00\nHST $9.75\nTotal $84.75',
      engine: 'TESSERACT' as const,
    }),
  ),
}));

jest.mock('./accounting-textract-expense-recognition', () => ({
  isAccountingTextractExpenseRecognitionEnabled: jest.fn(() => false),
  recognizeAccountingExpenseImageWithTextract: jest.fn(),
}));

jest.mock('./accounting-scanned-pdf-recognition', () => ({
  recognizeAccountingScannedPdfWithTextract: jest.fn(),
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  AccountingArtifactKind,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';
import { extractAccountingImageText } from './accounting-image-ocr';
import {
  extractAccountingPdf,
  extractAccountingText,
} from './accounting-pdf-extractor';
import {
  isAccountingTextractExpenseRecognitionEnabled,
  recognizeAccountingExpenseImageWithTextract,
} from './accounting-textract-expense-recognition';
import {
  recognizeAccountingScannedPdfWithTextract,
} from './accounting-scanned-pdf-recognition';
import {
  AccountingProviderFinancialProcessingError,
} from './accounting-provider-financial.service';

function scannedPdfRecognitionResult(text: string) {
  const lines = text.split('\n').map((line, index) => ({
    lineId: `p1-l${index + 1}`,
    page: 1,
    text: line,
    confidence: 99,
    geometry: {
      left: 0.1,
      top: 0.1 + index * 0.05,
      width: 0.8,
      height: 0.03,
    },
  }));
  return {
    text,
    extraction: extractAccountingText(text),
    documentExtraction: {
      version: 1 as const,
      inputKind: 'PDF' as const,
      engine: 'AWS_TEXTRACT' as const,
      layoutMode: 'GEOMETRY' as const,
      truncated: false,
      lines,
    },
    evidence: {
      provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE_PAGE_OCR' as const,
      pageCount: 1,
      rasterDpi: 200,
      totalPreparedImageBytes: 12_345,
      pages: [
        {
          page: 1,
          requestId: 'request-page-1',
          modelVersion: '1.0',
          width: 1700,
          height: 2200,
          preparedImageBytes: 12_345,
          lineCount: lines.length,
        },
      ],
    },
  };
}

function registeredArtifact(kind: AccountingArtifactKind, contentHash: string) {
  return {
    artifactStableId: `acctart_${kind.toLowerCase()}`,
    contentHash,
    kind,
    storedUrl: null,
    inboxItem: {
      inboxItemStableId: 'acctinbox_1',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.UNKNOWN,
      selectedProvider: null,
      trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      materializedEntityType: null,
      materializedEntityStableId: null,
      duplicateOfArtifact: null,
    },
    duplicateOfArtifactStableId: null,
    replayed: false,
  };
}

describe('AccountingInboxAcquisitionService', () => {
  const originalUploadRoot = process.env.UPLOAD_ROOT;
  const imageOcr = jest.mocked(extractAccountingImageText);
  const pdfExtraction = jest.mocked(extractAccountingPdf);
  const textractEnabled = jest.mocked(
    isAccountingTextractExpenseRecognitionEnabled,
  );
  const textractRecognition = jest.mocked(
    recognizeAccountingExpenseImageWithTextract,
  );
  const scannedPdfRecognition = jest.mocked(
    recognizeAccountingScannedPdfWithTextract,
  );
  let uploadRoot: string;

  beforeEach(() => {
    imageOcr.mockReset();
    pdfExtraction.mockReset();
    pdfExtraction.mockResolvedValue({
      text: '',
      extraction: extractAccountingText(''),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: [],
      },
    });
    textractEnabled.mockReset();
    textractEnabled.mockReturnValue(false);
    textractRecognition.mockReset();
    scannedPdfRecognition.mockReset();
    imageOcr.mockResolvedValue({
      text: 'Invoice subtotal $75.00\nHST $9.75\nTotal $84.75',
      engine: 'TESSERACT',
    });
    uploadRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sanq-accounting-inbox-'),
    );
    process.env.UPLOAD_ROOT = uploadRoot;
  });

  afterEach(() => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (originalUploadRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = originalUploadRoot;
  });

  function makeService() {
    const operations = {
      registerInboxArtifact: jest
        .fn()
        .mockImplementation(
          (input: { kind: AccountingArtifactKind; contentHash: string }) =>
            Promise.resolve(registeredArtifact(input.kind, input.contentHash)),
        ),
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      suggestUnifiedInboxClassification: jest.fn().mockResolvedValue({}),
      permanentlyDeleteManualUpload: jest.fn(),
    };
    const providerFinancial = {
      parseAndMaterialize: jest.fn().mockResolvedValue({ matched: false }),
      parseForInboxSuggestion: jest.fn().mockResolvedValue({ matched: false }),
      parseFantuanAdjustmentDetailForInboxSuggestion: jest
        .fn()
        .mockResolvedValue({ matched: false }),
      recordUnsupportedUberApiParse: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new AccountingInboxAcquisitionService(
        operations as never,
        providerFinancial as never,
      ),
      operations,
      providerFinancial,
    };
  }

  it('accepts manual XLSX evidence and routes it only to the Fantuan adjustment-detail parser', async () => {
    const { service, operations, providerFinancial } = makeService();
    providerFinancial.parseFantuanAdjustmentDetailForInboxSuggestion.mockResolvedValue(
      {
        matched: true,
        provider: AccountingFinancialProvider.FANTUAN,
      },
    );
    const xlsxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);

    const result = await service.acquireManualFile({
      originalname: 'Fantuan_Settlement_Details2026-08-01_2026-08-31_en.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsxBuffer,
    });

    expect(result.kind).toBe(AccountingArtifactKind.OTHER);
    expect(operations.registerInboxArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AccountingArtifactKind.OTHER,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        originalFilename:
          'Fantuan_Settlement_Details2026-08-01_2026-08-31_en.xlsx',
        storedUrl: expect.stringMatching(
          /^\/api\/v1\/accounting\/files\/inbox\/.+\.xlsx$/,
        ) as unknown,
      }),
    );
    expect(
      providerFinancial.parseFantuanAdjustmentDetailForInboxSuggestion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_other',
        buffer: xlsxBuffer,
        originalFilename:
          'Fantuan_Settlement_Details2026-08-01_2026-08-31_en.xlsx',
      }),
    );
    expect(providerFinancial.parseForInboxSuggestion).not.toHaveBeenCalled();
  });

  it('sends usable native PDF evidence through SourceArtifact and suggestion-only parsing', async () => {
    const { service, operations, providerFinancial } = makeService();
    const nativeText =
      'Invoice 2026-09-16\nSubtotal CAD 75.00\nHST CAD 9.75\nTotal CAD 84.75';
    pdfExtraction.mockResolvedValueOnce({
      text: nativeText,
      extraction: extractAccountingText(nativeText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: nativeText.split('\n').map((text, index) => ({
          lineId: `p1-l${index + 1}`,
          page: 1,
          text,
          confidence: null,
          geometry: null,
        })),
      },
    });
    const result = await service.acquireManualFile({
      originalname: 'invoice.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(result.kind).toBe(AccountingArtifactKind.PDF);
    expect(operations.registerInboxArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AccountingArtifactKind.PDF,
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
        storedUrl: expect.stringMatching(
          /^\/api\/v1\/accounting\/files\/inbox\//,
        ) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_pdf',
      }),
    );
    expect(providerFinancial.parseForInboxSuggestion).toHaveBeenCalled();
    expect(providerFinancial.parseAndMaterialize).not.toHaveBeenCalled();
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '6',
        resultJson: expect.objectContaining({
          pdfNativeTextUsability: expect.objectContaining({
            disposition: 'USABLE_NATIVE_TEXT',
            reason: 'NATIVE_TEXT_USABLE',
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('keeps native-text PDF on local extraction even when Textract is enabled', async () => {
    const { service, operations } = makeService();
    textractEnabled.mockReturnValue(true);
    const nativeText =
      'Invoice 2026/09/16\nAmount due CAD 84.75\nSubtotal CAD 75.00\nHST CAD 9.75';
    pdfExtraction.mockResolvedValue({
      text: nativeText,
      extraction: extractAccountingText(nativeText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: nativeText.split('\n').map((text, index) => ({
          lineId: `p1-l${index + 1}`,
          page: 1,
          text,
          confidence: null,
          geometry: null,
        })),
      },
    });

    await service.acquireManualFile({
      originalname: 'native-invoice.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(scannedPdfRecognition).not.toHaveBeenCalled();
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultJson: expect.objectContaining({
          inputKind: 'PDF',
          textRecognitionEngine: 'POPPLER',
          totalCents: 8475,
          sourceCurrency: 'CAD',
        }) as unknown,
      }) as unknown,
    );
  });

  it('routes weak native text through bounded scanned-PDF recognition', async () => {
    const { service, operations, providerFinancial } = makeService();
    textractEnabled.mockReturnValue(true);
    const weakText = 'Page 1';
    const ocrText =
      'Invoice 2026-09-16\nSubtotal CAD 75.00\nHST CAD 9.75\nTotal CAD 84.75';
    pdfExtraction.mockResolvedValueOnce({
      text: weakText,
      extraction: extractAccountingText(weakText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: weakText,
            confidence: null,
            geometry: null,
          },
        ],
      },
    });
    scannedPdfRecognition.mockResolvedValueOnce(
      scannedPdfRecognitionResult(ocrText),
    );

    const pdf = Buffer.from('%PDF-1.4\n%%EOF', 'ascii');
    await service.acquireManualFile({
      originalname: 'weak-native-layer.pdf',
      mimetype: 'application/pdf',
      buffer: pdf,
    });

    expect(scannedPdfRecognition).toHaveBeenCalledWith(pdf);
    expect(providerFinancial.parseForInboxSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ocrText,
        documentExtraction: expect.objectContaining({
          inputKind: 'PDF',
          engine: 'AWS_TEXTRACT',
          layoutMode: 'GEOMETRY',
        }) as unknown,
        pdfNativeTextUsability: expect.objectContaining({
          disposition: 'SCAN_CANDIDATE',
          reason: 'INSUFFICIENT_NATIVE_TEXT',
        }) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '6',
        resultJson: expect.objectContaining({
          textRecognitionEngine: 'AWS_TEXTRACT',
          pdfOcrEvidence: expect.objectContaining({
            provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE_PAGE_OCR',
            pageCount: 1,
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('keeps scan candidates in manual review when Textract is disabled', async () => {
    const { service, operations, providerFinancial } = makeService();
    const weakText = 'Page 1';
    pdfExtraction.mockResolvedValueOnce({
      text: weakText,
      extraction: extractAccountingText(weakText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: weakText,
            confidence: null,
            geometry: null,
          },
        ],
      },
    });

    await service.acquireManualFile({
      originalname: 'weak-native-disabled.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(scannedPdfRecognition).not.toHaveBeenCalled();
    expect(providerFinancial.parseForInboxSuggestion).not.toHaveBeenCalled();
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '6',
        status: AccountingParseStatus.SUCCESS,
        resultJson: expect.objectContaining({
          textRecognitionEngine: 'POPPLER',
          reviewDisposition: 'UNRECOGNIZED',
          reviewReason: 'NO_READABLE_TEXT',
          pdfNativeTextUsability: expect.objectContaining({
            disposition: 'SCAN_CANDIDATE',
            reason: 'INSUFFICIENT_NATIVE_TEXT',
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('fails suspicious native text closed without provider parsing or OCR fallback', async () => {
    const { service, operations, providerFinancial } = makeService();
    textractEnabled.mockReturnValue(true);
    const suspiciousText =
      '\uE000\uE001\uE002\uE003 \uFFFD\uFFFD\uFFFD\uFFFD 12345678';
    pdfExtraction.mockResolvedValueOnce({
      text: suspiciousText,
      extraction: extractAccountingText(suspiciousText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: suspiciousText,
            confidence: null,
            geometry: null,
          },
        ],
      },
    });

    await service.acquireManualFile({
      originalname: 'suspicious-native-layer.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(providerFinancial.parseForInboxSuggestion).not.toHaveBeenCalled();
    expect(scannedPdfRecognition).not.toHaveBeenCalled();
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '6',
        resultJson: expect.objectContaining({
          reviewDisposition: 'UNRECOGNIZED',
          reviewReason: 'NO_READABLE_TEXT',
          pdfNativeTextUsability: expect.objectContaining({
            disposition: 'FAIL_CLOSED',
            reason: 'SUSPICIOUS_NATIVE_TEXT',
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('uses bounded page-raster Textract OCR for scanned PDFs with no local text', async () => {
    const { service, operations, providerFinancial } = makeService();
    textractEnabled.mockReturnValue(true);
    const scannedPdf = Buffer.from('%PDF-1.4\nscanned\n%%EOF', 'ascii');
    const ocrText =
      'Cloud service invoice\nSep 16 2026\nSubtotal USD 20.00\nTax USD 0.00\nTotal USD 20.00';
    scannedPdfRecognition.mockResolvedValueOnce(
      scannedPdfRecognitionResult(ocrText),
    );

    await service.acquireManualFile({
      originalname: 'scanned-invoice.pdf',
      mimetype: 'application/pdf',
      buffer: scannedPdf,
    });

    expect(scannedPdfRecognition).toHaveBeenCalledWith(scannedPdf);
    expect(providerFinancial.parseForInboxSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ocrText,
        documentExtraction: expect.objectContaining({
          engine: 'AWS_TEXTRACT',
          inputKind: 'PDF',
          layoutMode: 'GEOMETRY',
        }) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '6',
        resultJson: expect.objectContaining({
          inputKind: 'PDF',
          textRecognitionEngine: 'AWS_TEXTRACT',
          pdfNativeTextUsability: expect.objectContaining({
            disposition: 'SCAN_CANDIDATE',
            reason: 'NO_NATIVE_TEXT',
          }) as unknown,
          totalCents: 2000,
          sourceCurrency: 'USD',
          documentExtraction: expect.objectContaining({
            engine: 'AWS_TEXTRACT',
            inputKind: 'PDF',
            layoutMode: 'GEOMETRY',
          }) as unknown,
          pdfOcrEvidence: expect.objectContaining({
            provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE_PAGE_OCR',
            pageCount: 1,
            rasterDpi: 200,
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('records scanned-PDF OCR failure as an error without partial provider parsing', async () => {
    const { service, operations, providerFinancial } = makeService();
    textractEnabled.mockReturnValue(true);
    scannedPdfRecognition.mockRejectedValueOnce(
      new Error('Accounting scanned PDF page 2 OCR failed'),
    );

    await service.acquireManualFile({
      originalname: 'scanned-failure.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nscanned\n%%EOF', 'ascii'),
    });

    expect(providerFinancial.parseForInboxSuggestion).not.toHaveBeenCalled();
    expect(operations.recordInboxParseRun).toHaveBeenCalledTimes(1);
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '2',
        status: AccountingParseStatus.ERROR,
        errorMessage: 'Accounting scanned PDF page 2 OCR failed',
      }),
    );
  });

  it('normalizes mojibake multipart filenames before persistence and parsing', async () => {
    const { service, operations, providerFinancial } = makeService();
    const nativeText =
      'Invoice 2026-09-16\nSubtotal CAD 75.00\nHST CAD 9.75\nTotal CAD 84.75';
    pdfExtraction.mockResolvedValueOnce({
      text: nativeText,
      extraction: extractAccountingText(nativeText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: nativeText.split('\n').map((text, index) => ({
          lineId: `p1-l${index + 1}`,
          page: 1,
          text,
          confidence: null,
          geometry: null,
        })),
      },
    });
    await service.acquireManualFile({
      originalname:
        '6 2026_SanQ Roujiamo \u00e4\u00b8\u0089\u00e7\u00a7\u00a6\u00e8\u0082\u0089\u00e5\u00a4\u00b9\u00e9\u00a6\u008d.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(operations.registerInboxArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: '6 2026_SanQ Roujiamo 三秦肉夹馍.pdf',
      }),
    );
    expect(providerFinancial.parseForInboxSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: '6 2026_SanQ Roujiamo 三秦肉夹馍.pdf',
      }),
    );
  });

  it('removes the second physical file when a manual upload is detected as duplicate', async () => {
    const { service, operations } = makeService();
    let duplicateStoredUrl = '';
    operations.registerInboxArtifact.mockImplementationOnce(
      (input: {
        kind: AccountingArtifactKind;
        contentHash: string;
        storedUrl: string;
      }) => {
        duplicateStoredUrl = input.storedUrl;
        return Promise.resolve({
          ...registeredArtifact(input.kind, input.contentHash),
          storedUrl: null,
          inboxItem: {
            ...registeredArtifact(input.kind, input.contentHash).inboxItem,
            status: AccountingInboxStatus.DUPLICATE,
            duplicateOfArtifact: { artifactStableId: 'acctart_original' },
          },
          duplicateOfArtifactStableId: 'acctart_original',
        });
      },
    );
    const result = await service.acquireManualFile({
      originalname: 'duplicate.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(result.inboxItem?.status).toBe(AccountingInboxStatus.DUPLICATE);
    expect(result.storedUrl).toBeNull();
    expect(result.duplicateStorageCleanupComplete).toBe(true);
    const duplicateFile = path.join(
      uploadRoot,
      'accounting',
      'inbox',
      path.basename(duplicateStoredUrl),
    );
    expect(fs.existsSync(duplicateFile)).toBe(false);
    expect(operations.recordInboxParseRun).not.toHaveBeenCalled();
  });

  it('removes retained manual-upload binaries after permanent database deletion', async () => {
    const { service, operations } = makeService();
    const inboxDir = path.join(uploadRoot, 'accounting', 'inbox');
    fs.mkdirSync(inboxDir, { recursive: true });
    const fileName = 'permanent-delete.pdf';
    const filePath = path.join(inboxDir, fileName);
    fs.writeFileSync(filePath, 'delete-me');
    operations.permanentlyDeleteManualUpload.mockResolvedValueOnce({
      inboxItemStableId: 'acctinbox_delete',
      deleted: true,
      deletedArtifactStableIds: ['acctart_delete'],
      removedDuplicateCount: 0,
      storedUrls: [`/api/v1/accounting/files/inbox/${fileName}`],
    });

    const result = await service.permanentlyDeleteManualUpload(
      'acctinbox_delete',
      'user_stable_1',
    );

    expect(fs.existsSync(filePath)).toBe(false);
    expect(result).toEqual({
      inboxItemStableId: 'acctinbox_delete',
      deleted: true,
      deletedArtifactStableIds: ['acctart_delete'],
      removedDuplicateCount: 0,
      storageCleanupComplete: true,
    });
  });

  it('runs image OCR from the original uploaded bytes without a lossy retention transform', async () => {
    const { service, operations } = makeService();
    const original = await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .jpeg({ quality: 96 })
      .toBuffer();

    await service.acquireManualFile({
      originalname: 'receipt.jpg',
      mimetype: 'image/jpeg',
      buffer: original,
    });

    expect(imageOcr).toHaveBeenCalledTimes(1);
    expect(imageOcr).toHaveBeenCalledWith(original);
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_image',
        status: AccountingParseStatus.SUCCESS,
        resultJson: expect.objectContaining({
          inputKind: 'IMAGE',
          ocrEngine: 'TESSERACT',
          ocrStatus: 'SUCCESS',
        }) as unknown,
      }) as unknown,
    );
  });

  it('prefers Textract expense recognition for images when the feature is enabled', async () => {
    const { service, operations, providerFinancial } = makeService();
    textractEnabled.mockReturnValue(true);
    textractRecognition.mockResolvedValue({
      text: [
        'FOODY MART',
        '2026/09/08',
        'Sub Total 42.38',
        'HST 0.00',
        'Total after Tax 42.38',
      ].join('\n'),
      extraction: {
        date: '2026-09-08',
        subtotalCents: 4238,
        taxCents: 0,
        totalCents: 4238,
        sourceCurrency: null,
        sourceCurrencyEvidence: 'UNKNOWN',
        suggestedCategoryStableId: null,
        suggestedCategoryName: null,
        confidence: 'HIGH',
        requiresSplit: false,
        textLength: 73,
      },
      documentExtraction: {
        version: 1,
        inputKind: 'IMAGE',
        engine: 'AWS_TEXTRACT',
        layoutMode: 'GEOMETRY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'FOODY MART',
            confidence: 99,
            geometry: {
              left: 0.2,
              top: 0.05,
              width: 0.6,
              height: 0.02,
            },
          },
        ],
      },
      evidence: {
        provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE',
        modelVersion: '1.0',
        requestId: 'request-1',
        vendorName: 'FOODY MART',
        dateCandidates: [{ text: '2026/09/08', confidence: 99.9 }],
        summaryFields: {
          subtotal: {
            type: 'SUBTOTAL',
            text: '42.38',
            confidence: 99.9,
            currencyCode: 'USD',
            currencyConfidence: 88,
          },
          tax: {
            type: 'TAX',
            text: '0.00',
            confidence: 99.9,
            currencyCode: 'USD',
            currencyConfidence: 88,
          },
          total: {
            type: 'TOTAL',
            text: '42.38',
            confidence: 99.9,
            currencyCode: 'USD',
            currencyConfidence: 88,
          },
          amountPaid: {
            type: 'AMOUNT_PAID',
            text: '12.38',
            confidence: 99.7,
            currencyCode: 'USD',
            currencyConfidence: 88,
          },
        },
        currencySuggestion: {
          code: 'USD',
          confidence: 88,
          ambiguous: false,
        },
        financialConsistency: 'MATCHED',
        lineItemCount: 3,
        lineItemPriceCount: 3,
        lineItemPriceSumCents: 4238,
        lineItemsReconcileToSubtotal: true,
        lineItemHints: [
          { description: 'Meat the', priceCents: 1132, confidence: 99.1 },
          { description: 'Meat', priceCents: 2307, confidence: 99.2 },
          {
            description: 'New Zealand Golden Kiwi',
            priceCents: 799,
            confidence: 98.8,
          },
        ],
        lineItemHintsTruncated: false,
        submittedDocument: {
          kind: 'IMAGE',
          cropApplied: true,
          width: 1200,
          height: 2400,
          byteSize: 300000,
        },
      },
    });
    const original = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .jpeg({ quality: 96 })
      .toBuffer();

    await service.acquireManualFile({
      originalname: 'receipt.jpg',
      mimetype: 'image/jpeg',
      buffer: original,
    });

    expect(textractRecognition).toHaveBeenCalledWith(original);
    expect(imageOcr).not.toHaveBeenCalled();
    expect(providerFinancial.parseForInboxSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_image',
        text: expect.stringContaining('Total after Tax 42.38') as unknown,
        documentExtraction: expect.objectContaining({
          engine: 'AWS_TEXTRACT',
          inputKind: 'IMAGE',
          layoutMode: 'GEOMETRY',
        }) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '4',
        status: AccountingParseStatus.SUCCESS,
        resultJson: expect.objectContaining({
          inputKind: 'IMAGE',
          ocrEngine: 'AWS_TEXTRACT',
          ocrStatus: 'SUCCESS',
          totalCents: 4238,
          sourceCurrency: null,
          documentExtraction: expect.objectContaining({
            engine: 'AWS_TEXTRACT',
            layoutMode: 'GEOMETRY',
          }) as unknown,
          textractEvidence: expect.objectContaining({
            provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE',
            currencySuggestion: {
              code: 'USD',
              confidence: 88,
              ambiguous: false,
            },
            lineItemHints: [
              { description: 'Meat the', priceCents: 1132, confidence: 99.1 },
              { description: 'Meat', priceCents: 2307, confidence: 99.2 },
              {
                description: 'New Zealand Golden Kiwi',
                priceCents: 799,
                confidence: 98.8,
              },
            ],
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('falls back to Tesseract when enabled Textract recognition fails', async () => {
    const { service, operations } = makeService();
    textractEnabled.mockReturnValue(true);
    textractRecognition.mockRejectedValue(new Error('textract unavailable'));
    const original = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .png()
      .toBuffer();

    await service.acquireManualFile({
      originalname: 'receipt.png',
      mimetype: 'image/png',
      buffer: original,
    });

    expect(textractRecognition).toHaveBeenCalledWith(original);
    expect(imageOcr).toHaveBeenCalledWith(original);
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserVersion: '4',
        status: AccountingParseStatus.SUCCESS,
        resultJson: expect.objectContaining({
          ocrEngine: 'TESSERACT',
          ocrFallbackFrom: 'AWS_TEXTRACT',
          documentExtraction: expect.objectContaining({
            inputKind: 'IMAGE',
            engine: 'TESSERACT',
            layoutMode: 'TEXT_ONLY',
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });

  it('records a real parse error when image OCR execution fails', async () => {
    const { service, operations } = makeService();
    imageOcr.mockRejectedValueOnce(new Error('simulated OCR failure'));
    const original = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      service.acquireManualFile({
        originalname: 'receipt.png',
        mimetype: 'image/png',
        buffer: original,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ kind: AccountingArtifactKind.IMAGE }),
    );

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_image',
        status: AccountingParseStatus.ERROR,
        errorMessage: 'simulated OCR failure',
      }) as unknown,
    );
    expect(operations.suggestUnifiedInboxClassification).not.toHaveBeenCalled();
  });

  it('keeps same-priority provider recognition ambiguity unclassified for manual review', async () => {
    const { service, operations, providerFinancial } = makeService();
    const nativeText =
      'Monthly statement\nSettlement period 2026-09-01 through 2026-09-30\nNet Total CAD 100.00';
    pdfExtraction.mockResolvedValueOnce({
      text: nativeText,
      extraction: extractAccountingText(nativeText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: nativeText.split('\n').map((text, index) => ({
          lineId: `p1-l${index + 1}`,
          page: 1,
          text,
          confidence: null,
          geometry: null,
        })),
      },
    });
    providerFinancial.parseForInboxSuggestion.mockResolvedValueOnce({
      matched: false,
      ambiguousRuleStableIds: [
        'acct_recognition_uber_monthly_statement',
        'acct_recognition_fantuan_statement',
      ],
    });

    await service.acquireManualFile({
      originalname: 'ambiguous.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultJson: expect.objectContaining({
          providerRecognitionAmbiguousRuleStableIds: [
            'acct_recognition_uber_monthly_statement',
            'acct_recognition_fantuan_statement',
          ],
        }) as unknown,
      }) as unknown,
    );
    expect(operations.suggestUnifiedInboxClassification).not.toHaveBeenCalled();
  });

  it('keeps Provider API CSV evidence on the existing automatic materialization path', async () => {
    const { service, providerFinancial } = makeService();
    textractEnabled.mockReturnValue(true);
    providerFinancial.parseAndMaterialize.mockResolvedValueOnce({
      matched: true,
    });

    await service.acquireProviderApiCsv({
      transportIdentity: 'uber-report:report_1:artifact_1',
      fileName: 'finance.csv',
      content: 'Metric,Amount\nSales,12.34\n',
      provider: AccountingFinancialProvider.UBER_EATS,
      reportType: 'FINANCE_SUMMARY_REPORT',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      providerDocumentRef: 'report_1:1',
    });

    expect(providerFinancial.parseAndMaterialize).toHaveBeenCalled();
    expect(providerFinancial.parseForInboxSuggestion).not.toHaveBeenCalled();
    expect(scannedPdfRecognition).not.toHaveBeenCalled();
  });

  it('does not route unsupported Provider API CSV through structured expense parsing', async () => {
    const { service, operations, providerFinancial } = makeService();

    await service.acquireProviderApiCsv({
      transportIdentity: 'uber-report:report_2:artifact_1',
      fileName: 'finance.csv',
      content: 'Bill Date,Amount Due,Vendor\n2026-08-01,12.34,Example\n',
      provider: AccountingFinancialProvider.UBER_EATS,
      reportType: 'FINANCE_SUMMARY_REPORT',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      providerDocumentRef: 'report_2:1',
    });

    expect(providerFinancial.parseAndMaterialize).toHaveBeenCalled();
    expect(
      providerFinancial.recordUnsupportedUberApiParse,
    ).toHaveBeenCalledWith({
      artifactStableId: 'acctart_csv',
      reportType: 'FINANCE_SUMMARY_REPORT',
    });
    expect(providerFinancial.parseForInboxSuggestion).not.toHaveBeenCalled();
    expect(operations.suggestUnifiedInboxClassification).not.toHaveBeenCalled();
  });

  it('recognizes a single-row structured expense CSV after provider recognition misses', async () => {
    const { service, operations, providerFinancial } = makeService();
    await service.acquireManualFile({
      originalname: 'telecom_invoice.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(
        'invoice_date,invoice_total,vendor\n2026-06-01,12.34,Example Telecom\n',
        'utf8',
      ),
    });

    expect(providerFinancial.parseForInboxSuggestion).toHaveBeenCalled();
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_csv',
        parserName: 'accounting-structured-expense-csv',
        status: AccountingParseStatus.SUCCESS,
        resultJson: expect.objectContaining({
          inputKind: 'CSV',
          structuredExpenseCsv: true,
          structuredExpenseRowCount: 1,
          structuredExpenseInvalidRowCount: 0,
          requiresBatchExpenseImport: false,
          date: '2026-06-01',
          totalCents: 1234,
          suggestedCategoryStableId: 'expense_telecom',
        }) as unknown,
      }) as unknown,
    );
    expect(operations.suggestUnifiedInboxClassification).toHaveBeenCalledWith(
      'acctart_csv',
      {
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        selectedProvider: null,
      },
    );
  });

  it('keeps a multi-row structured expense CSV as a batch candidate without suggesting one expense', async () => {
    const { service, operations } = makeService();
    await service.acquireManualFile({
      originalname: 'historical-bills.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(
        [
          'Bill Date,Amount Due,Service',
          '2026-07-28,84.69,Business services',
          '2026-06-28,84.69,Business services',
        ].join('\n'),
        'utf8',
      ),
    });

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_csv',
        parserName: 'accounting-structured-expense-csv',
        status: AccountingParseStatus.SUCCESS,
        resultJson: expect.objectContaining({
          structuredExpenseCsv: true,
          structuredExpenseRowCount: 2,
          structuredExpenseInvalidRowCount: 0,
          requiresBatchExpenseImport: true,
          reviewReason: 'STRUCTURED_EXPENSE_BATCH',
        }) as unknown,
      }) as unknown,
    );
    expect(operations.suggestUnifiedInboxClassification).not.toHaveBeenCalled();
  });

  it('leaves an unrecognized manual CSV for explicit review without labeling it provider-pending', async () => {
    const { service, operations } = makeService();
    await service.acquireManualFile({
      originalname: 'unknown.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('Metric,Value\nExample,12.34\n', 'utf8'),
    });

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_csv',
        status: AccountingParseStatus.SKIPPED,
        resultJson: {
          inputKind: 'CSV',
          csvStructureUnrecognized: true,
          extractedText: 'Metric,Value\nExample,12.34\n',
        },
      }),
    );
  });

  it('does not fall back to generic parsing after recognized provider processing fails', async () => {
    const { service, operations, providerFinancial } = makeService();
    const nativeText =
      'Monthly Statement\nDate Jul 01-31, 2026\nSales $100.00\nNet Total $100.00';
    pdfExtraction.mockResolvedValueOnce({
      text: nativeText,
      extraction: extractAccountingText(nativeText),
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: nativeText.split('\n').map((text, index) => ({
          lineId: `p1-l${index + 1}`,
          page: 1,
          text,
          confidence: null,
          geometry: null,
        })),
      },
    });
    providerFinancial.parseForInboxSuggestion.mockRejectedValueOnce(
      new AccountingProviderFinancialProcessingError(
        'simulated provider persistence failure',
      ),
    );

    await expect(
      service.acquireManualFile({
        originalname: 'provider-statement.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
      }),
    ).resolves.toEqual(
      expect.objectContaining({ providerFinancialMatched: false }) as unknown,
    );

    expect(operations.recordInboxParseRun).not.toHaveBeenCalled();
  });

  it('quarantines untrusted email evidence without parsing it', async () => {
    const operations = {
      registerInboxArtifact: jest.fn().mockResolvedValue({
        ...registeredArtifact(
          AccountingArtifactKind.EMAIL_BODY,
          'a'.repeat(64),
        ),
        inboxItem: {
          ...registeredArtifact(
            AccountingArtifactKind.EMAIL_BODY,
            'a'.repeat(64),
          ).inboxItem,
          status: AccountingInboxStatus.QUARANTINED,
          trustDecision: AccountingInboxTrustDecision.UNTRUSTED,
        },
      }),
      recordInboxParseRun: jest.fn(),
      suggestUnifiedInboxClassification: jest.fn(),
    };
    const providerFinancial = {
      parseAndMaterialize: jest.fn().mockResolvedValue({ matched: false }),
      parseForInboxSuggestion: jest.fn().mockResolvedValue({ matched: false }),
      recordUnsupportedUberApiParse: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountingInboxAcquisitionService(
      operations as never,
      providerFinancial as never,
    );

    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-1',
        senderEmail: 'unknown@example.com',
        subject: 'Invoice',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'Invoice total $12.34',
      AccountingInboxTrustDecision.UNTRUSTED,
    );

    expect(operations.recordInboxParseRun).not.toHaveBeenCalled();
  });

  it('returns the original stored URL when the same email attachment transport is replayed', async () => {
    const originalStoredUrl = '/api/v1/accounting/files/inbox/original.pdf';
    const operations = {
      registerInboxArtifact: jest.fn().mockResolvedValue({
        ...registeredArtifact(AccountingArtifactKind.PDF, 'a'.repeat(64)),
        storedUrl: originalStoredUrl,
        replayed: true,
      }),
      recordInboxParseRun: jest.fn(),
      suggestUnifiedInboxClassification: jest.fn(),
    };
    const providerFinancial = {
      parseAndMaterialize: jest.fn().mockResolvedValue({ matched: false }),
      parseForInboxSuggestion: jest.fn().mockResolvedValue({ matched: false }),
      recordUnsupportedUberApiParse: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountingInboxAcquisitionService(
      operations as never,
      providerFinancial as never,
    );

    const result = await service.acquireEmailAttachment(
      {
        messageId: 'gmail-message-1',
        senderEmail: 'trusted@example.com',
        subject: 'Statement',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'attachment-1',
      {
        originalname: 'statement.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
      },
      AccountingInboxTrustDecision.TRUSTED,
    );

    expect(result.storedUrl).toBe(originalStoredUrl);
    const inboxDir = path.join(uploadRoot, 'accounting', 'inbox');
    expect(fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir) : []).toEqual([]);
    expect(operations.recordInboxParseRun).toHaveBeenCalled();
  });

  it('stores likely-bill recognition as an editable expense classification suggestion', async () => {
    const { service, operations } = makeService();
    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-expense',
        senderEmail: 'trusted@example.com',
        subject: 'Bell invoice',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'Invoice subtotal $75.00 HST $9.75 Total $84.75',
      AccountingInboxTrustDecision.TRUSTED,
    );

    expect(operations.suggestUnifiedInboxClassification).toHaveBeenCalledWith(
      'acctart_email_body',
      {
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        selectedProvider: null,
      },
    );
  });

  it('uses normalized body content, not Gmail message id, as content identity', async () => {
    const { service, operations } = makeService();
    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-1',
        senderEmail: 'trusted@example.com',
        subject: 'Invoice',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'Invoice total $12.34\r\n',
      AccountingInboxTrustDecision.TRUSTED,
    );
    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-2',
        senderEmail: 'trusted@example.com',
        subject: 'Invoice copy',
        receivedAt: '2026-09-12T12:05:00.000Z',
      },
      'Invoice total $12.34\n',
      AccountingInboxTrustDecision.TRUSTED,
    );

    const calls = operations.registerInboxArtifact.mock.calls as Array<
      [{ contentHash: string; transportIdentity: string }]
    >;
    expect(calls[0][0].transportIdentity).not.toBe(
      calls[1][0].transportIdentity,
    );
    expect(calls[0][0].contentHash).toBe(calls[1][0].contentHash);
  });
});
