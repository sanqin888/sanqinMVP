import type {
  UberOrderActionGatewayPort,
  UberOrderActionRepositoryPort,
  UberOrderImportRepositoryPort,
} from './uber-order.ports';
import { UberOrderActionService } from './uber-order-action.service';
import { ImportUberOrderUseCase } from './uber-order.use-cases';
import { UberOrderPayloadParser } from '../../domain/orders/uber-order-payload.parser';
import type { UberOrderNotificationEventV1 } from '../../domain/webhook/uber-webhook-event.parser';

type ImportedOrderInput = Parameters<
  UberOrderImportRepositoryPort['saveImportedOrder']
>[0];
type EnqueueMock = jest.MockedFunction<
  UberOrderActionRepositoryPort['enqueue']
>;

const notification = {
  resourceId: 'order-1',
  resourceHref: 'https://example.test/orders/order-1',
} as UberOrderNotificationEventV1;

const parsedDetail = {
  kind: 'parsed' as const,
  order: new UberOrderPayloadParser().parse({
    id: 'order-1',
    store_id: 'uber-store-1',
    subtotal: 100,
    total: 100,
    items: [{ id: 'item-1', quantity: 1, price: 100, total_price: 100 }],
  })!,
};

const storeMapping = {
  uberStoreId: 'uber-store-1',
  isProvisioned: true,
  posExternalStoreId: 'pos-store-1',
};

const menuMappings = [
  {
    externalItemId: 'item-1',
    menuItemStableId: 'menu-1',
    expectedPriceCents: 100,
  },
];

const createActions = (enqueue: EnqueueMock) =>
  new UberOrderActionService(
    { enqueue } as unknown as UberOrderActionRepositoryPort,
    {} as UberOrderActionGatewayPort,
  );

describe('Uber order admission flow', () => {
  it('queues one DENY only after admission rejects a missing published mapping', async () => {
    const enqueue: EnqueueMock = jest
      .fn()
      .mockResolvedValue({ taskId: 'deny-1', created: true });
    const saveImportedOrder = jest.fn();
    const getPosStoreConnectivity = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn().mockResolvedValue([]),
        getPosStoreConnectivity,
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        externalOrderId: 'order-1',
        action: 'DENY',
        reasonCode: 'ITEM_UNAVAILABLE',
        reasonDetail: '缺失菜单映射: item-1',
      }),
    );
    expect(getPosStoreConnectivity).not.toHaveBeenCalled();
    expect(saveImportedOrder).not.toHaveBeenCalled();
  });

  it('persists a mapped POS_OFFLINE denial with the order instead of dispatching it inline', async () => {
    const enqueue: EnqueueMock = jest.fn();
    const saved: { input?: ImportedOrderInput } = {};
    const saveImportedOrder = jest.fn((input: ImportedOrderInput) => {
      saved.input = input;
      return Promise.resolve({
        orderId: 'local-1',
        created: true,
        action: { taskId: 'deny-1', created: true },
      });
    });
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn().mockResolvedValue(menuMappings),
        getPosStoreConnectivity: jest.fn().mockResolvedValue({
          status: 'OFFLINE',
          lastHeartbeatAt: null,
        }),
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(saveImportedOrder).toHaveBeenCalledTimes(1);
    expect(saved.input?.actionIntent).toMatchObject({
      externalOrderId: 'order-1',
      action: 'DENY',
      reasonCode: 'POS_OFFLINE',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('processes cancellation context without running new-order connectivity admission', async () => {
    const enqueue: EnqueueMock = jest.fn();
    const getPosStoreConnectivity = jest.fn();
    const saved: { input?: ImportedOrderInput } = {};
    const saveImportedOrder = jest.fn((input: ImportedOrderInput) => {
      saved.input = input;
      return Promise.resolve({
        orderId: 'local-1',
        created: false,
        action: null,
      });
    });
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn().mockResolvedValue(menuMappings),
        getPosStoreConnectivity,
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute('orders.cancelled', 'event-2', notification);

    expect(getPosStoreConnectivity).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(saved.input?.cancellation).toMatchObject({ kind: 'CANCELLED' });
    expect(saved.input?.actionIntent).toBeNull();
  });
});
