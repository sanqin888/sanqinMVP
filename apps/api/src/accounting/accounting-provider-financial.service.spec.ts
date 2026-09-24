import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingParseStatus,
} from '@prisma/client';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';
import { DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES } from './accounting-provider-recognition.policy';

describe('AccountingProviderFinancialService', () => {
  const mayCloverStatement = `
MERCHANT CARD PROCESSING STATEMENT LOCATION RECAP
StatementPeriod 05/01/26 - 05/31/26
MerchantNumber 29351880018
LOCATION
SUMMARY
Total Amount Submitted 2,880.92
Third-Party Transactions 0.00
Adjustments 0.00
Interchange Charges 0.00
Service Charges -55.50
Fees -35.15
Chargebacks/Reversals 0.00
Total Amount Funded 2,790.27
All amounts shown are in CAD funds
`;

  it('treats manual/email provider recognition as a review suggestion without materializing it', async () => {
    const operations = {
      listProviderRecognitionRules: jest
        .fn()
        .mockResolvedValue(DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES),
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      suggestUnifiedInboxClassification: jest.fn().mockResolvedValue({}),
      recordProviderFinancialDocument: jest.fn(),
      ensureProviderFinancialCoverage: jest.fn(),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn(),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    const result = await service.parseForInboxSuggestion({
      artifactStableId: 'acctart_uber_aug',
      text: `
Monthly Statement
Statement Number #3F0FE63E
Date Aug 01-31, 2026
Consolidated Monthly Summary
Sales (106 Orders) $3,300.67
Marketplace Fees -$767.88
Net Total $2,021.83
`,
    });

    expect(result).toEqual(
      expect.objectContaining({
        matched: true,
        materialized: false,
        provider: AccountingFinancialProvider.UBER_EATS,
      }) as unknown,
    );
    expect(operations.suggestUnifiedInboxClassification).toHaveBeenCalledWith(
      'acctart_uber_aug',
      {
        classification: 'PROVIDER_FINANCIAL_DOCUMENT',
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
      },
    );
    expect(operations.recordProviderFinancialDocument).not.toHaveBeenCalled();
    expect(storeConfig.getConfiguredStoreSnapshot).not.toHaveBeenCalled();
  });

  it('persists scanned-PDF OCR evidence with recognized provider parse runs', async () => {
    const operations = {
      listProviderRecognitionRules: jest
        .fn()
        .mockResolvedValue(DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES),
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      suggestUnifiedInboxClassification: jest.fn().mockResolvedValue({}),
      recordProviderFinancialDocument: jest.fn(),
      ensureProviderFinancialCoverage: jest.fn(),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      { getConfiguredStoreSnapshot: jest.fn() } as never,
      {} as never,
    );
    const text = [
      'Monthly Statement',
      'Statement Number #SCANNED-1',
      'Date Aug 01-31, 2026',
      'Consolidated Monthly Summary',
      'Sales (106 Orders) $3,300.67',
      'Marketplace Fees -$767.88',
      'Net Total $2,021.83',
    ].join('\n');
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
    const pdfOcrEvidence = {
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
    };

    await expect(
      service.parseForInboxSuggestion({
        artifactStableId: 'acctart_scanned_uber',
        text,
        documentExtraction: {
          version: 1,
          inputKind: 'PDF',
          engine: 'AWS_TEXTRACT',
          layoutMode: 'GEOMETRY',
          truncated: false,
          lines,
        },
        pdfNativeTextUsability: {
          disposition: 'SCAN_CANDIDATE',
          reason: 'NO_NATIVE_TEXT',
          metrics: {
            characterCount: 0,
            meaningfulCharacterCount: 0,
            meaningfulTokenCount: 0,
            meaningfulLineCount: 0,
            hanCharacterCount: 0,
            suspiciousCharacterCount: 0,
            suspiciousCharacterRatio: 0,
            extractionLineCount: 0,
            geometryLineCount: 0,
          },
        },
        pdfOcrEvidence,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        matched: true,
        parserValidated: true,
        provider: AccountingFinancialProvider.UBER_EATS,
      }) as unknown,
    );

    expect(operations.recordInboxParseRun).toHaveBeenCalledTimes(2);
    expect(operations.recordInboxParseRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resultJson: expect.objectContaining({ pdfOcrEvidence }) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resultJson: expect.objectContaining({ pdfOcrEvidence }) as unknown,
      }),
    );
  });

  it('keeps a recognition suggestion even when provider field parsing is incomplete', async () => {
    const operations = {
      listProviderRecognitionRules: jest
        .fn()
        .mockResolvedValue(DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES),
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      suggestUnifiedInboxClassification: jest.fn().mockResolvedValue({}),
    };
    const storeConfig = { getConfiguredStoreSnapshot: jest.fn() };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    const documentExtraction = {
      version: 1 as const,
      inputKind: 'PDF' as const,
      engine: 'POPPLER' as const,
      layoutMode: 'GEOMETRY' as const,
      truncated: false,
      lines: [
        {
          lineId: 'p1-l1',
          page: 1,
          text: 'Marketplace Fees',
          confidence: null,
          geometry: { left: 0.1, top: 0.4, width: 0.2, height: 0.02 },
        },
      ],
    };
    await expect(
      service.parseForInboxSuggestion({
        artifactStableId: 'acctart_uber_partial',
        text: `
Monthly Statement
Consolidated Monthly Summary
Marketplace Fees
Net Total
`,
        documentExtraction,
        pdfNativeTextUsability: {
          disposition: 'USABLE_NATIVE_TEXT',
          reason: 'NATIVE_TEXT_USABLE',
          metrics: {
            characterCount: 64,
            meaningfulCharacterCount: 52,
            meaningfulTokenCount: 8,
            meaningfulLineCount: 4,
            hanCharacterCount: 0,
            suspiciousCharacterCount: 0,
            suspiciousCharacterRatio: 0,
            extractionLineCount: 1,
            geometryLineCount: 1,
          },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        matched: true,
        parserValidated: false,
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
      }) as unknown,
    );
    expect(operations.suggestUnifiedInboxClassification).toHaveBeenCalledWith(
      'acctart_uber_partial',
      {
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
      },
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultJson: expect.objectContaining({
          providerRecognition: true,
          documentExtraction,
          pdfNativeTextUsability: expect.objectContaining({
            disposition: 'USABLE_NATIVE_TEXT',
            reason: 'NATIVE_TEXT_USABLE',
          }) as unknown,
        }) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledTimes(1);
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parserName: 'accounting-provider-recognition',
        resultJson: expect.objectContaining({
          providerRecognition: true,
          provider: AccountingFinancialProvider.UBER_EATS,
        }) as unknown,
      }) as unknown,
    );
  });

  it('recognizes but does not materialize provider evidence wholly before 2026-06-01', async () => {
    const operations = {
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      recordProviderFinancialDocument: jest.fn(),
      ensureProviderFinancialCoverage: jest.fn(),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn(),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    await expect(
      service.parseAndMaterialize({
        artifactStableId: 'acctart_may',
        text: mayCloverStatement,
        providerHint: AccountingFinancialProvider.CLOVER,
        documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        matched: true,
        materialized: false,
        excludedBeforeFinancialHistory: true,
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
      }) as unknown,
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AccountingParseStatus.SKIPPED,
        resultJson: expect.objectContaining({
          excludedBeforeFinancialHistory: true,
          financialHistoryRequiredFrom: '2026-06-01',
        }) as unknown,
      }),
    );
    expect(storeConfig.getConfiguredStoreSnapshot).not.toHaveBeenCalled();
    expect(operations.recordProviderFinancialDocument).not.toHaveBeenCalled();
  });

  it('records provider parser ERROR and preserves provider identity when materialization fails', async () => {
    const operations = {
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      recordProviderFinancialDocument: jest
        .fn()
        .mockRejectedValue(
          new Error('simulated financial document write failure'),
        ),
      ensureProviderFinancialCoverage: jest.fn(),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
      }),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    await expect(
      service.parseAndMaterialize({
        artifactStableId: 'acctart_failed',
        providerHint: AccountingFinancialProvider.FANTUAN,
        documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
        text: `
Name: SANQIN RESTAURANT/ 15112320 CANADA INC.
Restaurant: Qin's Traditional Roujiamo | VIP 25% OFF(YG)
Total Transfer Amount: $3813.11
From: 2026-08-01 to 2026-08-31
Summary
Sales $5220.77
Item Subtotal $5220.77
Marketing and Fantuan Event Charges -$1870.30
Discounts from Promotion events -$1185.71
Fantuan Subsidy for Promotion events $1113.41
Commission -$1798.00
Adjustment $26.94
Net Taxes $435.70
Net Sales GST/HST $669.35
Commission GST/HST -$233.65
Total transfer amount $3813.11
`,
      }),
    ).rejects.toThrow('simulated financial document write failure');

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AccountingParseStatus.ERROR,
        resultJson: expect.objectContaining({
          providerFinancial: true,
          provider: AccountingFinancialProvider.FANTUAN,
          processingError: true,
        }) as unknown,
      }),
    );
    expect(operations.ensureProviderFinancialCoverage).not.toHaveBeenCalled();
  });

  it('rechecks provider coverage before confirming an already-materialized statement', async () => {
    const operations = {
      readUnifiedInboxProviderReviewContext: jest.fn().mockResolvedValue({
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityStableId: 'acctfindoc_existing',
        artifact: {
          artifactStableId: 'acctart_existing',
          acquisitionMode: 'MANUAL_UPLOAD',
          bodyText: null,
          emailSubject: null,
          financialDocument: {
            documentStableId: 'acctfindoc_existing',
            provider: AccountingFinancialProvider.UBER_EATS,
            documentType: AccountingFinancialDocumentType.STATEMENT,
            revision: 1,
          },
          parseRuns: [],
        },
      }),
      ensureProviderFinancialCoverage: jest.fn().mockResolvedValue({}),
      confirmProviderFinancialInboxItem: jest.fn().mockResolvedValue({
        confirmed: true,
        documentStableId: 'acctfindoc_existing',
      }),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
      }),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    await service.confirmSelectedInboxFinancialEvidence(
      'acctinbox_existing',
      'user_operator_1',
    );

    expect(operations.ensureProviderFinancialCoverage).toHaveBeenCalledWith(
      AccountingFinancialProvider.UBER_EATS,
      '4750_Yonge_Street',
    );
    expect(operations.confirmProviderFinancialInboxItem).toHaveBeenCalledWith(
      'acctinbox_existing',
      'user_operator_1',
    );
  });

  it('materializes a manually selected statement provider only when the operator confirms it', async () => {
    const fantuanText = `
From: 2026-08-01 to 2026-08-31
Sales $5220.77
Commission -$1798.00
Total transfer amount $3813.11
`;
    const operations = {
      readUnifiedInboxProviderReviewContext: jest.fn().mockResolvedValue({
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.FANTUAN,
        materializedEntityType: null,
        materializedEntityStableId: null,
        artifact: {
          artifactStableId: 'acctart_manual_fantuan',
          acquisitionMode: 'MANUAL_UPLOAD',
          bodyText: null,
          emailSubject: null,
          financialDocument: null,
          parseRuns: [
            {
              parserName: 'accounting-generic-document-review',
              parserVersion: '1',
              status: AccountingParseStatus.SUCCESS,
              resultJson: { extractedText: fantuanText },
            },
          ],
        },
      }),
      recordProviderFinancialDocument: jest.fn().mockResolvedValue({
        documentStableId: 'acctfindoc_manual_1',
        revision: 1,
        replayed: false,
      }),
      ensureProviderFinancialCoverage: jest.fn().mockResolvedValue({}),
      confirmProviderFinancialInboxItem: jest.fn().mockResolvedValue({
        confirmed: true,
        documentStableId: 'acctfindoc_manual_1',
      }),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
      }),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    await expect(
      service.confirmSelectedInboxFinancialEvidence(
        'acctinbox_manual_fantuan',
        'user_operator_1',
      ),
    ).resolves.toEqual({
      confirmed: true,
      documentStableId: 'acctfindoc_manual_1',
    });
    expect(operations.recordProviderFinancialDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_manual_fantuan',
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    );
    expect(operations.confirmProviderFinancialInboxItem).toHaveBeenCalledWith(
      'acctinbox_manual_fantuan',
      'user_operator_1',
    );
  });

  it('reuses persisted layout extraction when confirmation materializes provider evidence', async () => {
    const flattened = `
Monthly Statement
Statement Number #B4842290
Date Jul 01-31, 2026
Sales (84 Orders)
Tax on Sales

$2,603.36
$338.48
Total Earnings $2,941.84
Net Total $1,431.94*
`;
    const documentExtraction = {
      version: 1 as const,
      inputKind: 'PDF' as const,
      engine: 'POPPLER' as const,
      layoutMode: 'GEOMETRY' as const,
      truncated: false,
      lines: [
        {
          lineId: 'p1-l1',
          page: 1,
          text: 'Sales (84 Orders)',
          confidence: null,
          geometry: { left: 0.1, top: 0.3, width: 0.25, height: 0.02 },
        },
        {
          lineId: 'p1-l2',
          page: 1,
          text: '$2,603.36',
          confidence: null,
          geometry: { left: 0.75, top: 0.3, width: 0.15, height: 0.02 },
        },
        {
          lineId: 'p1-l3',
          page: 1,
          text: 'Tax on Sales',
          confidence: null,
          geometry: { left: 0.1, top: 0.33, width: 0.2, height: 0.02 },
        },
        {
          lineId: 'p1-l4',
          page: 1,
          text: '$338.48',
          confidence: null,
          geometry: { left: 0.75, top: 0.33, width: 0.12, height: 0.02 },
        },
      ],
    };
    const operations = {
      readUnifiedInboxProviderReviewContext: jest.fn().mockResolvedValue({
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
        materializedEntityType: null,
        materializedEntityStableId: null,
        artifact: {
          artifactStableId: 'acctart_uber_july_layout',
          acquisitionMode: 'MANUAL_UPLOAD',
          bodyText: null,
          emailSubject: null,
          financialDocument: null,
          parseRuns: [
            {
              parserName: 'accounting-provider-recognition',
              parserVersion: '1',
              status: AccountingParseStatus.SUCCESS,
              resultJson: {
                extractedText: flattened,
                documentExtraction,
              },
            },
          ],
        },
      }),
      recordProviderFinancialDocument: jest.fn().mockResolvedValue({
        documentStableId: 'acctfindoc_uber_july_layout',
        revision: 1,
        replayed: false,
      }),
      ensureProviderFinancialCoverage: jest.fn().mockResolvedValue({}),
      confirmProviderFinancialInboxItem: jest.fn().mockResolvedValue({
        confirmed: true,
        documentStableId: 'acctfindoc_uber_july_layout',
      }),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
      }),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    await service.confirmSelectedInboxFinancialEvidence(
      'acctinbox_uber_july_layout',
      'user_operator_1',
    );

    expect(operations.recordProviderFinancialDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        providerDocumentRef: 'B4842290',
        parserVersion: '6',
        lines: expect.arrayContaining([
          expect.objectContaining({
            rawName: 'Sales',
            amountCents: 260336,
          }),
          expect.objectContaining({
            rawName: 'Tax on Sales',
            amountCents: 33848,
            rawPayload: expect.objectContaining({
              extractionEvidence: expect.objectContaining({
                strategy: 'LAYOUT_ROW_PAIR',
              }) as unknown,
            }) as unknown,
          }),
        ]) as unknown,
      }),
    );
  });

  it('does not let manual provider confirmation bypass a non-usable native PDF decision', async () => {
    const operations = {
      readUnifiedInboxProviderReviewContext: jest.fn().mockResolvedValue({
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
        materializedEntityType: null,
        materializedEntityStableId: null,
        artifact: {
          artifactStableId: 'acctart_weak_native_pdf',
          acquisitionMode: 'MANUAL_UPLOAD',
          bodyText: null,
          emailSubject: null,
          financialDocument: null,
          parseRuns: [
            {
              parserName: 'accounting-generic-document-review',
              parserVersion: '5',
              status: AccountingParseStatus.SUCCESS,
              resultJson: {
                extractedText: 'Page 1',
                textRecognitionEngine: 'POPPLER',
                pdfNativeTextUsability: {
                  disposition: 'SCAN_CANDIDATE',
                  reason: 'INSUFFICIENT_NATIVE_TEXT',
                  metrics: {
                    characterCount: 6,
                    meaningfulCharacterCount: 5,
                    meaningfulTokenCount: 1,
                    meaningfulLineCount: 1,
                    hanCharacterCount: 0,
                    suspiciousCharacterCount: 0,
                    suspiciousCharacterRatio: 0,
                    extractionLineCount: 1,
                    geometryLineCount: 0,
                  },
                },
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
                      text: 'Page 1',
                      confidence: null,
                      geometry: null,
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
      recordProviderFinancialDocument: jest.fn(),
      ensureProviderFinancialCoverage: jest.fn(),
      confirmProviderFinancialInboxItem: jest.fn(),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
      }),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    await expect(
      service.confirmSelectedInboxFinancialEvidence(
        'acctinbox_weak_native_pdf',
        'user_operator_1',
      ),
    ).rejects.toThrow(
      'provider PDF native text is not usable; scanned-PDF OCR routing must complete before confirmation',
    );
    expect(operations.recordProviderFinancialDocument).not.toHaveBeenCalled();
    expect(operations.confirmProviderFinancialInboxItem).not.toHaveBeenCalled();
  });

  it('fails closed when persisted document extraction evidence is malformed', async () => {
    const operations = {
      readUnifiedInboxProviderReviewContext: jest.fn().mockResolvedValue({
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
        materializedEntityType: null,
        materializedEntityStableId: null,
        artifact: {
          artifactStableId: 'acctart_invalid_layout',
          acquisitionMode: 'MANUAL_UPLOAD',
          bodyText: null,
          emailSubject: null,
          financialDocument: null,
          parseRuns: [
            {
              parserName: 'accounting-provider-recognition',
              parserVersion: '1',
              status: AccountingParseStatus.SUCCESS,
              resultJson: {
                extractedText: `
Monthly Statement
Statement Number #INVALID-LAYOUT
Date Jul 01-31, 2026
Sales (1 Orders) $10.00
Net Total $10.00
`,
                documentExtraction: {
                  version: 1,
                  inputKind: 'PDF',
                  engine: 'POPPLER',
                  layoutMode: 'GEOMETRY',
                  truncated: false,
                  lines: [
                    {
                      lineId: 'p1-l1',
                      page: 1,
                      text: 'Sales (1 Orders)',
                      confidence: null,
                      geometry: null,
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
      recordProviderFinancialDocument: jest.fn(),
      ensureProviderFinancialCoverage: jest.fn(),
      confirmProviderFinancialInboxItem: jest.fn(),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      {
        getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
          storeStableId: '4750_Yonge_Street',
        }),
      } as never,
      {} as never,
    );

    await expect(
      service.confirmSelectedInboxFinancialEvidence(
        'acctinbox_invalid_layout',
        'user_operator_1',
      ),
    ).rejects.toThrow(
      'provider document extraction evidence is invalid; reprocess the source artifact before confirmation',
    );
    expect(operations.recordProviderFinancialDocument).not.toHaveBeenCalled();
    expect(operations.confirmProviderFinancialInboxItem).not.toHaveBeenCalled();
  });

  it('materializes recognized provider evidence on or after the financial-history boundary', async () => {
    const operations = {
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
      recordProviderFinancialDocument: jest.fn().mockResolvedValue({
        documentStableId: 'acctfindoc_1',
        revision: 1,
        replayed: false,
      }),
      ensureProviderFinancialCoverage: jest.fn().mockResolvedValue({}),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
      }),
    };
    const service = new AccountingProviderFinancialService(
      operations as never,
      storeConfig as never,
      {} as never,
    );

    const result = await service.parseAndMaterialize({
      artifactStableId: 'acctart_aug',
      providerHint: AccountingFinancialProvider.FANTUAN,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
Name: SANQIN RESTAURANT/ 15112320 CANADA INC.
Restaurant: Qin's Traditional Roujiamo | VIP 25% OFF(YG)
Total Transfer Amount: $3813.11
From: 2026-08-01 to 2026-08-31
Summary
Sales $5220.77
Item Subtotal $5220.77
Marketing and Fantuan Event Charges -$1870.30
Discounts from Promotion events -$1185.71
Fantuan Subsidy for Promotion events $1113.41
Commission -$1798.00
Adjustment $26.94
Net Taxes $435.70
Net Sales GST/HST $669.35
Commission GST/HST -$233.65
Total transfer amount $3813.11
`,
    });

    expect(result).toEqual(
      expect.objectContaining({
        matched: true,
        materialized: true,
        documentStableId: 'acctfindoc_1',
        provider: AccountingFinancialProvider.FANTUAN,
      }),
    );
    expect(operations.recordProviderFinancialDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        storeStableId: '4750_Yonge_Street',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        parserName: 'accounting-provider-financial',
        parserVersion: '6',
      }),
    );
    expect(operations.ensureProviderFinancialCoverage).toHaveBeenCalledWith(
      AccountingFinancialProvider.FANTUAN,
      '4750_Yonge_Street',
    );
  });
});
