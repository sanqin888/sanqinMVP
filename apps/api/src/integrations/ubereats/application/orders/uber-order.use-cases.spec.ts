import {
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';
import { UberOrderActionService } from './uber-order-action.service';
import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';

const notification = {
  resourceId: 'order-1',
  resourceHref: 'https://example.test/orders/order-1',
} as UberOrderNotificationEventV1;
const detail = {
  id: 'order-1',
  store: { id: 'store-1' },
  subtotal: 100,
  total: 100,
  items: [{ id: 'item-1', quantity: 1, price: 100, total_price: 100 }],
};

describe('Uber order use-case boundaries', () => {
  it('commits the ACCEPT intent with the order so process exit cannot lose it', async () => {
    const saveImportedOrder = jest.fn().mockResolvedValue({
      orderId: 'local-1',
      created: true,
      action: { taskId: 'action-1', created: true },
    });
    const request = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn().mockResolvedValue([
          {
            externalItemId: 'item-1',
            menuItemStableId: 'menu-1',
            expectedPriceCents: 100,
          },
        ]),
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(detail) },
      { request } as unknown as UberOrderActionService,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(saveImportedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        actionIntent: expect.objectContaining({
          externalOrderId: 'order-1',
          action: 'ACCEPT',
          idempotencyKey: expect.stringMatching(/^sanqin-uber-/),
        }),
      }),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps concurrent duplicate deliveries as an idempotent repair path', async () => {
    const request = jest.fn().mockResolvedValue({
      taskId: 'same-action',
      created: false,
    });
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue({
        orderId: 'local-1',
        status: 'pending',
        cursor: { eventId: 'event-1' },
      }),
      findMenuMappings: jest.fn(),
      saveImportedOrder: jest.fn(),
    };
    const useCase = new ImportUberOrderUseCase(
      repository as never,
      { fetchOrderDetail: jest.fn() },
      { request } as unknown as UberOrderActionService,
    );

    await Promise.all([
      useCase.execute('orders.notification', 'event-1', notification),
      useCase.execute('orders.notification', 'event-1', notification),
    ]);

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith('order-1', 'ACCEPT');
    expect(repository.saveImportedOrder).not.toHaveBeenCalled();
  });

  it('requests an ACCEPT durable intent', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ taskId: 'task-1', created: true });
    const useCase = new RequestUberOrderActionUseCase({
      request,
    } as unknown as UberOrderActionService);
    await expect(useCase.accept('order-1')).resolves.toMatchObject({
      actionId: 'task-1',
      status: 'PENDING',
      duplicate: false,
    });
    expect(request).toHaveBeenCalledWith('order-1', 'ACCEPT');
  });

  it('delegates lease processing to the action service', async () => {
    const process = jest.fn().mockResolvedValue(2);
    const worker = new ExecuteUberOrderActionWorker({
      process,
    } as unknown as UberOrderActionService);
    await expect(worker.execute(50)).resolves.toBe(2);
    expect(process).toHaveBeenCalledWith(50, expect.stringMatching(/^worker-/));
  });
});
