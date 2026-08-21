import { ImportUberOrderUseCase } from './uber-order.use-cases';
import type { UberOrderImportRepositoryPort } from './uber-order.ports';
import type { UberOrderNotificationEventV1 } from '../../domain/webhook/uber-webhook-event.parser';

const notification = {
  resourceId: 'scheduled-order-1',
  resourceHref:
    'https://api.uber.com/v1/delivery/order/scheduled-order-1',
} as UberOrderNotificationEventV1;

describe('Uber scheduled-order follow-up notifications', () => {
  it('acknowledges a later orders.notification without re-importing or re-accepting an existing scheduled order', async () => {
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue({
        orderId: 'local-1',
        status: 'paid',
        fulfillmentTiming: 'SCHEDULED',
        cursor: {
          eventId: 'scheduled-event-1',
          occurredAt: new Date('2026-08-20T22:32:15.000Z'),
          resourceVersion: null,
          sequence: null,
        },
      }),
      findMenuMappings: jest.fn(),
      saveExistingOrderCancellation: jest.fn(),
      saveImportedOrder: jest.fn(),
    } as unknown as UberOrderImportRepositoryPort;
    const fetchOrderDetail = jest.fn();
    const request = jest.fn();
    const buildIntent = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      repository,
      { fetchOrderDetail },
      { request, buildIntent } as never,
      { findMapping: jest.fn() } as never,
    );

    await useCase.execute('orders.notification', 'followup-event-1', notification, {
      occurredAt: new Date('2026-08-21T00:08:03.000Z'),
      resourceVersion: null,
      sequence: null,
    });

    expect(fetchOrderDetail).not.toHaveBeenCalled();
    expect(repository.saveImportedOrder).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(buildIntent).not.toHaveBeenCalled();
  });

  it('still imports orders.notification normally when the external order is unknown', async () => {
    const findByExternalOrderId = jest.fn().mockResolvedValue(null);
    const fetchOrderDetail = jest.fn().mockRejectedValue(new Error('detail-called'));
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId,
        findMenuMappings: jest.fn(),
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder: jest.fn(),
      },
      { fetchOrderDetail },
      { request: jest.fn() } as never,
      { findMapping: jest.fn() } as never,
    );

    await expect(
      useCase.execute('orders.notification', 'new-event-1', notification),
    ).rejects.toThrow('detail-called');
    expect(fetchOrderDetail).toHaveBeenCalledTimes(1);
  });
});