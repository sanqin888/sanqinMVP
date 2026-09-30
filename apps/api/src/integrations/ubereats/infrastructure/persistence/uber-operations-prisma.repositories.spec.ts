jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  Channel: { ubereats: 'ubereats' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    refunded: 'refunded',
  },
  UberOpsTicketPriority: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
  UberFinancialReportStatus: {
    REQUESTED: 'REQUESTED',
    READY: 'READY',
    IMPORTED: 'IMPORTED',
    ERROR: 'ERROR',
  },
  UberOpsTicketStatus: {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
    CLOSED: 'CLOSED',
    IGNORED: 'IGNORED',
  },
  UberOpsTicketType: {
    ORDER_STATUS_SYNC: 'ORDER_STATUS_SYNC',
    MENU_ITEM_AVAILABILITY: 'MENU_ITEM_AVAILABILITY',
    STORE_STATUS_SYNC: 'STORE_STATUS_SYNC',
    MENU_PUBLISH: 'MENU_PUBLISH',
    RECONCILIATION: 'RECONCILIATION',
  },
}));

import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '@prisma/client';
import {
  mapOpsTicketRow,
  mapReconciliationRow,
  UberFinancialReportPrismaRepository,
} from './uber-operations-prisma.repositories';

describe('Uber operations persistence mapping contract', () => {
  const now = new Date('2026-08-11T00:00:00.000Z');

  it('maps a reconciliation row to the stable application report', () => {
    const row = {
      reportStableId: 'report-1',
      rangeStart: now,
      rangeEnd: new Date('2026-08-12T00:00:00.000Z'),
      totalOrders: 4,
      totalAmountCents: 4200,
      syncedOrders: 3,
      pendingOrders: 1,
      failedSyncEvents: 2,
      discrepancyOrders: 1,
      createdAt: now,
      payload: { persistenceOnly: true },
    };

    expect(mapReconciliationRow(row)).toEqual({
      reportStableId: 'report-1',
      rangeStart: row.rangeStart,
      rangeEnd: row.rangeEnd,
      totalOrders: 4,
      totalAmountCents: 4200,
      syncedOrders: 3,
      pendingOrders: 1,
      failedSyncEvents: 2,
      discrepancyOrders: 1,
      createdAt: now,
    });
  });

  it('maps Prisma enums and exposes the persisted canonical storeStableId', () => {
    const mapped = mapOpsTicketRow({
      ticketStableId: 'ticket-1',
      storeId: 'store-stable-1',
      type: UberOpsTicketType.MENU_PUBLISH,
      status: UberOpsTicketStatus.OPEN,
      priority: UberOpsTicketPriority.HIGH,
      title: 'retry menu',
      externalOrderId: null,
      menuItemStableId: null,
      retryCount: 2,
      lastError: 'timeout',
      createdAt: now,
      updatedAt: now,
      description: 'persistence-only for retry model',
      context: {
        publish: { storeStableId: 'store-stable-1', dryRun: false },
      },
      resolvedAt: null,
    });

    expect(mapped).toMatchObject({
      storeStableId: 'store-stable-1',
      type: 'MENU_PUBLISH',
      status: 'OPEN',
      priority: 'HIGH',
      description: 'persistence-only for retry model',
      context: {
        publish: { storeStableId: 'store-stable-1', dryRun: false },
      },
    });
  });
});

describe('UberFinancialReportPrismaRepository reconciliation lookup', () => {
  it('queries the exact store-set and period without a global history limit', async () => {
    const requestedAt = new Date('2026-09-26T00:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        reportStableId: 'finance-1',
        workflowId: 'workflow-finance-1',
        reportType: 'FINANCE_SUMMARY_REPORT',
        storeUuids: ['provider-store-a'],
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        status: 'IMPORTED',
        downloadUrls: [],
        artifactUrls: ['/reports/finance.csv'],
        requestedAt,
        completedAt: requestedAt,
        importedAt: requestedAt,
        errorMessage: null,
        rawMetadata: null,
      },
    ]);
    const repository = new UberFinancialReportPrismaRepository({
      uberFinancialReport: { findMany },
    } as never);

    await expect(
      repository.listReconciliationCandidates({
        storeUuids: ['provider-store-a'],
        startDate: '2026-09-01',
        endDate: '2026-09-25',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        reportStableId: 'finance-1',
        status: 'IMPORTED',
      }),
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        storeUuids: { equals: ['provider-store-a'] },
        startDate: '2026-09-01',
        endDate: '2026-09-25',
        reportType: {
          in: ['PAYMENT_DETAILS_REPORT', 'FINANCE_SUMMARY_REPORT'],
        },
        status: {
          in: ['READY', 'IMPORTED'],
        },
      },
      orderBy: [{ reportType: 'asc' }, { requestedAt: 'desc' }],
    });
  });
});
