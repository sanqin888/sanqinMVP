import { AccountingAutomationScheduler } from './accounting-automation.scheduler';

describe('AccountingAutomationScheduler financial-report characterization', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const makeScheduler = (accountingStartDate: Date | null = null) => {
    const gmail = {
      ingestBillsMailbox: jest.fn().mockResolvedValue({
        configured: true,
        scannedMessages: 0,
        importedDocuments: 0,
        duplicateDocuments: 0,
        failedDocuments: 0,
        skippedBeforeStartDate: 0,
      }),
    };
    const prisma = {
      accountingAutomationConfig: {
        upsert: jest.fn().mockResolvedValue({
          timezone: 'America/Toronto',
          runHour: 7,
          runMinute: 0,
          gmailEnabled: true,
          uberReportsEnabled: true,
          accountingStartDate,
        }),
      },
    };
    const uberReporting = {
      requestFinancialReports: jest
        .fn()
        .mockResolvedValue([{ workflowId: 'workflow-1' }]),
    };
    const providerFinancialHistory = {
      syncReadyUberReports: jest.fn().mockResolvedValue({
        scannedReports: 0,
        importedReports: 0,
        importedArtifacts: 0,
        deferredArtifacts: 0,
        skippedBeforeStartDate: 0,
        skippedOrderDetailReports: 0,
      }),
    };
    const scheduler = new AccountingAutomationScheduler(
      gmail as never,
      providerFinancialHistory as never,
      prisma as never,
      uberReporting as never,
    );
    return {
      scheduler,
      gmail,
      prisma,
      uberReporting,
      providerFinancialHistory,
    };
  };

  it('delegates provider capability and provisioned-store resolution to the External reporting boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T15:00:00.000Z'));
    const { scheduler, uberReporting } = makeScheduler();

    await expect(scheduler.runNow()).resolves.toEqual(
      expect.objectContaining({
        uber: [{ workflowId: 'workflow-1' }],
      }) as unknown,
    );

    expect(uberReporting.requestFinancialReports).toHaveBeenCalledWith({
      startDate: '2026-09-07',
      endDate: '2026-09-10',
      reportTypes: ['PAYMENT_DETAILS_REPORT', 'FINANCE_SUMMARY_REPORT'],
    });
  });

  it('requests the previous four-day rolling window, clipped by accountingStartDate, in the configured business timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T15:00:00.000Z'));
    const { scheduler, gmail, uberReporting, providerFinancialHistory } =
      makeScheduler(new Date('2026-09-09T00:00:00.000Z'));

    await expect(scheduler.runNow()).resolves.toEqual({
      gmail: expect.objectContaining({
        importedDocuments: 0,
      }) as unknown as Record<string, unknown>,
      uber: [{ workflowId: 'workflow-1' }],
      uberFinancialHistory: expect.objectContaining({
        importedReports: 0,
      }) as unknown as Record<string, unknown>,
    });

    expect(gmail.ingestBillsMailbox).toHaveBeenCalledWith({
      accountingStartDate: '2026-09-09',
      timezone: 'America/Toronto',
    });
    expect(uberReporting.requestFinancialReports).toHaveBeenCalledWith({
      startDate: '2026-09-09',
      endDate: '2026-09-10',
      reportTypes: ['PAYMENT_DETAILS_REPORT', 'FINANCE_SUMMARY_REPORT'],
    });
    expect(providerFinancialHistory.syncReadyUberReports).toHaveBeenCalledWith(
      '2026-09-09',
    );
  });

  it('does not request a report when accountingStartDate is later than the latest completed business day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T15:00:00.000Z'));
    const { scheduler, uberReporting } = makeScheduler(
      new Date('2026-09-11T00:00:00.000Z'),
    );

    await expect(scheduler.runNow()).resolves.toEqual(
      expect.objectContaining({ uber: [] }) as unknown,
    );

    expect(uberReporting.requestFinancialReports).not.toHaveBeenCalled();
  });
});
