import {
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';
import { UberOrderActionService } from './uber-order-action.service';
import type { UberOrderNotificationEventV1 } from '../../domain/webhook/uber-webhook-event.parser';
import type { UberOrderImportRepositoryPort } from './uber-order.ports';

type ImportedOrderInput = Parameters<
  UberOrderImportRepositoryPort['saveImportedOrder']
>[0];

const notification = {
  resourceId: 'order-1',
  resourceHref: 'https://example.test/orders/order-1',
} as UberOrderNotificationEventV1;
const detail = {
  id: 'order-1',
  store_id: 'uber-store-123',
  subtotal: 100,
  total: 100,
  items: [{ id: 'item-1', quantity: 1, price: 100, total_price: 100 }],
};

describe('Uber order use-case boundaries', () => {
  it('commits the ACCEPT intent with the order so process exit cannot lose it', async () => {
    const saved: { order?: ImportedOrderInput } = {};
    const saveImportedOrder = jest.fn((order: ImportedOrderInput) => {
      saved.order = order;
      return Promise.resolve({
        orderId: 'local-1',
        created: true,
        action: { taskId: 'action-1', created: true },
      });
    });
    const request = jest.fn();
    const findMapping = jest.fn().mockResolvedValue({
      uberStoreId: 'uber-store-123',
      isProvisioned: true,
      posExternalStoreId: '4750_Yonge_Street',
    });
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
      { findMapping } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(saveImportedOrder).toHaveBeenCalledTimes(1);
    expect(findMapping).toHaveBeenCalledWith('uber-store-123');
    expect(saved.order?.actionIntent).toMatchObject({
      externalOrderId: 'order-1',
      action: 'ACCEPT',
    });
    expect(saved.order?.actionIntent?.idempotencyKey).toMatch(/^sanqin-uber-/);
    expect(saved.order?.order.uberStoreId).toBe('uber-store-123');
    expect(saved.order?.posStoreId).toBe('4750_Yonge_Street');
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['UBER_STORE_MAPPING_NOT_FOUND', null],
    [
      'UBER_STORE_MAPPING_NOT_PROVISIONED',
      {
        uberStoreId: 'uber-store-123',
        isProvisioned: false,
        posExternalStoreId: 'store-1',
      },
    ],
    [
      'UBER_POS_STORE_ID_MISSING',
      {
        uberStoreId: 'uber-store-123',
        isProvisioned: true,
        posExternalStoreId: null,
      },
    ],
  ])(
    'does not ingest or accept when mapping validation fails: %s',
    async (code, mapping) => {
      const repository = {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn(),
        saveImportedOrder: jest.fn(),
      };
      const actions = { request: jest.fn() };
      const useCase = new ImportUberOrderUseCase(
        repository as never,
        { fetchOrderDetail: jest.fn().mockResolvedValue(detail) },
        actions as unknown as UberOrderActionService,
        { findMapping: jest.fn().mockResolvedValue(mapping) } as never,
      );

      await expect(
        useCase.execute('orders.notification', 'event-1', notification),
      ).rejects.toMatchObject({ code, retryable: true });
      expect(repository.saveImportedOrder).not.toHaveBeenCalled();
      expect(repository.findMenuMappings).not.toHaveBeenCalled();
      expect(actions.request).not.toHaveBeenCalled();
    },
  );

  it('imports one order with one idempotent accept intent after mapping repair and replay', async () => {
    const mapping = {
      uberStoreId: 'uber-store-123',
      isProvisioned: false,
      posExternalStoreId: null as string | null,
    };
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue(null),
      findMenuMappings: jest.fn().mockResolvedValue([
        {
          externalItemId: 'item-1',
          menuItemStableId: 'menu-1',
          expectedPriceCents: 100,
        },
      ]),
      saveImportedOrder: jest
        .fn<
          Promise<{
            orderId: string;
            created: boolean;
            action: { taskId: string; created: boolean };
          }>,
          [ImportedOrderInput]
        >()
        .mockResolvedValue({
          orderId: 'local-1',
          created: true,
          action: { taskId: 'accept-1', created: true },
        }),
    };
    const actions = { request: jest.fn() };
    const useCase = new ImportUberOrderUseCase(
      repository as never,
      { fetchOrderDetail: jest.fn().mockResolvedValue(detail) },
      actions as unknown as UberOrderActionService,
      { findMapping: jest.fn().mockImplementation(() => mapping) } as never,
    );

    await expect(
      useCase.execute('orders.notification', 'event-1', notification),
    ).rejects.toMatchObject({ code: 'UBER_STORE_MAPPING_NOT_PROVISIONED' });
    mapping.isProvisioned = true;
    mapping.posExternalStoreId = 'store-1';
    await useCase.execute('orders.notification', 'event-1', notification);

    expect(repository.saveImportedOrder).toHaveBeenCalledTimes(1);
    const savedInput = repository.saveImportedOrder.mock.calls[0]?.[0];
    expect(savedInput?.posStoreId).toBe('store-1');
    expect(savedInput?.actionIntent?.action).toBe('ACCEPT');
    expect(actions.request).not.toHaveBeenCalled();
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
      { findMapping: jest.fn() } as never,
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
