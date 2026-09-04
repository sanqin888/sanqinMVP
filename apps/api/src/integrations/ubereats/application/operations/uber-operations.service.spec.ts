import { UberValidationError } from '../shared/uber-application.error';
import {
  GenerateUberReconciliationReportUseCase,
  mapCreateUberOpsTicketCommand,
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
    const mappings = {
      listMappings: jest.fn().mockResolvedValue([
        {
          uberStoreId: 'uber-store-1',
          posExternalStoreId: 'store-stable-1',
          isProvisioned: true,
        },
      ]),
    };
    const useCase = new GenerateUberReconciliationReportUseCase(
      orders as never,
      reports as never,
      tickets as never,
      mappings as never,
      telemetry,
    );

    const result = await useCase.execute({
      storeStableId: 'store-stable-1',
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
    expect(orders.reconciliationOrders).toHaveBeenCalledWith(
      'store-stable-1',
      expect.any(Date),
      expect.any(Date),
    );
    expect(tickets.countOpen).toHaveBeenCalledWith({
      storeStableId: 'store-stable-1',
      legacyUberStoreIds: ['uber-store-1'],
    });
    expect(reports.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid report range before repository access', async () => {
    const useCase = new GenerateUberReconciliationReportUseCase(
      {} as never,
      {} as never,
      {} as never,
      { listMappings: jest.fn().mockResolvedValue([]) } as never,
      telemetry,
    );
    await expect(
      useCase.execute({
        storeStableId: 'store-stable-1',
        rangeStart: '2026-01-02',
        rangeEnd: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(UberValidationError);
  });

  it('keeps menu-publish retry context on canonical storeStableId', () => {
    const command = mapCreateUberOpsTicketCommand({
      storeStableId: 'store-stable-1',
      type: UberOpsTicketType.MENU_PUBLISH,
      title: 'Retry menu publish',
      publish: {
        timezoneConfirmed: true,
        taxRateConfirmed: true,
        safetyFingerprint: 'a'.repeat(64),
      },
    });

    expect(command.context).toEqual({
      publish: {
        storeStableId: 'store-stable-1',
        dryRun: false,
        timezoneConfirmed: true,
        taxRateConfirmed: true,
        safetyFingerprint: 'a'.repeat(64),
      },
    });
    expect(JSON.stringify(command.context)).not.toContain('uberStoreId');
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
      {
        listMappings: jest.fn().mockResolvedValue([
          {
            uberStoreId: 'uber-store-1',
            posExternalStoreId: 'store-stable-1',
            isProvisioned: true,
          },
        ]),
      } as never,
    );
    await query.listReports(' store-stable-1 ', 500);
    await query.listTickets('store-stable-1');
    expect(reports.list).toHaveBeenCalledWith('store-stable-1', 100);
    expect(tickets.list).toHaveBeenCalledWith(
      {
        storeStableId: 'store-stable-1',
        legacyUberStoreIds: ['uber-store-1'],
      },
      undefined,
    );
  });

  it('retries a historical availability ticket without re-reading Catalog', async () => {
    const tickets = {
      find: jest.fn().mockResolvedValue({
        ticketStableId: 'ticket-availability-1',
        persistedStoreScopeId: 'store-stable-1',
        type: UberOpsTicketType.MENU_ITEM_AVAILABILITY,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Availability sync failed',
        description: null,
        externalOrderId: null,
        menuItemStableId: 'item-stable-1',
        context: { isAvailable: false },
        retryCount: 0,
        lastError: null,
        createdAt: new Date('2026-08-25T12:00:00.000Z'),
        updatedAt: new Date('2026-08-25T12:00:00.000Z'),
        resolvedAt: null,
      }),
      markInProgress: jest.fn().mockResolvedValue(undefined),
      finishRetry: jest.fn().mockResolvedValue({
        ticketStableId: 'ticket-availability-1',
        status: UberOpsTicketStatus.RESOLVED,
        retryCount: 1,
        lastError: null,
        resolvedAt: new Date('2026-08-25T12:01:00.000Z'),
      }),
    };
    const unitOfWork = {
      transaction: jest.fn(
        (work: (scope: { tickets: typeof tickets }) => Promise<unknown>) =>
          work({ tickets }),
      ),
    };
    const menuAvailability = {
      syncUberMenuItemAvailability: jest.fn().mockResolvedValue({
        status: 'SYNCED',
        stores: [],
      }),
    };
    const retry = new RetryUberOpsTicketUseCase(
      unitOfWork as never,
      {} as never,
      {} as never,
      menuAvailability as never,
      {} as never,
      {
        listMappings: jest.fn().mockResolvedValue([
          {
            uberStoreId: 'uber-store-1',
            posExternalStoreId: 'store-stable-1',
            isProvisioned: true,
          },
        ]),
      } as never,
      telemetry,
    );

    await expect(retry.execute('ticket-availability-1')).resolves.toMatchObject({
      ok: true,
      ticketStableId: 'ticket-availability-1',
      status: UberOpsTicketStatus.RESOLVED,
    });
    expect(menuAvailability.syncUberMenuItemAvailability).toHaveBeenCalledWith({
      storeStableId: 'store-stable-1',
      menuItemStableId: 'item-stable-1',
      isAvailable: false,
      publishable: true,
      suspendUntil: null,
    });
  });

  it('retries a historical provider-scoped OFFLINE ticket through canonical store mapping', async () => {
    const tickets = {
      find: jest.fn().mockResolvedValue({
        ticketStableId: 'ticket-1',
        persistedStoreScopeId: 'uber-store-1',
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Store status sync failed',
        description: null,
        externalOrderId: null,
        menuItemStableId: null,
        context: {
          uberStoreId: 'uber-store-1',
          targetStatus: 'OFFLINE',
          reason: 'UPSTREAM_REJECTED',
          outcome: 'FAILED',
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
        (work: (scope: { tickets: typeof tickets }) => Promise<unknown>) =>
          work({ tickets }),
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
      {
        listMappings: jest.fn().mockResolvedValue([
          {
            uberStoreId: 'uber-store-1',
            posExternalStoreId: 'store-stable-1',
            isProvisioned: true,
          },
        ]),
      } as never,
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
    });
  });
});
