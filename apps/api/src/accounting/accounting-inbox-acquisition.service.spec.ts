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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AccountingArtifactKind,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';
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
  let uploadRoot: string;

  beforeEach(() => {
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

  it('keeps Provider API CSV evidence on the existing automatic materialization path', async () => {
    const { service, providerFinancial } = makeService();
    providerFinancial.parseAndMaterialize.mockResolvedValueOnce({ matched: true });

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

  it('preserves CSV evidence but leaves it for provider-specific parsing', async () => {
    const { service, operations } = makeService();
    await service.acquireManualFile({
      originalname: 'statement.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('date,total\n2026-06-01,12.34\n', 'utf8'),
    });

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_csv',
        status: AccountingParseStatus.SKIPPED,
        resultJson: {
          inputKind: 'CSV',
          providerParserPending: true,
          extractedText: 'date,total\n2026-06-01,12.34\n',
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
