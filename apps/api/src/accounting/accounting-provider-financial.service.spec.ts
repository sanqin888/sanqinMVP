import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingParseStatus,
} from '@prisma/client';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';

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
