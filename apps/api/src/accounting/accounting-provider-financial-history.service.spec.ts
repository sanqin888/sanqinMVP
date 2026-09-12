import { AccountingFinancialProvider } from '@prisma/client';
import { AccountingProviderFinancialHistoryService } from './accounting-provider-financial-history.service';

describe('AccountingProviderFinancialHistoryService', () => {
  it('imports READY financial artifacts from the configured start and skips order-detail history', async () => {
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      listFinancialReports: jest.fn().mockResolvedValue([
        {
          reportStableId: 'finance-1',
          workflowId: 'workflow-finance',
          reportType: 'FINANCE_SUMMARY_REPORT',
          startDate: '2026-05-28',
          endDate: '2026-06-03',
          status: 'READY',
          artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
        },
        {
          reportStableId: 'orders-1',
          workflowId: 'workflow-orders',
          reportType: 'ORDERS_AND_ITEMS_REPORT',
          startDate: '2026-06-01',
          endDate: '2026-06-03',
          status: 'READY',
          artifactUrls: ['/api/v1/accounting/files/uber-reports/orders.csv'],
        },
      ]),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'Metric,Amount\nMarketplace Fees,-12.34',
        contentHash: 'a'.repeat(64),
        byteSize: 36,
        fileName: 'finance.csv',
      }),
      markFinancialReportImported: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual({
      scannedReports: 1,
      importedReports: 1,
      importedArtifacts: 1,
      deferredArtifacts: 0,
      skippedBeforeStartDate: 0,
      skippedOrderDetailReports: 1,
    });
    expect(acquisition.acquireProviderApiCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        reportType: 'FINANCE_SUMMARY_REPORT',
        periodStart: '2026-05-28',
        periodEnd: '2026-06-03',
        providerDocumentRef: 'finance-1:1',
        metadataJson: expect.objectContaining({
          accountingStartDate: '2026-06-01',
          crossesAccountingStartBoundary: true,
        }) as unknown,
      }),
    );
    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledTimes(1);
    expect(uberReporting.markFinancialReportImported).toHaveBeenCalledWith(
      'finance-1',
    );
  });

  it('keeps a READY report retryable when a provider artifact cannot yet be normalized', async () => {
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: false,
      }),
    };
    const uberReporting = {
      listFinancialReports: jest.fn().mockResolvedValue([
        {
          reportStableId: 'finance-2',
          workflowId: 'workflow-finance-2',
          reportType: 'PAYMENT_DETAILS_REPORT',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          status: 'READY',
          artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
        },
      ]),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'Unknown,Amount\nSomething,1.00',
        contentHash: 'b'.repeat(64),
        byteSize: 29,
        fileName: 'payment.csv',
      }),
      markFinancialReportImported: jest.fn(),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        importedReports: 0,
        deferredArtifacts: 1,
      }) as unknown,
    );
    expect(uberReporting.markFinancialReportImported).not.toHaveBeenCalled();
  });

  it('uses 2026-06-01 as the hard historical floor even if UI start is earlier', async () => {
    const acquisition = { acquireProviderApiCsv: jest.fn() };
    const uberReporting = {
      listFinancialReports: jest.fn().mockResolvedValue([
        {
          reportStableId: 'may-1',
          workflowId: 'may-workflow',
          reportType: 'FINANCE_SUMMARY_REPORT',
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          status: 'READY',
          artifactUrls: ['/api/v1/accounting/files/uber-reports/may.csv'],
        },
      ]),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
    );

    await expect(service.syncReadyUberReports('2026-01-01')).resolves.toEqual(
      expect.objectContaining({ skippedBeforeStartDate: 1 }) as unknown,
    );
    expect(acquisition.acquireProviderApiCsv).not.toHaveBeenCalled();
  });
});
