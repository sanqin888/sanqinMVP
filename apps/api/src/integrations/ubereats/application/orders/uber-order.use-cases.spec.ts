import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';
import { UberOrderActionService } from './uber-order-action.service';
import type { UberOrderNotificationEventV1 } from '../../domain/webhook/uber-webhook-event.parser';
import type {
  UberOrderActionGatewayPort,
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
  UberOrderImportRepositoryPort,
} from './uber-order.ports';
import { UberOrderPayloadParser } from '../../domain/orders/uber-order-payload.parser';

type ImportedOrderInput = Parameters<
  UberOrderImportRepositoryPort['saveImportedOrder']
>[0];
type SaveExistingOrderCancellationMock = jest.MockedFunction<
  UberOrderImportRepositoryPort['saveExistingOrderCancellation']
>;

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/uber-contract/v1/orders', name),
      'utf8',
    ),
  ) as unknown;

const notification = {
  resourceId: 'fixture-order-immediate',
  resourceHref:
    'https://api.uber.com/v1/delivery/order/fixture-order-immediate',
} as UberOrderNotificationEventV1;
const parsedOrder = new UberOrderPayloadParser().parse(fixture('detail.json'), {
  eventType: 'orders.notification',
})!;
const parsedDetail = { kind: 'parsed' as const, order: parsedOrder };

const createActions = () =>
  new UberOrderActionService(
    { enqueue: jest.fn() } as unknown as UberOrderActionRepositoryPort,
    {} as UberOrderActionGatewayPort,
  );

const mapping = {
  uberStoreId: 'fixture-store-001',
  isProvisioned: true,
  posExternalStoreId: '4750_Yonge_Street',
};

const importedMenuMapping = {
  externalItemId: 'sanq:item-1',
  menuItemStableId: 'menu-1',
  expectedPriceCents: 1000,
};

describe('Uber order use-case boundaries', () => {
  it.each([
    [
      'terminal',
      {
        category: 'authentication',
        code: 'UBER_SCOPE_INSUFFICIENT',
        retryable: false,
      },
    ],
    [
      'transient',
      {
        category: 'transient-upstream',
        code: 'UBER_NETWORK_ERROR',
        retryable: true,
      },
    ],
  ] as const)(
    'propagates a %s order-detail failure without importing or denying',
    async (_kind, gatewayError) => {
      const repository = {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn(),
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder: jest.fn(),
      };
      const actions = { request: jest.fn() };
      const fetchOrderDetail = jest.fn().mockRejectedValue(gatewayError);
      const useCase = new ImportUberOrderUseCase(
        repository,
        { fetchOrderDetail },
        actions as unknown as UberOrderActionService,
        { findMapping: jest.fn() } as never,
      );

      await expect(
        useCase.execute('orders.notification', 'event-1', notification),
      ).rejects.toBe(gatewayError);
      expect(repository.saveImportedOrder).not.toHaveBeenCalled();
      expect(actions.request).not.toHaveBeenCalled();
    },
  );

  it('denies an invalid normal-order detail but does not import it', async () => {
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue(null),
      findMenuMappings: jest.fn(),
      saveExistingOrderCancellation: jest.fn(),
      saveImportedOrder: jest.fn(),
    };
    const actions = { request: jest.fn().mockResolvedValue(undefined) };
    const useCase = new ImportUberOrderUseCase(
      repository,
      {
        fetchOrderDetail: jest
          .fn()
          .mockResolvedValue({ kind: 'invalid', reason: 'MISSING_TOTAL' }),
      },
      actions as unknown as UberOrderActionService,
      { findMapping: jest.fn() } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);
    expect(actions.request).toHaveBeenCalledWith(
      'fixture-order-immediate',
      'DENY',
      {
        reasonCode: 'INVALID_ORDER',
        reasonDetail: '订单缺少订单金额',
      },
    );
    expect(repository.saveImportedOrder).not.toHaveBeenCalled();
  });

  it('commits the ACCEPT intent with a valid v1 order import', async () => {
    const saved: { order?: ImportedOrderInput } = {};
    const repository: UberOrderImportRepositoryPort = {
      findByExternalOrderId: jest.fn().mockResolvedValue(null),
      findMenuMappings: jest.fn().mockResolvedValue([importedMenuMapping]),
      saveExistingOrderCancellation: jest.fn(),
      saveImportedOrder: jest.fn((order: ImportedOrderInput) => {
        saved.order = order;
        return Promise.resolve({
          orderId: 'local-1',
          created: true,
          action: { taskId: 'action-1', created: true },
        });
      }),
    };
    const actions = createActions();
    const request = jest.spyOn(actions, 'request');
    const findMapping = jest.fn().mockResolvedValue(mapping);
    const useCase = new ImportUberOrderUseCase(
      repository,
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      actions,
      { findMapping } as never,
    );

    await useCase.execute('orders.notification', 'event-1', notification);

    expect(saved.order?.actionIntent).toMatchObject({
      externalOrderId: 'fixture-order-immediate',
      action: 'ACCEPT',
    });
    expect(saved.order?.actionIntent?.idempotencyKey).toMatch(/^sanqin-uber-/);
    expect(saved.order?.order.fulfillmentTiming).toBe('IMMEDIATE');
    expect(saved.order?.order.scheduledReadyAt).toBeNull();
    expect(saved.order?.posStoreId).toBe('4750_Yonge_Street');
    expect(request).not.toHaveBeenCalled();
  });

  it('persists orders.failure for an existing order without fetching detail', async () => {
    const saveExistingOrderCancellation: SaveExistingOrderCancellationMock =
      jest.fn().mockResolvedValue(undefined);
    const fetchOrderDetail = jest.fn();
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue({
        orderId: 'local-1',
        status: 'making',
        cursor: null,
      }),
      findMenuMappings: jest.fn(),
      saveExistingOrderCancellation,
      saveImportedOrder: jest.fn(),
    };
    const useCase = new ImportUberOrderUseCase(
      repository as UberOrderImportRepositoryPort,
      { fetchOrderDetail },
      { request: jest.fn() } as unknown as UberOrderActionService,
      { findMapping: jest.fn() } as never,
    );

    await useCase.execute('orders.failure', 'failure-1', notification, {
      occurredAt: new Date('2026-08-20T13:40:00.000Z'),
      resourceVersion: null,
      sequence: null,
    });

    expect(fetchOrderDetail).not.toHaveBeenCalled();
    expect(saveExistingOrderCancellation).toHaveBeenCalledTimes(1);
    const savedCancellation = saveExistingOrderCancellation.mock.calls[0]?.[0];
    expect(savedCancellation).toMatchObject({
      orderId: 'local-1',
      externalOrderId: 'fixture-order-immediate',
      cancellation: {
        kind: 'CANCELLED',
        reasonCode: 'UBER_ORDER_FAILURE',
        occurredAt: new Date('2026-08-20T13:40:00.000Z'),
      },
    });
  });

  it('retries an early orders.failure instead of depending on detail availability', async () => {
    const fetchOrderDetail = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn(),
        saveExistingOrderCancellation: jest.fn(),
        saveImportedOrder: jest.fn(),
      },
      { fetchOrderDetail },
      { request: jest.fn() } as unknown as UberOrderActionService,
      { findMapping: jest.fn() } as never,
    );

    await expect(
      useCase.execute('orders.failure', 'failure-early', notification),
    ).rejects.toMatchObject({
      code: 'UBER_ORDER_FAILURE_BEFORE_IMPORT',
      retryable: true,
    });
    expect(fetchOrderDetail).not.toHaveBeenCalled();
  });

  it('treats duplicate event ids as a no-op', async () => {
    const repository = {
      findByExternalOrderId: jest.fn().mockResolvedValue({
        orderId: 'local-1',
        status: 'pending',
        cursor: {
          eventId: 'event-1',
          occurredAt: null,
          resourceVersion: null,
          sequence: null,
        },
      }),
      findMenuMappings: jest.fn(),
      saveExistingOrderCancellation: jest.fn(),
      saveImportedOrder: jest.fn(),
    };
    const fetchOrderDetail = jest.fn();
    const useCase = new ImportUberOrderUseCase(
      repository as UberOrderImportRepositoryPort,
      { fetchOrderDetail },
      { request: jest.fn() } as unknown as UberOrderActionService,
      { findMapping: jest.fn() } as never,
    );
    await useCase.execute('orders.notification', 'event-1', notification);
    expect(fetchOrderDetail).not.toHaveBeenCalled();
    expect(repository.saveImportedOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['accept', ['order-1', 'ACCEPT']],
    [
      'deny',
      [
        'order-1',
        'DENY',
        { reasonCode: 'STORE_CLOSED', reasonDetail: 'closed' },
      ],
    ],
    [
      'cancel',
      ['order-1', 'CANCEL', { reasonCode: 'OTHER', reasonDetail: 'closed' }],
    ],
    ['getReadyForPickupAction', ['order-1', 'READY_FOR_PICKUP']],
  ] as const)(
    '%s delegates its semantic action without building a key',
    async (method, expected) => {
      const request = jest.fn().mockResolvedValue({
        taskId: 'same-task',
        created: false,
      });
      const useCase = new RequestUberOrderActionUseCase({ request } as never);
      const args =
        method === 'deny'
          ? (['order-1', ' STORE_CLOSED ', 'closed'] as const)
          : method === 'cancel'
            ? (['order-1', ' closed '] as const)
            : (['order-1'] as const);
      const result = await (
        useCase[method] as (...input: never[]) => Promise<unknown>
      )(...(args as never[]));
      expect(request).toHaveBeenCalledWith(...expected);
      expect(result).toMatchObject({ duplicate: true, actionId: 'same-task' });
    },
  );

  it('claims a batch and delegates every claimed task to the action service', async () => {
    const tasks = [
      { taskId: 'task-1' },
      { taskId: 'task-2' },
    ] as UberOrderActionTask[];
    const claim = jest.fn().mockResolvedValue(tasks);
    const executeClaimed = jest.fn().mockResolvedValue(undefined);
    const worker = new ExecuteUberOrderActionWorker(
      { claim } as unknown as UberOrderActionRepositoryPort,
      { executeClaimed } as unknown as UberOrderActionService,
    );
    await expect(worker.execute(50)).resolves.toBe(2);
    expect(executeClaimed).toHaveBeenCalledTimes(2);
  });
});
