jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
}));

import type { OrderStatus } from '@prisma/client';
import { UberOrderStatusSyncService } from './uber-order-status-sync.service';

describe('UberOrderStatusSyncService', () => {
  it('maps local statuses and creates a stable client request id', () => {
    const service = new UberOrderStatusSyncService({} as never);
    expect(service.actionFor('making' as OrderStatus)).toBeUndefined();
    expect(service.actionFor('ready' as OrderStatus)).toBe('READY_FOR_PICKUP');
    expect(service.clientRequestId('order-1')).toBe('ubereats:order-1');
  });
});
