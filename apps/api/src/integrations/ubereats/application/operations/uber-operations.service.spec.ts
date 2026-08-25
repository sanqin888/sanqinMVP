import { UberValidationError } from '../shared/uber-application.error';
import {
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
} from './uber-operations.use-cases';
import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from './uber-operations.types';

describe('Uber operations application workflows', () => {
  const telemetry = {
    captureEvent: jest.fn().mockResolvedValue(undefined),
    workflowLog: jest.fn(),
  };

  it('generates reconciliation through semantic repositories', async () => {
    const orders = {
      reconciliationOrders: jest.fn().mockResolvedValue([
        { status: 'pending', totalCents: 1200 },
        { status: 'paid', totalCents: 800 },
      ]),
    };
    const reports = {
      countFailedSyncEvents: jest.fn().mockResolvedValue(2),
      save: jest.fn().mockResolvedValue({
        reportStableId: 'report-1',
        createdAt: new Date('2026-01-02'),
      }),
    };
    const tickets = { countOpen: jest.fn().mockResolvedValue(1) };
    const useCase = new GenerateUberReconciliationReportUseCase(
      orders as never,
      reports as never,
      tickets as never,
      telemetry,
    );

    const result = await useCase.execute({
      storeId: 'store-1',
      rangeStart: '2026-01-01',
      rangeEnd: '2026-01-02',
    });

    expect(result).toMatchObject({
      totalOrders: 2,
      totalAmountCents: 2000,
      pendingOrders: 1,
      syncedOrders: 1,
      failedSyncEvents: 2,
      discrepancyOrders: 1,
    });
    expect(reports.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid report range before repository access', async () => {
    const useCase = new GenerateUberReconciliationReportUseCase(
      {} as never,
      {} as never,
      {} as never,
      telemetry,
    );
    await expect(
      useCase.execute({ rangeStart: '2026-01-02', rangeEnd: '2026-01-01' }),
    ).rejects.toBeInstanceOf(UberValidationError);
  });

  it('normalizes operation queries and caps report limit', async () => {
    const reports = {
      list: jest.fn().mockResolvedValue([]),
      summary: jest.fn(),
    };
    const tickets = {
      list: jest.fn().mockResolvedValue([]),
      summary: jest.fn(),
    };
    const query = new QueryUberOperationsSummary(
      reports as never,
      tickets as never,
    );
    await query.listReports(' store-1 ', 500);
    expect(reports.list).toHaveBeenCalledWith('store-1', 100);
  });

  it('retries a store pause ticket with the required Uber pause deadline', async () => {
    const tickets = {
      find: jest.fn().mockResolvedValue({
        ticketStableId: 'ticket-1',
        storeId: 'store-1',
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Store status sync failed',
        description: null,
        externalOrderId: null,
        menuItemStableId: null,
        context: {
          uberStoreId: 'uber-store-1',
          targetStatus: 'PAUSED',
          reason: 'POS connectivity lost',
          pauseUntil: '2026-08-26T03:30:00.000Z',
          outcome: 'FAILED',
          failureReason: 'UPSTREAM_REJECTED',
          retryable: false,
        },
        retryCount: 0,
        lastError: null,
        createdAt: new Date('2026-08-25T12:00:00.000Z'),
        updatedAt: new Date('2026-08-25T12:00:00.000Z'),
        resolvedAt: null,
      }),
      markInProgress: jest.fn().mockResolvedValue(undefined),
      finishRetry: jest.fn().mockResolvedValue({
        ticketStableId: 'ticket-1',
        status: UberOpsTicketStatus.RESOLVED,
        retryCount: 1,
        lastError: null,
        resolvedAt: new Date('2026-08-25T12:01:00.000Z'),
      }),
    };
    const unitOfWork = {
      transaction: jest.fn(
        (
          work: (scope: { tickets: typeof tickets }) => Promise<unknown>,
        ) => work({ tickets }),
      ),
    };
    const storeStatusSync = {
      syncStoreStatusToUber: jest.fn().mockResolvedValue({
        outcome: 'SUCCEEDED',
        synchronizedStores: 1,
      }),
    };
    const retry = new RetryUberOpsTicketUseCase(
      unitOfWork as never,
      {} as never,
      {} as never,
      {} as never,
      storeStatusSync as never,
      telemetry,
    );

    await expect(retry.execute('ticket-1')).resolves.toMatchObject({
      ok: true,
      ticketStableId: 'ticket-1',
      status: UberOpsTicketStatus.RESOLVED,
    });
    expect(storeStatusSync.syncStoreStatusToUber).toHaveBeenCalledWith({
      uberStoreId: 'uber-store-1',
      targetStatus: 'PAUSED',
      reason: 'POS connectivity lost',
      pauseUntil: '2026-08-26T03:30:00.000Z',
    });
  });
});
