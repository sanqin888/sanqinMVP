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
    );

    await expect(
      service.parseForInboxSuggestion({
        artifactStableId: 'acctart_uber_partial',
        text: `
Monthly Statement
Consolidated Monthly Summary
Marketplace Fees
Net Total
`,
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
      }),
    );
    expect(operations.ensureProviderFinancialCoverage).toHaveBeenCalledWith(
      AccountingFinancialProvider.FANTUAN,
      '4750_Yonge_Street',
    );
  });
});
