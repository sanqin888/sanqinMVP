import { ImportUberOrderUseCase } from './uber-order.use-cases';
import type {
  UberOrderImportRepositoryPort,
  UberOrderMenuMapping,
} from './uber-order.ports';
import type { UberOrderDetailResult } from './uber-order-query.ports';

type ImportedOrderInput = Parameters<
  UberOrderImportRepositoryPort['saveImportedOrder']
>[0];

const notification = {
  version: 1,
  family: 'order',
  eventType: 'orders.notification',
  resourceHref: 'https://api.uber.com/v1/delivery/order/scheduled-order-1',
  resourceId: 'scheduled-order-1',
  userId: 'test-store-1',
  eventId: null,
} satisfies Parameters<ImportUberOrderUseCase['execute']>[2];

const scheduledDetail = {
  kind: 'parsed',
  order: {
    externalOrderId: 'scheduled-order-1',
    displayId: 'S1001',
    pickupCode: null,
    uberStoreId: 'test-store-1',
    subtotalCents: 1000,
    taxCents: 130,
    totalCents: 1130,
    discountCents: 0,
    hasPromotion: false,
    deliveryFeeCents: 0,
    fulfillmentType: 'delivery',
    fulfillmentTiming: 'SCHEDULED',
    scheduledReadyAt: new Date('2026-08-21T14:53:28.000Z'),
    estimatedReadyAt: new Date('2026-08-21T14:53:28.000Z'),
    specialInstructions: null,
    items: [
      {
        externalLineId: 'line-1',
        externalItemId: 'item-1',
        stableIdHint: null,
        displayName: 'Scheduled item',
        quantity: 1,
        baseUnitPriceCents: 1000,
        optionsUnitPriceCents: 0,
        unitPriceCents: 1000,
        lineTotalCents: 1000,
        specialInstructions: null,
        modifiers: [],
      },
    ],
    contactName: null,
    contactPhone: null,
    paidAt: new Date('2026-08-21T13:55:15.000Z'),
    cancellation: null,
  },
} satisfies UberOrderDetailResult;

const menuMappings: UberOrderMenuMapping[] = [
  {
    externalItemId: 'item-1',
    menuItemStableId: 'menu-item-1',
    expectedPriceCents: 1000,
  },
];

const storeMapping = {
  uberStoreId: 'test-store-1',
  isProvisioned: true,
  posExternalStoreId: '4750_Yonge_Street',
};

describe('Uber scheduled-order follow-up notifications', () => {
  it('refreshes scheduled detail and requeues ACCEPT for the finalization phase', async () => {
    const saved: { input?: ImportedOrderInput } = {};
    const saveImportedOrder = jest.fn((input: ImportedOrderInput) => {
      saved.input = input;
      return Promise.resolve({
        orderId: 'local-1',
        created: false,
        action: null,
      });
    });
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue({
        orderId: 'local-1',
        status: 'paid',
        fulfillmentTiming: 'SCHEDULED',
        cursor: {
          eventId: 'scheduled-event-1',
          occurredAt: new Date('2026-08-21T13:55:15.000Z'),
          resourceVersion: null,
          sequence: null,
        },
      }),
      findMenuMappings: jest.fn().mockResolvedValue(menuMappings),
      saveExistingOrderCancellation: jest.fn(),
      saveImportedOrder,
    } as unknown as UberOrderImportRepositoryPort;
    const fetchOrderDetail = jest.fn().mockResolvedValue(scheduledDetail);
    const requestScheduledFinalizeAccept = jest
      .fn()
      .mockResolvedValue({ taskId: 'accept-1', created: true });
    const request = jest.fn();
    const buildIntent = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      repository,
      { fetchOrderDetail },
      { request, buildIntent, requestScheduledFinalizeAccept } as never,
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute(
      'orders.notification',
      'followup-event-1',
      notification,
      {
        occurredAt: new Date('2026-08-21T14:40:12.000Z'),
        resourceVersion: null,
        sequence: null,
      },
    );

    expect(fetchOrderDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'orders.scheduled.notification',
        eventId: 'followup-event-1',
        resourceId: 'scheduled-order-1',
      }),
    );
    expect(saveImportedOrder).toHaveBeenCalledTimes(1);
    expect(saved.input?.eventType).toBe('orders.notification');
    expect(saved.input?.order.fulfillmentTiming).toBe('SCHEDULED');
    expect(saved.input?.actionIntent).toBeNull();
    expect(requestScheduledFinalizeAccept).toHaveBeenCalledWith(
      'scheduled-order-1',
    );
    expect(request).not.toHaveBeenCalled();
    expect(buildIntent).not.toHaveBeenCalled();
  });

  it('still imports orders.notification normally when the external order is unknown', async () => {
    const findByExternalOrderId = jest.fn().mockResolvedValue(null);
    const fetchOrderDetail = jest
      .fn()
      .mockRejectedValue(new Error('detail-called'));
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
