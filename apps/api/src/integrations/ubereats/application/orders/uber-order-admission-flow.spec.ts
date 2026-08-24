import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
type SaveExistingOrderCancellationMock = jest.MockedFunction<
  UberOrderImportRepositoryPort['saveExistingOrderCancellation']
>;

const fixture: unknown = JSON.parse(
  readFileSync(
    join(__dirname, '../../test/fixtures/uber-contract/v1/orders/detail.json'),
    'utf8',
  ),
) as unknown;
const parsedDetail = {
  kind: 'parsed' as const,
  order: new UberOrderPayloadParser().parse(fixture, {
    eventType: 'orders.notification',
  })!,
};
const notification = {
  resourceId: 'fixture-order-immediate',
  resourceHref:
    'https://api.uber.com/v1/delivery/order/fixture-order-immediate',
} as UberOrderNotificationEventV1;
const storeMapping = {
  uberStoreId: 'fixture-store-001',
  isProvisioned: true,
  posExternalStoreId: 'pos-store-1',
};
const menuMappings = [
  {
    externalItemId: 'sanq:item-1',
    menuItemStableId: 'menu-1',
    expectedPriceCents: 1000,
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
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        externalOrderId: 'fixture-order-immediate',
        action: 'DENY',
        reasonCode: 'ITEM_UNAVAILABLE',
        reasonDetail: '缺失菜单映射: sanq:item-1',
      }),
    );
    expect(getPosStoreConnectivity).not.toHaveBeenCalled();
    expect(saveImportedOrder).not.toHaveBeenCalled();
  });

  it('queues a standalone DENY and never imports when StoreConfig blocks a structured allergen', async () => {
    const enqueue: EnqueueMock = jest
      .fn()
      .mockResolvedValue({ taskId: 'deny-allergy-1', created: true });
    const saveImportedOrder = jest.fn();
    const getPosStoreConnectivity = jest.fn();
    const detailWithAllergy = {
      kind: 'parsed' as const,
      order: {
        ...parsedDetail.order,
        allergyRequest: { hasRequest: true, allergens: ['PEANUTS'] },
      },
    };
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn().mockResolvedValue(menuMappings),
        getStoreAllergyPolicy: jest.fn().mockResolvedValue({
          mode: 'DENY_LIST',
          unsupportedAllergens: ['PEANUTS'],
        }),
        getPosStoreConnectivity,
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(detailWithAllergy) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute(
      'orders.notification',
      'event-allergy-1',
      notification,
    );

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        externalOrderId: 'fixture-order-immediate',
        action: 'DENY',
        reasonCode: 'SPECIAL_INSTRUCTIONS',
        reasonDetail:
          'Store cannot safely accommodate requested allergen(s): PEANUTS',
      }),
    );
    expect(saveImportedOrder).not.toHaveBeenCalled();
    expect(getPosStoreConnectivity).not.toHaveBeenCalled();
  });

  it('persists a mapped POS_OFFLINE denial with the order instead of dispatching inline', async () => {
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
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(saved.input?.actionIntent).toMatchObject({
      externalOrderId: 'fixture-order-immediate',
      action: 'DENY',
      reasonCode: 'POS_OFFLINE',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('imports a valid order without ACCEPT when the store disables auto-accept', async () => {
    const enqueue: EnqueueMock = jest.fn();
    const saved: { input?: ImportedOrderInput } = {};
    const saveImportedOrder = jest.fn((input: ImportedOrderInput) => {
      saved.input = input;
      return Promise.resolve({ orderId: 'local-1', created: true, action: null });
    });
    const getStoreAutoAcceptOnlineOrders = jest.fn().mockResolvedValue(false);
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn().mockResolvedValue(menuMappings),
        getPosStoreConnectivity: jest.fn().mockResolvedValue({
          status: 'ONLINE',
          lastHeartbeatAt: new Date(),
        }),
        getStoreAutoAcceptOnlineOrders,
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder,
      },
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      createActions(enqueue),
      { findMapping: jest.fn().mockResolvedValue(storeMapping) } as never,
    );

    await useCase.execute('orders.notification', 'event-manual-1', notification);

    expect(getStoreAutoAcceptOnlineOrders).toHaveBeenCalledWith('pos-store-1');
    expect(saved.input?.actionIntent).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('processes orders.failure directly against the existing order', async () => {
    const enqueue: EnqueueMock = jest.fn();
    const saveExistingOrderCancellation: SaveExistingOrderCancellationMock =
      jest.fn().mockResolvedValue(undefined);
    const fetchOrderDetail = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue({
          orderId: 'local-1',
          status: 'making',
          cursor: null,
        }),
        findMenuMappings: jest.fn(),
        getPosStoreConnectivity: jest.fn(),
        saveExistingOrderCancellation,
        saveImportedOrder: jest.fn(),
      },
      { fetchOrderDetail },
      createActions(enqueue),
      { findMapping: jest.fn() } as never,
    );

    await useCase.execute('orders.failure', 'event-2', notification);

    expect(fetchOrderDetail).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(saveExistingOrderCancellation).toHaveBeenCalledTimes(1);
    const savedCancellation = saveExistingOrderCancellation.mock.calls[0]?.[0];
    expect(savedCancellation).toMatchObject({
      orderId: 'local-1',
      externalOrderId: 'fixture-order-immediate',
      cancellation: { kind: 'CANCELLED' },
    });
  });
});
