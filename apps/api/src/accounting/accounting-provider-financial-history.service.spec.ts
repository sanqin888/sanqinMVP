import { AccountingFinancialProvider } from '@prisma/client';
import { AccountingProviderFinancialHistoryService } from './accounting-provider-financial-history.service';

type ReportRow = {
  reportStableId: string;
  workflowId: string;
  reportType: string;
  providerReportType: string | null;
  startDate: string;
  endDate: string;
  status: 'READY' | 'IMPORTED';
  artifactUrls: string[];
};

const matchedReconciliation = {
  status: 'MATCHED' as const,
  issues: [],
};

const listReports = (ready: ReportRow[]) =>
  jest.fn().mockResolvedValue(ready);

const findCandidates = (ready: ReportRow[], imported: ReportRow[] = []) =>
  jest
    .fn()
    .mockImplementation((input: { anchorReportStableId: string }) => {
      const reports = [...ready, ...imported];
      const anchor = reports.find(
        (report) => report.reportStableId === input.anchorReportStableId,
      );
      if (!anchor) return Promise.resolve([]);
      return Promise.resolve(
        reports.filter(
          (report) =>
            report.startDate === anchor.startDate &&
            report.endDate === anchor.endDate &&
            report.reportType !== 'ORDERS_AND_ITEMS_REPORT',
        ),
      );
    });

describe('AccountingProviderFinancialHistoryService', () => {
  it('does not scan or import Uber reports before financial authority is promoted', async () => {
    const acquisition = { acquireProviderApiCsv: jest.fn() };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(false),
      listFinancialReports: jest.fn(),
      findFinancialReportReconciliationCandidates: jest.fn(),
      readFinancialReportArtifact: jest.fn(),
      markFinancialReportImported: jest.fn(),
    };
    const reconciliation = { reconcileReportPair: jest.fn() };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual({
      scannedReports: 0,
      importedReports: 0,
      importedArtifacts: 0,
      deferredArtifacts: 0,
      skippedBeforeStartDate: 0,
      skippedOrderDetailReports: 0,
      reconciledReportPairs: 0,
      deferredReconciliationGroups: 0,
    });
    expect(uberReporting.listFinancialReports).not.toHaveBeenCalled();
    expect(
      uberReporting.findFinancialReportReconciliationCandidates,
    ).not.toHaveBeenCalled();
    expect(acquisition.acquireProviderApiCsv).not.toHaveBeenCalled();
    expect(reconciliation.reconcileReportPair).not.toHaveBeenCalled();
  });

  it('imports a READY Payment Details / Payout Summary pair only after controls reconcile', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-1',
        workflowId: 'workflow-payment',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-05-28',
        endDate: '2026-06-03',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
      {
        reportStableId: 'finance-1',
        workflowId: 'workflow-finance',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-05-28',
        endDate: '2026-06-03',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
      },
      {
        reportStableId: 'orders-1',
        workflowId: 'workflow-orders',
        reportType: 'ORDERS_AND_ITEMS_REPORT',
        providerReportType: null,
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/orders.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(ready),
      readFinancialReportArtifact: jest
        .fn()
        .mockImplementation((input: { reportStableId: string }) =>
          Promise.resolve({
            content: 'provider csv',
            contentHash: 'a'.repeat(64),
            byteSize: 12,
            fileName:
              input.reportStableId === 'payment-1'
                ? 'payment.csv'
                : 'finance.csv',
          }),
        ),
      markFinancialReportImported: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliation = {
      reconcileReportPair: jest.fn().mockResolvedValue(matchedReconciliation),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual({
      scannedReports: 2,
      importedReports: 2,
      importedArtifacts: 2,
      deferredArtifacts: 0,
      skippedBeforeStartDate: 0,
      skippedOrderDetailReports: 1,
      reconciledReportPairs: 1,
      deferredReconciliationGroups: 0,
    });

    expect(acquisition.acquireProviderApiCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        periodStart: '2026-05-28',
        periodEnd: '2026-06-03',
        providerDocumentRef: 'finance-1:1',
        metadataJson: expect.objectContaining({
          accountingStartDate: '2026-06-01',
          crossesAccountingStartBoundary: true,
        }) as unknown,
      }),
    );
    expect(reconciliation.reconcileReportPair).toHaveBeenCalledWith({
      paymentDetailsReportStableId: 'payment-1',
      payoutSummaryReportStableId: 'finance-1',
      periodStart: '2026-05-28',
      periodEnd: '2026-06-03',
    });
    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledTimes(2);
    expect(uberReporting.markFinancialReportImported).toHaveBeenCalledTimes(2);
  });

  it('keeps both reports READY when cross-report payout controls do not reconcile', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-2',
        workflowId: 'workflow-payment-2',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
      {
        reportStableId: 'finance-2',
        workflowId: 'workflow-finance-2',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(ready),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'provider csv',
        contentHash: 'b'.repeat(64),
        byteSize: 12,
        fileName: 'report.csv',
      }),
      markFinancialReportImported: jest.fn(),
    };
    const reconciliation = {
      reconcileReportPair: jest.fn().mockResolvedValue({
        status: 'MISMATCH',
        issues: ['REPORT_TOTAL_PAYOUT_MISMATCH'],
      }),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        importedReports: 0,
        importedArtifacts: 2,
        reconciledReportPairs: 0,
        deferredReconciliationGroups: 1,
      }) as unknown,
    );
    expect(uberReporting.markFinancialReportImported).not.toHaveBeenCalled();
  });

  it('recovers a partially imported pair by using the IMPORTED partner as reconciliation evidence', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-retry',
        workflowId: 'workflow-payment-retry',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
    ];
    const imported: ReportRow[] = [
      {
        reportStableId: 'finance-imported',
        workflowId: 'workflow-finance-imported',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'IMPORTED',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(
        ready,
        imported,
      ),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'provider csv',
        contentHash: 'c'.repeat(64),
        byteSize: 12,
        fileName: 'payment.csv',
      }),
      markFinancialReportImported: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliation = {
      reconcileReportPair: jest.fn().mockResolvedValue(matchedReconciliation),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        scannedReports: 1,
        importedArtifacts: 1,
        importedReports: 1,
        reconciledReportPairs: 1,
        deferredReconciliationGroups: 0,
      }) as unknown,
    );
    expect(reconciliation.reconcileReportPair).toHaveBeenCalledWith({
      paymentDetailsReportStableId: 'payment-retry',
      payoutSummaryReportStableId: 'finance-imported',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-25',
    });
    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledTimes(1);
    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledWith({
      reportStableId: 'payment-retry',
      artifactUrl: '/api/v1/accounting/files/uber-reports/payment.csv',
    });
    expect(uberReporting.markFinancialReportImported).toHaveBeenCalledTimes(1);
    expect(uberReporting.markFinancialReportImported).toHaveBeenCalledWith(
      'payment-retry',
    );
  });

  it('recovers when the payment report is already IMPORTED and the payout summary remains READY', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'finance-retry',
        workflowId: 'workflow-finance-retry',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
      },
    ];
    const imported: ReportRow[] = [
      {
        reportStableId: 'payment-imported',
        workflowId: 'workflow-payment-imported',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'IMPORTED',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(
        ready,
        imported,
      ),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'provider csv',
        contentHash: 'f'.repeat(64),
        byteSize: 12,
        fileName: 'finance.csv',
      }),
      markFinancialReportImported: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliation = {
      reconcileReportPair: jest.fn().mockResolvedValue(matchedReconciliation),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        scannedReports: 1,
        importedArtifacts: 1,
        importedReports: 1,
        reconciledReportPairs: 1,
        deferredReconciliationGroups: 0,
      }) as unknown,
    );
    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledTimes(1);
    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledWith({
      reportStableId: 'finance-retry',
      artifactUrl: '/api/v1/accounting/files/uber-reports/finance.csv',
    });
    expect(uberReporting.markFinancialReportImported).toHaveBeenCalledWith(
      'finance-retry',
    );
  });

  it('finds an exact IMPORTED partner even when more than 200 unrelated imported reports exist', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-current',
        workflowId: 'workflow-payment-current',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
    ];
    const importedHistory: ReportRow[] = [
      ...Array.from({ length: 250 }, (_, index) => ({
        reportStableId: `historical-${index}`,
        workflowId: `workflow-historical-${index}`,
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'IMPORTED' as const,
        artifactUrls: [
          `/api/v1/accounting/files/uber-reports/historical-${index}.csv`,
        ],
      })),
      {
        reportStableId: 'finance-exact-imported',
        workflowId: 'workflow-finance-exact-imported',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'IMPORTED',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(
        ready,
        importedHistory,
      ),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'provider csv',
        contentHash: '1'.repeat(64),
        byteSize: 12,
        fileName: 'payment.csv',
      }),
      markFinancialReportImported: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliation = {
      reconcileReportPair: jest.fn().mockResolvedValue(matchedReconciliation),
    };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        importedReports: 1,
        reconciledReportPairs: 1,
        deferredReconciliationGroups: 0,
      }) as unknown,
    );
    expect(uberReporting.listFinancialReports).toHaveBeenCalledTimes(1);
    expect(uberReporting.listFinancialReports).toHaveBeenCalledWith({
      status: 'READY',
      limit: 200,
    });
    expect(reconciliation.reconcileReportPair).toHaveBeenCalledWith({
      paymentDetailsReportStableId: 'payment-current',
      payoutSummaryReportStableId: 'finance-exact-imported',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-25',
    });
  });

  it('fails closed when exact reconciliation candidates contain duplicate report types', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-duplicate-a',
        workflowId: 'workflow-payment-duplicate-a',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment-a.csv'],
      },
      {
        reportStableId: 'payment-duplicate-b',
        workflowId: 'workflow-payment-duplicate-b',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment-b.csv'],
      },
      {
        reportStableId: 'finance-duplicate-period',
        workflowId: 'workflow-finance-duplicate-period',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/finance.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(ready),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'provider csv',
        contentHash: '2'.repeat(64),
        byteSize: 12,
        fileName: 'report.csv',
      }),
      markFinancialReportImported: jest.fn(),
    };
    const reconciliation = { reconcileReportPair: jest.fn() };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        scannedReports: 3,
        importedArtifacts: 3,
        importedReports: 0,
        reconciledReportPairs: 0,
        deferredReconciliationGroups: 1,
      }) as unknown,
    );
    expect(reconciliation.reconcileReportPair).not.toHaveBeenCalled();
    expect(uberReporting.markFinancialReportImported).not.toHaveBeenCalled();
  });

  it('keeps a READY report retryable when a provider artifact cannot yet be normalized', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-3',
        workflowId: 'workflow-payment-3',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: false,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(ready),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'Unknown,Amount\nSomething,1.00',
        contentHash: 'd'.repeat(64),
        byteSize: 29,
        fileName: 'payment.csv',
      }),
      markFinancialReportImported: jest.fn(),
    };
    const reconciliation = { reconcileReportPair: jest.fn() };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        importedReports: 0,
        deferredArtifacts: 1,
        deferredReconciliationGroups: 1,
      }) as unknown,
    );
    expect(reconciliation.reconcileReportPair).not.toHaveBeenCalled();
    expect(uberReporting.markFinancialReportImported).not.toHaveBeenCalled();
  });

  it('keeps a lone financial report READY until its reconciliation partner exists', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'payment-only',
        workflowId: 'workflow-payment-only',
        reportType: 'PAYMENT_DETAILS_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/payment.csv'],
      },
    ];
    const acquisition = {
      acquireProviderApiCsv: jest.fn().mockResolvedValue({
        providerFinancialMatched: true,
      }),
    };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(ready),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'provider csv',
        contentHash: 'e'.repeat(64),
        byteSize: 12,
        fileName: 'payment.csv',
      }),
      markFinancialReportImported: jest.fn(),
    };
    const reconciliation = { reconcileReportPair: jest.fn() };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-06-01')).resolves.toEqual(
      expect.objectContaining({
        importedReports: 0,
        importedArtifacts: 1,
        deferredReconciliationGroups: 1,
      }) as unknown,
    );
    expect(reconciliation.reconcileReportPair).not.toHaveBeenCalled();
    expect(uberReporting.markFinancialReportImported).not.toHaveBeenCalled();
  });

  it('uses 2026-06-01 as the hard historical floor even if UI start is earlier', async () => {
    const ready: ReportRow[] = [
      {
        reportStableId: 'may-1',
        workflowId: 'may-workflow',
        reportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/may.csv'],
      },
    ];
    const acquisition = { acquireProviderApiCsv: jest.fn() };
    const uberReporting = {
      isFinancialAuthorityEnabled: jest.fn().mockReturnValue(true),
      listFinancialReports: listReports(ready),
      findFinancialReportReconciliationCandidates: findCandidates(ready),
      readFinancialReportArtifact: jest.fn(),
      markFinancialReportImported: jest.fn(),
    };
    const reconciliation = { reconcileReportPair: jest.fn() };
    const service = new AccountingProviderFinancialHistoryService(
      acquisition as never,
      uberReporting as never,
      reconciliation as never,
    );

    await expect(service.syncReadyUberReports('2026-01-01')).resolves.toEqual(
      expect.objectContaining({
        skippedBeforeStartDate: 1,
        deferredReconciliationGroups: 0,
      }) as unknown,
    );
    expect(acquisition.acquireProviderApiCsv).not.toHaveBeenCalled();
    expect(
      uberReporting.findFinancialReportReconciliationCandidates,
    ).not.toHaveBeenCalled();
    expect(reconciliation.reconcileReportPair).not.toHaveBeenCalled();
  });
});
