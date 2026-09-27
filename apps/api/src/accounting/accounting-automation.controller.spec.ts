import { AccountingAutomationController } from './accounting-automation.controller';

describe('AccountingAutomationController Uber report validation', () => {
  function makeController() {
    const automation = {};
    const uberReporting = {
      requestFinancialReports: jest.fn().mockResolvedValue([
        {
          reportStableId: 'uberreport_1',
          workflowId: 'workflow_1',
          reportType: 'PAYMENT_DETAILS_REPORT',
          status: 'REQUESTED',
        },
      ]),
      listFinancialReports: jest.fn(),
      readFinancialReportArtifact: jest.fn().mockResolvedValue({
        content: 'Store Name,Total payout\nSanQ,12.34\n',
        contentHash: 'a'.repeat(64),
        byteSize: 38,
        fileName: 'payment-details.csv',
      }),
    };
    const tabularPreview = {
      previewUberReportCsv: jest.fn().mockReturnValue({
        format: 'CSV',
        filename: 'payment-details.csv',
        rows: [['Store Name', 'Total payout']],
      }),
    };
    return {
      controller: new AccountingAutomationController(
        automation as never,
        uberReporting as never,
        tabularPreview as never,
      ),
      uberReporting,
      tabularPreview,
    };
  }

  it('requests only the two Accounting financial report types by default', async () => {
    const { controller, uberReporting } = makeController();

    await expect(
      controller.requestUberReports({
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      }),
    ).resolves.toEqual([
      expect.objectContaining({ reportStableId: 'uberreport_1' }),
    ]);

    expect(uberReporting.requestFinancialReports).toHaveBeenCalledWith({
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      reportTypes: ['PAYMENT_DETAILS_REPORT', 'FINANCE_SUMMARY_REPORT'],
    });
  });

  it('deduplicates an explicitly selected supported report type', async () => {
    const { controller, uberReporting } = makeController();

    await controller.requestUberReports({
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      reportTypes: ['FINANCE_SUMMARY_REPORT', 'FINANCE_SUMMARY_REPORT'],
    });

    expect(uberReporting.requestFinancialReports).toHaveBeenCalledWith({
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      reportTypes: ['FINANCE_SUMMARY_REPORT'],
    });
  });

  it('previews only an artifact validated by the Uber reporting public port', async () => {
    const { controller, uberReporting, tabularPreview } = makeController();
    const artifactUrl =
      '/api/v1/accounting/files/uber-reports/payment-details.csv';

    await expect(
      controller.previewUberReport('uberreport_1', artifactUrl),
    ).resolves.toEqual(
      expect.objectContaining({
        format: 'CSV',
        filename: 'payment-details.csv',
      }),
    );

    expect(uberReporting.readFinancialReportArtifact).toHaveBeenCalledWith({
      reportStableId: 'uberreport_1',
      artifactUrl,
    });
    expect(tabularPreview.previewUberReportCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'payment-details.csv',
      }),
    );
  });

  it('rejects a preview request without an artifact URL', async () => {
    const { controller, uberReporting, tabularPreview } = makeController();

    await expect(
      controller.previewUberReport('uberreport_1', '   '),
    ).rejects.toThrow('artifactUrl is required');
    expect(uberReporting.readFinancialReportArtifact).not.toHaveBeenCalled();
    expect(tabularPreview.previewUberReportCsv).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        startDate: '2026-02-30',
        endDate: '2026-03-01',
      },
      'startDate must use YYYY-MM-DD',
    ],
    [
      {
        startDate: '2026-09-03',
        endDate: '2026-09-02',
      },
      'startDate must not be after endDate',
    ],
    [
      {
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        reportTypes: ['ORDERS_AND_ITEMS_REPORT'] as const,
      },
      'reportTypes must contain only PAYMENT_DETAILS_REPORT or FINANCE_SUMMARY_REPORT',
    ],
  ])('rejects an invalid manual report request %#', (body, message) => {
    const { controller, uberReporting } = makeController();

    expect(() => controller.requestUberReports(body as never)).toThrow(message);
    expect(uberReporting.requestFinancialReports).not.toHaveBeenCalled();
  });
});
