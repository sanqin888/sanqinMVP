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
import { AccountingProviderFinancialProcessingError } from './accounting-provider-financial.service';

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
  let uploadRoot: string;

  beforeEach(() => {
    imageOcr.mockReset();
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
    };
    const providerFinancial = {
      parseAndMaterialize: jest.fn().mockResolvedValue({ matched: false }),
      parseForInboxSuggestion: jest.fn().mockResolvedValue({ matched: false }),
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

  it('sends manual PDF evidence through SourceArtifact and suggestion-only parsing', async () => {
    const { service, operations, providerFinancial } = makeService();
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
