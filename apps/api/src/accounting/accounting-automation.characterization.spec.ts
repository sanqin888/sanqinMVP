import { AccountingAutomationScheduler } from './accounting-automation.scheduler';

describe('AccountingAutomationScheduler financial-report characterization', () => {
  const originalScopes = process.env.UBER_EATS_APP_SCOPES;

  afterEach(() => {
    jest.useRealTimers();
    if (originalScopes === undefined) delete process.env.UBER_EATS_APP_SCOPES;
    else process.env.UBER_EATS_APP_SCOPES = originalScopes;
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
      uberStoreMapping: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { uberStoreId: 'uber-store-a' },
            { uberStoreId: 'uber-store-b' },
          ]),
      },
    };
    const uberReporting = {
      requestFinancialReports: jest
        .fn()
        .mockResolvedValue([{ workflowId: 'workflow-1' }]),
    };
    const scheduler = new AccountingAutomationScheduler(
      gmail as never,
      prisma as never,
      uberReporting as never,
    );
    return { scheduler, gmail, prisma, uberReporting };
  };

  it('does not inspect store mappings or request reports unless eats.report is configured', async () => {
    process.env.UBER_EATS_APP_SCOPES = 'eats.store eats.order';
    const { scheduler, prisma, uberReporting } = makeScheduler();

    await expect(scheduler.runNow()).resolves.toEqual(
      expect.objectContaining({ uber: [] }) as unknown,
    );

    expect(prisma.uberStoreMapping.findMany).not.toHaveBeenCalled();
    expect(uberReporting.requestFinancialReports).not.toHaveBeenCalled();
  });

  it('requests the previous four-day rolling window, clipped by accountingStartDate, in the configured business timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T15:00:00.000Z'));
    process.env.UBER_EATS_APP_SCOPES = 'eats.store,eats.report';
    const { scheduler, gmail, prisma, uberReporting } = makeScheduler(
      new Date('2026-09-09T00:00:00.000Z'),
    );

    await expect(scheduler.runNow()).resolves.toEqual({
      gmail: expect.objectContaining({
        importedDocuments: 0,
      }) as unknown as Record<string, unknown>,
      uber: [{ workflowId: 'workflow-1' }],
    });

    expect(gmail.ingestBillsMailbox).toHaveBeenCalledWith({
      accountingStartDate: '2026-09-09',
      timezone: 'America/Toronto',
    });
    expect(prisma.uberStoreMapping.findMany).toHaveBeenCalledWith({
      where: { isProvisioned: true },
      select: { uberStoreId: true },
      orderBy: { uberStoreId: 'asc' },
    });
    expect(uberReporting.requestFinancialReports).toHaveBeenCalledWith({
      storeUuids: ['uber-store-a', 'uber-store-b'],
      startDate: '2026-09-09',
      endDate: '2026-09-10',
      reportTypes: [
        'PAYMENT_DETAILS_REPORT',
        'FINANCE_SUMMARY_REPORT',
        'ORDERS_AND_ITEMS_REPORT',
      ],
    });
  });

  it('does not request a report when accountingStartDate is later than the latest completed business day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T15:00:00.000Z'));
    process.env.UBER_EATS_APP_SCOPES = 'eats.report';
    const { scheduler, uberReporting } = makeScheduler(
      new Date('2026-09-11T00:00:00.000Z'),
    );

    await expect(scheduler.runNow()).resolves.toEqual(
      expect.objectContaining({ uber: [] }) as unknown,
    );

    expect(uberReporting.requestFinancialReports).not.toHaveBeenCalled();
  });
});
