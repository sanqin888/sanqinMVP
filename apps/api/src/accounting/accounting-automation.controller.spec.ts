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
    };
    return {
      controller: new AccountingAutomationController(
        automation as never,
        uberReporting as never,
      ),
      uberReporting,
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
