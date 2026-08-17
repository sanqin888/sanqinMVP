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
const parsedDetail = {
  kind: 'parsed' as const,
  order: new UberOrderPayloadParser().parse(detail)!,
};

const createActions = () =>
  new UberOrderActionService(
    { enqueue: jest.fn() } as unknown as UberOrderActionRepositoryPort,
    {} as UberOrderActionGatewayPort,
  );

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
        saveImportedOrder: jest.fn(),
      };
      const actions = { request: jest.fn() };
      const fetchOrderDetail = jest.fn().mockRejectedValue(gatewayError);
      const useCase = new ImportUberOrderUseCase(
        repository as never,
        { fetchOrderDetail },
        actions as unknown as UberOrderActionService,
        { findMapping: jest.fn() } as never,
      );

      await expect(
        useCase.execute('orders.notification', 'event-1', notification),
      ).rejects.toBe(gatewayError);
      expect(repository.findMenuMappings).not.toHaveBeenCalled();
      expect(repository.saveImportedOrder).not.toHaveBeenCalled();
      expect(actions.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['MALFORMED_PAYLOAD', '订单详情无法解析'],
    ['EMPTY_ITEMS', '订单不包含可导入商品'],
  ] as const)(
    'denies an invalid order detail: %s',
    async (reason, reasonDetail) => {
      const repository = {
        findByExternalOrderId: jest.fn().mockResolvedValue(null),
        findMenuMappings: jest.fn(),
        saveImportedOrder: jest.fn(),
      };
      const actions = { request: jest.fn().mockResolvedValue(undefined) };
      const useCase = new ImportUberOrderUseCase(
        repository as never,
        {
          fetchOrderDetail: jest
            .fn()
            .mockResolvedValue({ kind: 'invalid', reason }),
        },
        actions as unknown as UberOrderActionService,
        { findMapping: jest.fn() } as never,
      );

      await useCase.execute('orders.notification', 'event-1', notification);

      expect(actions.request).toHaveBeenCalledWith('order-1', 'DENY', {
        reasonCode: 'INVALID_ORDER',
        reasonDetail,
      });
      expect(repository.findMenuMappings).not.toHaveBeenCalled();
      expect(repository.saveImportedOrder).not.toHaveBeenCalled();
    },
  );

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
    const actions = createActions();
    const request = jest.spyOn(actions, 'request');
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
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
      actions,
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
        { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
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
    const actions = createActions();
    const request = jest.spyOn(actions, 'request');
    const useCase = new ImportUberOrderUseCase(
      repository as never,
      { fetchOrderDetail: jest.fn().mockResolvedValue(parsedDetail) },
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
    expect(request).not.toHaveBeenCalled();
  });

  it('treats duplicate event ids as a no-op without creating ACCEPT', async () => {
    const request = jest.fn();
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

    expect(request).not.toHaveBeenCalled();
    expect(repository.findMenuMappings).not.toHaveBeenCalled();
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
      expect(request.mock.calls.flat()).not.toContainEqual(
        expect.stringMatching(/^sanqin-uber-/),
      );
      expect(result).toMatchObject({ duplicate: true, actionId: 'same-task' });
    },
  );

  it('requests a CANCEL durable intent with the merchant reason', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ taskId: 'task-cancel', created: true });
    const useCase = new RequestUberOrderActionUseCase({
      request,
    } as unknown as UberOrderActionService);

    await expect(useCase.cancel('order-1', '商品售罄')).resolves.toMatchObject({
      actionId: 'task-cancel',
      status: 'PENDING',
    });
    expect(request).toHaveBeenCalledWith('order-1', 'CANCEL', {
      reasonCode: 'OTHER',
      reasonDetail: '商品售罄',
    });
  });

  it('claims a batch and delegates every claimed task to the action service', async () => {
    const tasks = [
      { taskId: 'task-1' },
      { taskId: 'task-2' },
    ] as UberOrderActionTask[];
    type ClaimInput = {
      limit: number;
      owner: string;
      now: Date;
      leaseDurationMs: number;
    };
    const claim = jest
      .fn<Promise<UberOrderActionTask[]>, [ClaimInput]>()
      .mockResolvedValue(tasks);
    const executeClaimed = jest.fn().mockResolvedValue(undefined);
    const worker = new ExecuteUberOrderActionWorker(
      { claim } as unknown as UberOrderActionRepositoryPort,
      { executeClaimed } as unknown as UberOrderActionService,
    );
    await expect(worker.execute(50)).resolves.toBe(2);
    const claimInput = claim.mock.calls[0][0];
    expect(claimInput).toMatchObject({ limit: 50, leaseDurationMs: 30_000 });
    expect(claimInput.owner).toMatch(/^worker-/);
    expect(claimInput.now).toBeInstanceOf(Date);
    expect(executeClaimed).toHaveBeenCalledTimes(2);
    expect(executeClaimed).toHaveBeenNthCalledWith(1, tasks[0]);
    expect(executeClaimed).toHaveBeenNthCalledWith(2, tasks[1]);
  });

  it('returns zero without invoking the service for an empty claim', async () => {
    const claim = jest.fn().mockResolvedValue([]);
    const executeClaimed = jest.fn();
    const worker = new ExecuteUberOrderActionWorker(
      { claim } as never,
      { executeClaimed } as never,
    );
    await expect(worker.execute()).resolves.toBe(0);
    expect(executeClaimed).not.toHaveBeenCalled();
  });

  it('does not add a second error protocol around infrastructure failures', async () => {
    const failure = new Error('database unavailable');
    const worker = new ExecuteUberOrderActionWorker(
      { claim: jest.fn().mockResolvedValue([{ taskId: 'task-1' }]) } as never,
      { executeClaimed: jest.fn().mockRejectedValue(failure) } as never,
    );
    await expect(worker.execute()).rejects.toBe(failure);
  });
});
