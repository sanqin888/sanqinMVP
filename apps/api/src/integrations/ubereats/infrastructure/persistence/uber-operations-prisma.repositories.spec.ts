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

  it('maps Prisma enums and drops persistence-only ticket fields', () => {
    const mapped = mapOpsTicketRow({
      ticketStableId: 'ticket-1',
      storeId: 'store-1',
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
      description: 'persistence-only for list model',
    });

    expect(mapped).toMatchObject({
      type: 'MENU_PUBLISH',
      status: 'OPEN',
      priority: 'HIGH',
    });
    expect(mapped).not.toHaveProperty('description');
  });
});
